export type Plan = "free" | "pro" | "max";

const KEY_PLAN = "uc_plan_v1";
/** Public-facing tier key (requested for integrations). Kept in sync with KEY_PLAN. */
export const KEY_USER_TIER = "user_tier";

const FREE_MAX_BYTES = 100 * 1024 * 1024;
const PRO_MAX_BYTES = 500 * 1024 * 1024;
const MAX_MAX_BYTES = Number.MAX_SAFE_INTEGER;

/** Demo / offline fallback only — signed-in users use server session (`effectivePlan`). */
export function getPlan(): Plan {
  if (typeof window === "undefined") return "free";
  const v =
    localStorage.getItem(KEY_PLAN) ?? localStorage.getItem(KEY_USER_TIER);
  if (v === "max") return "max";
  return v === "pro" ? "pro" : "free";
}

export function setPlan(plan: Plan) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_PLAN, plan);
  const tier = plan === "free" ? "free" : plan;
  localStorage.setItem(KEY_USER_TIER, tier);
}

export function getMaxFileBytesForPlan(tier: Plan): number {
  if (tier === "max") return MAX_MAX_BYTES;
  if (tier === "pro") return PRO_MAX_BYTES;
  return FREE_MAX_BYTES;
}

/** Prefer passing explicit plan from session when authenticated. */
export function getMaxFileBytes(): number {
  const tier = getPlan();
  return getMaxFileBytesForPlan(tier);
}

export function getRemainingConversionsToday(): number {
  return 999;
}

export function consumeConversions(count: number): boolean {
  if (count <= 0) return true;
  return true;
}

export function isProTier(tier: Plan): boolean {
  return tier === "pro" || tier === "max";
}

export function isPro(): boolean {
  const tier = getPlan();
  return isProTier(tier);
}
