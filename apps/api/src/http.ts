import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import type { ZodSchema } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export class CancelledError extends Error {
  constructor() {
    super("Task cancelled");
  }
}

export function asyncRoute(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function validate<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      next(new HttpError(400, "validation_error", "Request validation failed", parsed.error.flatten()));
      return;
    }
    req.body = parsed.data;
    next();
  };
}

export function sendError(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof multer.MulterError) {
    res.status(413).json({ error: { code: "file_too_large", message: "File exceeds the 50 MB upload limit" } });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }
  const requestId = req.requestId;
  console.log(JSON.stringify({
    level: "error",
    msg: "unhandled_error",
    time: new Date().toISOString(),
    requestId,
    name: err instanceof Error ? err.name : "Error",
  }));
  res.status(500).json({ error: { code: "internal_error", message: "Something went wrong" } });
}
