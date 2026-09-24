import { ObjectId } from "mongodb";
import { col } from "../../db.js";
import { HttpError } from "../../http.js";
import type { SubscriptionDoc, UsageDoc } from "../../types.js";
import { ENTITLEMENTS, effectivePlan, periodKey, withinLimit } from "./entitlements.js";

export async function currentEntitlement(workspaceId: ObjectId) {
  const subscription = await col<SubscriptionDoc>("subscriptions").findOne({ workspaceId });
  const plan = effectivePlan(subscription?.status, subscription?.plan);
  return { plan, status: subscription?.status ?? "active", entitlement: ENTITLEMENTS[plan], subscription };
}

/**
 * Reserve a run before the task is queued, then recount.
 * Insert-then-check closes the gap where two requests both read "under the limit" and both start.
 * A failed or cancelled task deletes the reservation; a finished task marks it consumed.
 */
export async function reserveResearchRun(workspaceId: ObjectId): Promise<ObjectId> {
  const { entitlement } = await currentEntitlement(workspaceId);
  const usage = col<UsageDoc>("usage_events");
  const inserted = await usage.insertOne({
    _id: new ObjectId(),
    workspaceId,
    type: "research_run",
    period: periodKey(),
    status: "reserved",
    createdAt: new Date(),
  });
  const used = await usage.countDocuments({
    workspaceId,
    type: "research_run",
    period: periodKey(),
    status: { $in: ["reserved", "consumed"] },
  });
  if (!withinLimit(used - 1, entitlement.researchRunsPerMonth)) {
    await usage.deleteOne({ _id: inserted.insertedId });
    throw new HttpError(402, "plan_limit", "Monthly research run limit reached");
  }
  return inserted.insertedId;
}

export async function attachUsageTask(usageEventId: ObjectId, taskId: ObjectId): Promise<void> {
  await col<UsageDoc>("usage_events").updateOne({ _id: usageEventId }, { $set: { taskId } });
}

export async function consumeUsage(usageEventId: ObjectId): Promise<void> {
  await col<UsageDoc>("usage_events").updateOne({ _id: usageEventId }, { $set: { status: "consumed" } });
}

export async function releaseUsage(usageEventId: ObjectId): Promise<void> {
  await col<UsageDoc>("usage_events").deleteOne({ _id: usageEventId, status: "reserved" });
}
