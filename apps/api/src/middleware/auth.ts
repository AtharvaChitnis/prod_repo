import type { NextFunction, Request, Response } from "express";
import type { Role } from "@quarry/contracts";
import { col, parseObjectId } from "../db.js";
import { HttpError } from "../http.js";
import type { MembershipDoc, UserDoc } from "../types.js";
import { readCookie, verifySession } from "../modules/auth/session.js";

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = readCookie(req.headers.cookie, "quarry_session");
    if (!token) throw new HttpError(401, "unauthenticated", "Sign in required");
    const session = await verifySession(token);
    const userId = parseObjectId(session.userId);
    if (!userId) throw new HttpError(401, "unauthenticated", "Sign in required");
    const user = await col<UserDoc>("users").findOne({ _id: userId });
    if (!user) throw new HttpError(401, "unauthenticated", "Sign in required");

    const requestedWorkspace = parseObjectId(session.workspaceId);
    let membership = requestedWorkspace
      ? await col<MembershipDoc>("memberships").findOne({ userId, workspaceId: requestedWorkspace })
      : null;
    membership ??= await col<MembershipDoc>("memberships").findOne({ userId });
    if (!membership) throw new HttpError(403, "no_workspace", "No workspace access");

    req.auth = {
      userId,
      workspaceId: membership.workspaceId,
      role: membership.role,
      email: user.email,
      name: user.name,
    };
    next();
  } catch (error) {
    next(error instanceof HttpError ? error : new HttpError(401, "unauthenticated", "Sign in required"));
  }
}

export function requireRole(roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      next(new HttpError(403, "forbidden", "Insufficient role"));
      return;
    }
    next();
  };
}
