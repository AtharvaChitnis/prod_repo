import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(here, "../../../.env") });
dotenv.config({ path: resolve(here, "../.env") });

const isProd = process.env.NODE_ENV === "production";

function optional(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export const config = {
  isProd,
  port: Number(process.env.PORT || 4000),
  mongoUri: optional("MONGO_URI"),
  webOrigin: optional("WEB_ORIGIN") || "http://localhost:5173",
  publicApiUrl: (optional("PUBLIC_API_URL") || `http://localhost:${process.env.PORT || 4000}`).replace(/\/+$/, ""),
  sessionSecret: optional("SESSION_SECRET") || (isProd ? "" : "dev-only-session-secret-change-me"),
  googleClientId: optional("GOOGLE_CLIENT_ID"),
  googleClientSecret: optional("GOOGLE_CLIENT_SECRET"),
  geminiApiKey: optional("GEMINI_API_KEY"),
  geminiModel: optional("GEMINI_MODEL") || "gemini-2.0-flash",
  geminiEmbeddingModel: optional("GEMINI_EMBEDDING_MODEL") || "gemini-embedding-001",
  stripeSecretKey: optional("STRIPE_SECRET_KEY"),
  stripeWebhookSecret: optional("STRIPE_WEBHOOK_SECRET"),
  stripePrices: {
    starter: optional("STRIPE_PRICE_STARTER"),
    pro: optional("STRIPE_PRICE_PRO"),
    business: optional("STRIPE_PRICE_BUSINESS"),
  } as Record<string, string>,
  s3: {
    bucket: optional("S3_BUCKET"),
    region: optional("S3_REGION") || "auto",
    endpoint: optional("S3_ENDPOINT"),
    accessKeyId: optional("S3_ACCESS_KEY_ID"),
    secretAccessKey: optional("S3_SECRET_ACCESS_KEY"),
  },
  localStorageDir: optional("LOCAL_STORAGE_DIR") || "data/objects",
  vectorIndex: optional("VECTOR_INDEX"),
};

export function assertBootConfig(): void {
  if (!config.mongoUri) {
    throw new Error("Missing required environment variable MONGO_URI");
  }
  if (!config.sessionSecret) {
    throw new Error("Missing required environment variable SESSION_SECRET");
  }
}
