import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { ObjectId } from "mongodb";
import { config } from "../../config.js";
import { col } from "../../db.js";
import { asyncRoute, HttpError } from "../../http.js";
import { audit } from "../audit/audit.js";
import { safeReturnTo } from "./returnTo.js";
import { clearSessionCookie, setSessionCookie, signSession } from "./session.js";
import { requireAuth } from "../../middleware/auth.js";
import type { MembershipDoc, SubscriptionDoc, UserDoc, WorkspaceDoc } from "../../types.js";
import { exchangeGoogleCode, googleAuthorizationUrl, googleRedirectUri } from "./googleOAuth.js";

const authLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

function base64url(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export const authRouter = Router();

authRouter.get("/auth/oauth/:provider/start", authLimit, asyncRoute(async (req, res) => {
  if (req.params.provider !== "google") {
    throw new HttpError(404, "unknown_provider", "That sign-in provider is not enabled");
  }
  const missing = [
    !config.googleClientId ? "GOOGLE_CLIENT_ID" : "",
    !config.googleClientSecret ? "GOOGLE_CLIENT_SECRET" : "",
  ].filter(Boolean);
  if (missing.length) {
    throw new HttpError(503, "oauth_not_configured", `Google OAuth is not configured. Set ${missing.join(" and ")} and restart the API.`);
  }
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  const state = base64url(randomBytes(24));
  const returnTo = safeReturnTo(config.webOrigin, typeof req.query.returnTo === "string" ? req.query.returnTo : undefined);
  await col("oauth_states").insertOne({
    state,
    codeVerifier: verifier,
    returnTo,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });
  const redirectUri = googleRedirectUri(config.publicApiUrl);
  res.redirect(googleAuthorizationUrl({
    clientId: config.googleClientId,
    redirectUri,
    state,
    codeChallenge: challenge,
  }));
}));

authRouter.get("/auth/oauth/:provider/callback", asyncRoute(async (req, res) => {
  if (req.params.provider !== "google") {
    throw new HttpError(404, "unknown_provider", "That sign-in provider is not enabled");
  }
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (typeof req.query.error === "string") {
    throw new HttpError(401, "oauth_denied", "Google sign-in was cancelled or denied");
  }
  const stored = await col<{ state: string; codeVerifier: string; returnTo: string }>("oauth_states").findOne({
    state,
    expiresAt: { $gt: new Date() },
  });
  await col("oauth_states").deleteOne({ state });
  if (!stored || !code) throw new HttpError(400, "oauth_state", "Sign-in could not be verified");

  const redirectUri = googleRedirectUri(config.publicApiUrl);
  let profile;
  try {
    profile = await exchangeGoogleCode({
      code,
      codeVerifier: stored.codeVerifier,
      redirectUri,
      clientId: config.googleClientId,
      clientSecret: config.googleClientSecret,
    });
  } catch {
    throw new HttpError(401, "oauth_exchange", "Google sign-in could not be completed");
  }

  const now = new Date();
  const users = col<UserDoc>("users");
  let user = await users.findOne({ googleSub: profile.sub });
  if (!user) {
    const byEmail = await users.findOne({ email: profile.email });
    if (byEmail) {
      await users.updateOne({ _id: byEmail._id }, { $set: { googleSub: profile.sub, lastLoginAt: now, name: profile.name || byEmail.name } });
      user = await users.findOne({ _id: byEmail._id });
    }
  }
  if (!user) {
    const insertedId = new ObjectId();
    user = {
      _id: insertedId,
      email: profile.email,
      name: profile.name || profile.email,
      avatarUrl: profile.picture,
      googleSub: profile.sub,
      createdAt: now,
      lastLoginAt: now,
    };
    await users.insertOne(user);
  } else {
    await users.updateOne({ _id: user._id }, { $set: { lastLoginAt: now, avatarUrl: profile.picture, name: profile.name || user.name } });
  }

  let membership = await col<MembershipDoc>("memberships").findOne({ userId: user._id });
  if (!membership) {
    const workspaceId = new ObjectId();
    const workspace: WorkspaceDoc = {
      _id: workspaceId,
      name: `${user.name.split(" ")[0]}'s workspace`,
      createdAt: now,
      updatedAt: now,
    };
    await col<WorkspaceDoc>("workspaces").insertOne(workspace);
    membership = {
      _id: new ObjectId(),
      workspaceId,
      userId: user._id,
      role: "owner",
      email: user.email,
      createdAt: now,
    };
    await col<MembershipDoc>("memberships").insertOne(membership);
    const subscription: SubscriptionDoc = {
      _id: new ObjectId(),
      workspaceId,
      plan: "free",
      status: "active",
      updatedAt: now,
    };
    await col<SubscriptionDoc>("subscriptions").insertOne(subscription);
  }

  const token = await signSession(user._id.toHexString(), membership.workspaceId.toHexString());
  setSessionCookie(res, token);
  await audit(membership.workspaceId, "auth.login", user._id, { provider: "google" });
  res.redirect(stored.returnTo);
}));

authRouter.post("/auth/logout", asyncRoute(async (_req, res) => {
  clearSessionCookie(res);
  res.status(204).end();
}));

authRouter.get("/auth/me", requireAuth, asyncRoute(async (req, res) => {
  res.json(await accountPayload(req.auth!.userId, req.auth!.workspaceId));
}));

authRouter.get("/users/me", requireAuth, asyncRoute(async (req, res) => {
  res.json(await accountPayload(req.auth!.userId, req.auth!.workspaceId));
}));

async function accountPayload(userId: ObjectId, workspaceId: ObjectId) {
  const user = await col<UserDoc>("users").findOne({ _id: userId });
  const memberships = await col<MembershipDoc>("memberships").find({ userId }).toArray();
  const workspaces = await col<WorkspaceDoc>("workspaces")
    .find({ _id: { $in: memberships.map((item) => item.workspaceId) } })
    .toArray();
  const active = memberships.find((item) => item.workspaceId.equals(workspaceId));
  return {
    user: { id: user?._id.toHexString(), email: user?.email, name: user?.name, avatarUrl: user?.avatarUrl },
    workspace: {
      id: workspaceId.toHexString(),
      role: active?.role,
      name: workspaces.find((item) => item._id.equals(workspaceId))?.name,
    },
    workspaces: workspaces.map((workspace) => ({
      id: workspace._id.toHexString(),
      name: workspace.name,
      role: memberships.find((item) => item.workspaceId.equals(workspace._id))?.role,
    })),
  };
}
