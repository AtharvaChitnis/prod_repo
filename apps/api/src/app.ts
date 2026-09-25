import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import { API_PREFIX } from "@quarry/contracts";
import { openApiDocument, routeCatalog } from "./catalog.js";
import { config } from "./config.js";
import { pingMongo } from "./db.js";
import { sendError } from "./http.js";
import { log } from "./logger.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { billingRouter, billingWebhook } from "./modules/billing/billing.routes.js";
import { fileRouter } from "./modules/files/files.routes.js";
import { projectRouter } from "./modules/projects/projects.routes.js";
import { resultRouter } from "./modules/results/results.routes.js";
import { searchRouter } from "./modules/retrieval/search.routes.js";
import { taskRouter } from "./modules/tasks/tasks.routes.js";
import { workspaceRouter } from "./modules/workspaces/workspaces.routes.js";
import "./types.js";

export function createApp(): express.Express {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    req.requestId = req.get("x-request-id") || randomUUID();
    res.setHeader("x-request-id", req.requestId);
    const started = Date.now();
    res.on("finish", () => {
      log("info", "request", {
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        latencyMs: Date.now() - started,
        userId: req.auth?.userId.toHexString(),
        workspaceId: req.auth?.workspaceId.toHexString(),
      });
    });
    next();
  });
  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(cors({ origin: config.webOrigin, credentials: true }));
  // Stripe signature checks need the raw body, so this route is registered before JSON parsing.
  app.post(`${API_PREFIX}/billing/webhook`, express.raw({ type: "application/json" }), billingWebhook);
  app.use(express.json({ limit: "1mb" }));
  app.use(rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  app.get(`${API_PREFIX}/health`, (_req, res) => {
    res.json({ status: "ok" });
  });
  app.get(`${API_PREFIX}/ready`, async (_req, res) => {
    try {
      await pingMongo();
      res.json({ status: "ready" });
    } catch {
      res.status(503).json({ error: { code: "not_ready", message: "Database is unavailable" } });
    }
  });
  app.get(API_PREFIX, (_req, res) => {
    res.json({
      product: "research",
      version: "v1",
      extensions: "Request bodies accept optional metadata. Research tasks also accept options. New export formats and OAuth providers can be added on these paths.",
      endpoints: routeCatalog,
    });
  });
  app.get(`${API_PREFIX}/openapi.json`, (_req, res) => {
    res.json(openApiDocument());
  });

  app.use(API_PREFIX, authRouter);
  app.use(API_PREFIX, workspaceRouter);
  app.use(API_PREFIX, projectRouter);
  app.use(API_PREFIX, fileRouter);
  app.use(API_PREFIX, searchRouter);
  app.use(API_PREFIX, taskRouter);
  app.use(API_PREFIX, resultRouter);
  app.use(API_PREFIX, billingRouter);

  app.use(sendError);
  return app;
}
