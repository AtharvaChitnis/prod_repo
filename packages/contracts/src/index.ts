import { z } from "zod";

/**
 * Shared request contracts. Bodies keep `metadata` and, where noted, `options`
 * so a route can gain product fields without a new API version.
 */
export const metadataSchema = z.record(z.string(), z.unknown()).optional();

export const planIdSchema = z.enum(["free", "starter", "pro", "business"]);
export type PlanId = z.infer<typeof planIdSchema>;

export const roleSchema = z.enum(["owner", "admin", "member"]);
export type Role = z.infer<typeof roleSchema>;

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(160),
  brief: z.string().trim().max(8000).optional(),
  metadata: metadataSchema,
});

export const patchProjectSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  brief: z.string().trim().max(8000).optional(),
  metadata: metadataSchema,
});

export const createResearchTaskSchema = z.object({
  projectId: z.string().regex(/^[a-f0-9]{24}$/i),
  question: z.string().trim().min(3).max(4000),
  options: z.record(z.string(), z.unknown()).optional(),
  metadata: metadataSchema,
});

export const searchSchema = z.object({
  query: z.string().trim().min(1).max(2000),
  limit: z.number().int().min(1).max(20).optional(),
  metadata: metadataSchema,
});

export const checkoutSchema = z.object({
  plan: z.enum(["starter", "pro", "business"]),
});

export const patchWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  metadata: metadataSchema,
});

export const inviteMemberSchema = z.object({
  email: z.string().trim().email().max(320),
  role: z.enum(["admin", "member"]),
});

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(160),
  metadata: metadataSchema,
});

export const researchFindingSchema = z.object({
  claim: z.string().min(1).max(2000),
  evidence: z.string().min(1).max(4000),
  sourceIds: z.array(z.string().min(1).max(64)).max(12),
});

export const researchResultSchema = z.object({
  summary: z.string().min(1).max(6000),
  findings: z.array(researchFindingSchema).max(12),
  gaps: z.array(z.string().min(1).max(1000)).max(8),
  confidence: z.enum(["low", "medium", "high"]),
});

export type ResearchResult = z.infer<typeof researchResultSchema>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export const API_PREFIX = "/api/v1";
