import { checkoutSchema } from "@quarry/contracts";
import { Router } from "express";
import Stripe from "stripe";
import { config } from "../../config.js";
import { col, isDuplicateKey, parseObjectId } from "../../db.js";
import { asyncRoute, HttpError, validate } from "../../http.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import type { SubscriptionDoc, UsageDoc } from "../../types.js";
import { audit } from "../audit/audit.js";
import { ENTITLEMENTS, periodKey } from "./entitlements.js";
import { currentEntitlement } from "./usage.js";

export const billingWebhook = asyncRoute(async (req, res) => {
  if (!config.stripeSecretKey || !config.stripeWebhookSecret) {
    throw new HttpError(503, "billing_not_configured", "Stripe is not configured");
  }
  const signature = req.get("stripe-signature");
  if (!signature || !Buffer.isBuffer(req.body)) {
    throw new HttpError(400, "invalid_webhook", "Webhook signature is missing");
  }
  const stripe = stripeClient();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, config.stripeWebhookSecret);
  } catch {
    throw new HttpError(400, "invalid_webhook", "Webhook signature could not be verified");
  }
  const seen = await col("billing_events").findOne({ eventId: event.id });
  if (seen) {
    res.json({ received: true });
    return;
  }
  await applyStripeEvent(event);
  try {
    await col("billing_events").insertOne({ eventId: event.id, type: event.type, createdAt: new Date() });
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
  }
  res.json({ received: true });
});

export const billingRouter = Router();
billingRouter.use(requireAuth);

billingRouter.get("/billing", asyncRoute(async (req, res) => {
  const { plan, status, entitlement, subscription } = await currentEntitlement(req.auth!.workspaceId);
  const runs = await col<UsageDoc>("usage_events").countDocuments({
    workspaceId: req.auth!.workspaceId,
    type: "research_run",
    period: periodKey(),
    status: { $in: ["reserved", "consumed"] },
  });
  const files = await col("files").countDocuments({ workspaceId: req.auth!.workspaceId });
  res.json({
    plan,
    status,
    entitlement,
    usage: { researchRuns: runs, files },
    stripeCustomer: Boolean(subscription?.stripeCustomerId),
    plans: (["free", "starter", "pro", "business"] as const).map((id) => ({
      id,
      entitlement: ENTITLEMENTS[id],
      checkoutReady: id === "free" ? false : Boolean(config.stripePrices[id]),
    })),
  });
}));

billingRouter.get("/usage", asyncRoute(async (req, res) => {
  const { plan, entitlement } = await currentEntitlement(req.auth!.workspaceId);
  const researchRuns = await col<UsageDoc>("usage_events").countDocuments({
    workspaceId: req.auth!.workspaceId,
    type: "research_run",
    period: periodKey(),
    status: { $in: ["reserved", "consumed"] },
  });
  res.json({ period: periodKey(), plan, entitlement, researchRuns });
}));

billingRouter.get("/usage/history", asyncRoute(async (req, res) => {
  const events = await col<UsageDoc>("usage_events")
    .find({ workspaceId: req.auth!.workspaceId })
    .sort({ createdAt: -1 })
    .limit(100)
    .toArray();
  res.json({
    events: events.map((event) => ({
      id: event._id.toHexString(),
      type: event.type,
      period: event.period,
      status: event.status,
      taskId: event.taskId?.toHexString() ?? null,
      createdAt: event.createdAt,
    })),
  });
}));

billingRouter.post("/billing/checkout", requireRole(["owner"]), validate(checkoutSchema), asyncRoute(async (req, res) => {
  const price = config.stripePrices[req.body.plan];
  if (!price) throw new HttpError(503, "billing_not_configured", "That plan is not available for checkout yet");
  const stripe = stripeClient();
  const { subscription } = await currentEntitlement(req.auth!.workspaceId);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: subscription?.stripeCustomerId,
    customer_email: subscription?.stripeCustomerId ? undefined : req.auth!.email,
    client_reference_id: req.auth!.workspaceId.toHexString(),
    line_items: [{ price, quantity: 1 }],
    success_url: `${config.webOrigin}/app/billing?checkout=success`,
    cancel_url: `${config.webOrigin}/app/billing?checkout=cancel`,
    metadata: { workspaceId: req.auth!.workspaceId.toHexString(), plan: req.body.plan },
    subscription_data: {
      metadata: { workspaceId: req.auth!.workspaceId.toHexString(), plan: req.body.plan },
    },
  });
  res.json({ url: session.url });
}));

billingRouter.post("/billing/portal", requireRole(["owner"]), asyncRoute(async (req, res) => {
  const { subscription } = await currentEntitlement(req.auth!.workspaceId);
  if (!subscription?.stripeCustomerId) throw new HttpError(409, "no_subscription", "No Stripe customer for this workspace");
  const session = await stripeClient().billingPortal.sessions.create({
    customer: subscription.stripeCustomerId,
    return_url: `${config.webOrigin}/app/billing`,
  });
  res.json({ url: session.url });
}));

function stripeClient(): Stripe {
  if (!config.stripeSecretKey) throw new HttpError(503, "billing_not_configured", "Stripe is not configured");
  return new Stripe(config.stripeSecretKey);
}

async function applyStripeEvent(event: Stripe.Event): Promise<void> {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const workspaceId = parseObjectId(session.metadata?.workspaceId ?? session.client_reference_id);
    const plan = session.metadata?.plan;
    if (!workspaceId || (plan !== "starter" && plan !== "pro" && plan !== "business")) return;
    await col<SubscriptionDoc>("subscriptions").updateOne(
      { workspaceId },
      {
        $set: {
          plan,
          status: "active",
          stripeCustomerId: stringId(session.customer),
          stripeSubscriptionId: stringId(session.subscription),
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
    await audit(workspaceId, "billing.checkout_completed", undefined, { plan });
    return;
  }

  if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
    const subscription = event.data.object;
    const workspaceId = parseObjectId(subscription.metadata?.workspaceId);
    if (!workspaceId) return;
    const cancelled = event.type === "customer.subscription.deleted" || subscription.status === "canceled";
    const plan = subscription.metadata?.plan;
    await col<SubscriptionDoc>("subscriptions").updateOne(
      { workspaceId },
      {
        $set: {
          plan: cancelled ? "free" : plan === "starter" || plan === "pro" || plan === "business" ? plan : "free",
          status: cancelled ? "cancelled" : mapStatus(subscription.status),
          stripeCustomerId: stringId(subscription.customer),
          stripeSubscriptionId: subscription.id,
          currentPeriodEnd: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : undefined,
          updatedAt: new Date(),
        },
      },
      { upsert: true },
    );
    await audit(workspaceId, "billing.subscription_changed", undefined, { status: subscription.status });
  }
}

function mapStatus(status: Stripe.Subscription.Status): SubscriptionDoc["status"] {
  if (status === "trialing") return "trialing";
  if (status === "active") return "active";
  if (status === "past_due" || status === "unpaid" || status === "incomplete") return "past_due";
  if (status === "incomplete_expired") return "expired";
  return "cancelled";
}

function stringId(value: string | { id: string } | null | undefined): string | undefined {
  if (!value) return undefined;
  return typeof value === "string" ? value : value.id;
}
