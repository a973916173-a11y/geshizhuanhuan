import type { Plan } from "@/lib/membership";

/** Effective tier after checking expiry (monthly subscription window). */
export function effectivePlanFromDb(
  plan: string,
  planExpiresAt: Date | null
): Plan {
  if (!planExpiresAt || planExpiresAt.getTime() < Date.now()) return "free";
  if (plan === "max") return "max";
  if (plan === "pro") return "pro";
  return "free";
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Next renewal: **30 days** after active expiry, or from now if already expired. */
export function nextMonthlyExpiry(currentExpiresAt: Date | null): Date {
  const now = Date.now();
  const baseMs =
    currentExpiresAt && currentExpiresAt.getTime() > now ? currentExpiresAt.getTime() : now;
  return new Date(baseMs + THIRTY_DAYS_MS);
}
