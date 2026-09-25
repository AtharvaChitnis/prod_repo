import type { ObjectId } from "mongodb";
import type { Role } from "@quarry/contracts";

export type AuthContext = {
  userId: ObjectId;
  workspaceId: ObjectId;
  role: Role;
  email: string;
  name: string;
};

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: AuthContext;
    }
  }
}

export type UserDoc = {
  _id: ObjectId;
  email: string;
  name: string;
  avatarUrl?: string;
  googleSub: string;
  createdAt: Date;
  lastLoginAt: Date;
};

export type WorkspaceDoc = {
  _id: ObjectId;
  name: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

export type MembershipDoc = {
  _id: ObjectId;
  workspaceId: ObjectId;
  userId: ObjectId;
  role: Role;
  email: string;
  createdAt: Date;
};

export type SubscriptionDoc = {
  _id: ObjectId;
  workspaceId: ObjectId;
  plan: "free" | "starter" | "pro" | "business";
  status: "trialing" | "active" | "past_due" | "cancelled" | "expired";
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  currentPeriodEnd?: Date;
  updatedAt: Date;
};

export type ProjectDoc = {
  _id: ObjectId;
  workspaceId: ObjectId;
  name: string;
  brief: string;
  metadata?: Record<string, unknown>;
  createdBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type FileDoc = {
  _id: ObjectId;
  workspaceId: ObjectId;
  projectId: ObjectId;
  filename: string;
  contentType: string;
  bytes: number;
  storageKey: string;
  status: "uploaded" | "processing" | "ready" | "failed";
  error?: string;
  chunkCount: number;
  truncated: boolean;
  createdBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export type ChunkDoc = {
  _id: ObjectId;
  workspaceId: ObjectId;
  projectId: ObjectId;
  fileId: ObjectId;
  ordinal: number;
  text: string;
  embedding: number[];
  sourceLabel: string;
  createdAt: Date;
};

export type TaskDoc = {
  _id: ObjectId;
  workspaceId: ObjectId;
  projectId: ObjectId;
  type: "ingest" | "research";
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  input: Record<string, unknown>;
  progress: { step: string; percent: number };
  error?: { code: string; message: string };
  resultId?: ObjectId;
  usageEventId?: ObjectId;
  idempotencyKey?: string;
  cancelRequested?: boolean;
  createdBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
};

export type ResultDoc = {
  _id: ObjectId;
  workspaceId: ObjectId;
  projectId: ObjectId;
  taskId: ObjectId;
  payload: {
    summary: string;
    findings: { claim: string; evidence: string; sourceIds: string[] }[];
    gaps: string[];
    confidence: "low" | "medium" | "high";
  };
  sources: { chunkId: string; fileId: string; label: string; excerpt: string; url?: string }[];
  createdAt: Date;
};

export type UsageDoc = {
  _id: ObjectId;
  workspaceId: ObjectId;
  type: "research_run";
  period: string;
  status: "reserved" | "consumed";
  taskId?: ObjectId;
  createdAt: Date;
};
