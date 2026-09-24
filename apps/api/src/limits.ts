import type { Request } from "express";
import rateLimit from "express-rate-limit";

/** Prefer the signed-in user so one shared office IP does not exhaust everyone else's budget. */
export function perActorLimit(limit: number) {
  return rateLimit({
    windowMs: 60_000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => req.auth?.userId.toHexString() ?? req.ip ?? "anonymous",
  });
}
