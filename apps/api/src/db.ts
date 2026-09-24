import { MongoClient, ObjectId, type Collection, type Document } from "mongodb";
import { config } from "./config.js";
import { log } from "./logger.js";

let client: MongoClient | undefined;
let createdConnections = 0;

export function parseObjectId(id: string | undefined | null): ObjectId | null {
  if (!id || !/^[a-f0-9]{24}$/i.test(id)) return null;
  return new ObjectId(id);
}

export async function connectMongo(): Promise<void> {
  if (client) return;

  // One long-running Render web process, early B2B traffic, short API calls
  // plus occasional research reads. Atlas is assumed to be a 3-member replica.
  // maxPoolSize 20 covers a handful of concurrent requests and two background
  // jobs without reserving a large share of a small cluster's connection limit.
  // minPoolSize 0 avoids holding idle sockets while the service is quiet.
  // Raise minPoolSize if checkout latency after idle periods shows up in logs.
  // maxIdleTimeMS 120s releases unused sockets on a low-traffic instance.
  // socketTimeoutMS 45s covers chunk reads without leaving a hung operation open.
  client = new MongoClient(config.mongoUri, {
    maxPoolSize: 20,
    minPoolSize: 0,
    maxIdleTimeMS: 120_000,
    connectTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
    serverSelectionTimeoutMS: 5_000,
  });

  client.on("connectionCheckOutFailed", (event: { reason?: string }) => {
    log("error", "mongo_pool_checkout_failed", { reason: event.reason ?? "unknown" });
  });
  client.on("connectionCreated", () => {
    createdConnections += 1;
    if (createdConnections === 1 || createdConnections % 25 === 0) {
      log("info", "mongo_connection_created", { totalCreated: createdConnections });
    }
  });

  await client.connect();
  await ensureIndexes();
  log("info", "mongo_connected", {
    maxPoolSize: 20,
    minPoolSize: 0,
    retrieval: config.vectorIndex ? "atlas_vector" : "in_process_hybrid",
  });
}

export function mongoClient(): MongoClient {
  if (!client) throw new Error("Database is not connected");
  return client;
}

export function col<T extends Document>(name: string): Collection<T> {
  return mongoClient().db().collection<T>(name);
}

export async function closeMongo(): Promise<void> {
  await client?.close();
  client = undefined;
}

async function ensureIndexes(): Promise<void> {
  await col("users").createIndex({ email: 1 }, { unique: true });
  await col("users").createIndex({ googleSub: 1 }, { unique: true });
  await col("memberships").createIndex({ workspaceId: 1, userId: 1 }, { unique: true });
  await col("memberships").createIndex({ userId: 1 });
  await col("projects").createIndex({ workspaceId: 1, updatedAt: -1 });
  await col("tasks").createIndex({ workspaceId: 1, projectId: 1, createdAt: -1 });
  await col("tasks").createIndex(
    { workspaceId: 1, idempotencyKey: 1 },
    { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } },
  );
  await col("files").createIndex({ workspaceId: 1, projectId: 1, createdAt: -1 });
  await col("chunks").createIndex({ workspaceId: 1, projectId: 1 });
  await col("chunks").createIndex({ fileId: 1 });
  await col("results").createIndex({ workspaceId: 1, taskId: 1 });
  await col("usage_events").createIndex({ workspaceId: 1, period: 1, type: 1, status: 1 });
  await col("subscriptions").createIndex({ workspaceId: 1 }, { unique: true });
  await col("subscriptions").createIndex({ stripeSubscriptionId: 1 }, { sparse: true });
  await col("oauth_states").createIndex({ state: 1 }, { unique: true });
  await col("oauth_states").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await col("billing_events").createIndex({ eventId: 1 }, { unique: true });
  await col("audit_events").createIndex({ workspaceId: 1, createdAt: -1 });
  await col("ai_runs").createIndex({ workspaceId: 1, createdAt: -1 });
}

export function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}
