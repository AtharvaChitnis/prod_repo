import { MongoClient, ObjectId, type Collection, type CreateIndexesOptions, type Document, type IndexSpecification } from "mongodb";
import { config } from "./config.js";
import { log } from "./logger.js";
import { databaseName, mongoErrorFields } from "./mongoError.js";

let client: MongoClient | undefined;
let activeDatabase = "quarry";
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
  activeDatabase = databaseName(config.mongoUri);
  client = new MongoClient(config.mongoUri, {
    maxPoolSize: 20,
    minPoolSize: 0,
    maxIdleTimeMS: 120_000,
    connectTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
    serverSelectionTimeoutMS: 8_000,
  });

  client.on("connectionCheckOutFailed", (event: { reason?: string; error?: unknown }) => {
    log("error", "mongo_pool_checkout_failed", {
      reason: event.reason ?? "unknown",
      ...mongoErrorFields(event.error),
    });
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
    database: activeDatabase,
    maxPoolSize: 20,
    minPoolSize: 0,
    retrieval: config.vectorIndex ? "atlas_vector" : "in_process_hybrid",
  });
}

export async function pingMongo(): Promise<void> {
  await mongoClient().db(activeDatabase).command({ ping: 1 });
}

export function mongoClient(): MongoClient {
  if (!client) throw new Error("Database is not connected");
  return client;
}

export function col<T extends Document>(name: string): Collection<T> {
  return mongoClient().db(activeDatabase).collection<T>(name);
}

export async function closeMongo(): Promise<void> {
  await client?.close();
  client = undefined;
  activeDatabase = "quarry";
}

async function ensureIndexes(): Promise<void> {
  const indexes: Array<[string, IndexSpecification, CreateIndexesOptions?]> = [
    ["users", { email: 1 }, { unique: true }],
    ["users", { googleSub: 1 }, { unique: true }],
    ["memberships", { workspaceId: 1, userId: 1 }, { unique: true }],
    ["memberships", { userId: 1 }],
    ["projects", { workspaceId: 1, updatedAt: -1 }],
    ["tasks", { workspaceId: 1, projectId: 1, createdAt: -1 }],
    ["tasks", { workspaceId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } }],
    ["files", { workspaceId: 1, projectId: 1, createdAt: -1 }],
    ["chunks", { workspaceId: 1, projectId: 1 }],
    ["chunks", { fileId: 1 }],
    ["results", { workspaceId: 1, taskId: 1 }],
    ["usage_events", { workspaceId: 1, period: 1, type: 1, status: 1 }],
    ["subscriptions", { workspaceId: 1 }, { unique: true }],
    ["subscriptions", { stripeSubscriptionId: 1 }, { sparse: true }],
    ["oauth_states", { state: 1 }, { unique: true }],
    ["oauth_states", { expiresAt: 1 }, { expireAfterSeconds: 0 }],
    ["billing_events", { eventId: 1 }, { unique: true }],
    ["audit_events", { workspaceId: 1, createdAt: -1 }],
    ["ai_runs", { workspaceId: 1, createdAt: -1 }],
  ];
  for (const [name, spec, options] of indexes) {
    try {
      await col(name).createIndex(spec, options);
    } catch (error) {
      const fields = mongoErrorFields(error);
      throw Object.assign(new Error(`Index on ${name} failed: ${fields.message}`), fields);
    }
  }
}

export function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}
