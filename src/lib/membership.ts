export type Plan = "guest" | "pro";

const KEY_PLAN = "uc_plan_v1";
const KEY_QUOTA = "uc_quota_v1";

const GUEST_MAX_BYTES = 5 * 1024 * 1024;
const PRO_MAX_BYTES = 100 * 1024 * 1024;
const GUEST_DAILY_CONVERSIONS = 3;

type QuotaRecord = { date: string; used: number };

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function getPlan(): Plan {
  if (typeof window === "undefined") return "guest";
  const v = localStorage.getItem(KEY_PLAN);
  return v === "pro" ? "pro" : "guest";
}

export function setPlan(plan: Plan) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_PLAN, plan);
}

export function getMaxFileBytes(): number {
  return getPlan() === "pro" ? PRO_MAX_BYTES : GUEST_MAX_BYTES;
}

/** Remaining conversion credits today (guest only). Pro returns a large sentinel for display. */
export function getRemainingConversionsToday(): number {
  if (getPlan() === "pro") return 999;
  const key = todayKey();
  const raw = localStorage.getItem(KEY_QUOTA);
  let used = 0;
  if (raw) {
    try {
      const q = JSON.parse(raw) as QuotaRecord;
      if (q.date === key) used = q.used;
    } catch {
      used = 0;
    }
  }
  return Math.max(0, GUEST_DAILY_CONVERSIONS - used);
}

/** Returns false if guest exceeded daily limit. */
export function consumeConversions(count: number): boolean {
  if (count <= 0) return true;
  if (getPlan() === "pro") return true;
  const key = todayKey();
  const raw = localStorage.getItem(KEY_QUOTA);
  let used = 0;
  if (raw) {
    try {
      const q = JSON.parse(raw) as QuotaRecord;
      if (q.date === key) used = q.used;
    } catch {
      used = 0;
    }
  }
  const next = used + count;
  if (next > GUEST_DAILY_CONVERSIONS) return false;
  const record: QuotaRecord = { date: key, used: next };
  localStorage.setItem(KEY_QUOTA, JSON.stringify(record));
  return true;
}

export function isPro(): boolean {
  return getPlan() === "pro";
}
