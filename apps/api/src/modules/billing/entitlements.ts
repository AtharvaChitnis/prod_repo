import type { PlanId } from "@quarry/contracts";

export type Entitlement = {
  researchRunsPerMonth: number;
  maxFiles: number;
  maxFileBytes: number;
};

export const ENTITLEMENTS: Record<PlanId, Entitlement> = {
  free: { researchRunsPerMonth: 10, maxFiles: 5, maxFileBytes: 10 * 1024 * 1024 },
  starter: { researchRunsPerMonth: 100, maxFiles: 50, maxFileBytes: 25 * 1024 * 1024 },
  pro: { researchRunsPerMonth: 500, maxFiles: 250, maxFileBytes: 25 * 1024 * 1024 },
  business: { researchRunsPerMonth: 2000, maxFiles: 2000, maxFileBytes: 50 * 1024 * 1024 },
};

const PLAN_IDS = new Set<string>(["free", "starter", "pro", "business"]);

export function effectivePlan(status: string | undefined, plan: string | undefined): PlanId {
  const known = plan && PLAN_IDS.has(plan) ? (plan as PlanId) : "free";
  if (status === "active" || status === "trialing" || status === "past_due") return known;
  return "free";
}

export function periodKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function withinLimit(used: number, limit: number): boolean {
  return used < limit;
}
