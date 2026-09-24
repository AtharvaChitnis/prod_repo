import {
  createWorkspaceSchema,
  inviteMemberSchema,
  patchWorkspaceSchema,
} from "@quarry/contracts";
import { Router, type Request } from "express";
import { ObjectId } from "mongodb";
import { col, parseObjectId } from "../../db.js";
import { asyncRoute, HttpError, validate } from "../../http.js";
import { requireAuth, requireRole } from "../../middleware/auth.js";
import { audit } from "../audit/audit.js";
import { setSessionCookie, signSession } from "../auth/session.js";
import type { MembershipDoc, SubscriptionDoc, UserDoc, WorkspaceDoc } from "../../types.js";

export const workspaceRouter = Router();
workspaceRouter.use(requireAuth);

workspaceRouter.get("/workspaces", asyncRoute(async (req, res) => {
  const memberships = await col<MembershipDoc>("memberships").find({ userId: req.auth!.userId }).toArray();
  const workspaces = await col<WorkspaceDoc>("workspaces")
    .find({ _id: { $in: memberships.map((item) => item.workspaceId) } })
    .toArray();
  res.json({
    workspaces: workspaces.map((workspace) => ({
      id: workspace._id.toHexString(),
      name: workspace.name,
      metadata: workspace.metadata ?? {},
      role: memberships.find((item) => item.workspaceId.equals(workspace._id))?.role,
    })),
  });
}));

workspaceRouter.post("/workspaces", validate(createWorkspaceSchema), asyncRoute(async (req, res) => {
  const now = new Date();
  const workspace: WorkspaceDoc = {
    _id: new ObjectId(),
    name: req.body.name,
    metadata: req.body.metadata,
    createdAt: now,
    updatedAt: now,
  };
  await col<WorkspaceDoc>("workspaces").insertOne(workspace);
  await col<MembershipDoc>("memberships").insertOne({
    _id: new ObjectId(),
    workspaceId: workspace._id,
    userId: req.auth!.userId,
    role: "owner",
    email: req.auth!.email,
    createdAt: now,
  });
  await col<SubscriptionDoc>("subscriptions").insertOne({
    _id: new ObjectId(),
    workspaceId: workspace._id,
    plan: "free",
    status: "active",
    updatedAt: now,
  });
  await audit(workspace._id, "workspace.created", req.auth!.userId);
  res.status(201).json({ id: workspace._id.toHexString(), name: workspace.name });
}));

workspaceRouter.patch("/workspaces/:id", requireRole(["owner"]), validate(patchWorkspaceSchema), asyncRoute(async (req, res) => {
  const workspaceId = ownedWorkspace(req);
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (req.body.name) patch.name = req.body.name;
  if (req.body.metadata) patch.metadata = req.body.metadata;
  const result = await col<WorkspaceDoc>("workspaces").findOneAndUpdate(
    { _id: workspaceId },
    { $set: patch },
    { returnDocument: "after" },
  );
  if (!result) throw new HttpError(404, "not_found", "Workspace not found");
  res.json({ id: result._id.toHexString(), name: result.name, metadata: result.metadata ?? {} });
}));

workspaceRouter.post("/workspaces/:id/activate", asyncRoute(async (req, res) => {
  const workspaceId = parseObjectId(req.params.id);
  if (!workspaceId) throw new HttpError(404, "not_found", "Workspace not found");
  const membership = await col<MembershipDoc>("memberships").findOne({ workspaceId, userId: req.auth!.userId });
  if (!membership) throw new HttpError(404, "not_found", "Workspace not found");
  const token = await signSession(req.auth!.userId.toHexString(), workspaceId.toHexString());
  setSessionCookie(res, token);
  res.status(204).end();
}));

workspaceRouter.get("/workspaces/:id/members", asyncRoute(async (req, res) => {
  const workspaceId = ownedWorkspace(req);
  const members = await col<MembershipDoc>("memberships").find({ workspaceId }).toArray();
  res.json({
    members: members.map((member) => ({
      userId: member.userId.toHexString(),
      email: member.email,
      role: member.role,
      createdAt: member.createdAt,
    })),
  });
}));

workspaceRouter.post("/workspaces/:id/members", requireRole(["owner", "admin"]), validate(inviteMemberSchema), asyncRoute(async (req, res) => {
  const workspaceId = ownedWorkspace(req);
  if (req.body.role === "admin" && req.auth!.role !== "owner") {
    throw new HttpError(403, "forbidden", "Only an owner can grant admin");
  }
  const user = await col<UserDoc>("users").findOne({ email: req.body.email.toLowerCase() });
  if (!user) throw new HttpError(404, "user_not_registered", "That person needs to sign in once before they can be added");
  const existing = await col<MembershipDoc>("memberships").findOne({ workspaceId, userId: user._id });
  if (existing) throw new HttpError(409, "already_member", "That person is already in the workspace");
  await col<MembershipDoc>("memberships").insertOne({
    _id: new ObjectId(),
    workspaceId,
    userId: user._id,
    role: req.body.role,
    email: user.email,
    createdAt: new Date(),
  });
  await audit(workspaceId, "membership.added", req.auth!.userId, { role: req.body.role });
  res.status(201).json({ userId: user._id.toHexString(), email: user.email, role: req.body.role });
}));

workspaceRouter.delete("/workspaces/:id/members/:userId", requireRole(["owner"]), asyncRoute(async (req, res) => {
  const workspaceId = ownedWorkspace(req);
  const userId = parseObjectId(req.params.userId);
  if (!userId) throw new HttpError(404, "not_found", "Member not found");
  const membership = await col<MembershipDoc>("memberships").findOne({ workspaceId, userId });
  if (!membership) throw new HttpError(404, "not_found", "Member not found");
  if (membership.role === "owner") {
    const owners = await col<MembershipDoc>("memberships").countDocuments({ workspaceId, role: "owner" });
    if (owners <= 1) throw new HttpError(409, "last_owner", "The workspace needs at least one owner");
  }
  await col<MembershipDoc>("memberships").deleteOne({ _id: membership._id });
  await audit(workspaceId, "membership.removed", req.auth!.userId, { role: membership.role });
  res.status(204).end();
}));

function ownedWorkspace(req: Request): ObjectId {
  const workspaceId = parseObjectId(req.params.id);
  if (!workspaceId || !req.auth || !workspaceId.equals(req.auth.workspaceId)) {
    throw new HttpError(404, "not_found", "Workspace not found");
  }
  return workspaceId;
}
