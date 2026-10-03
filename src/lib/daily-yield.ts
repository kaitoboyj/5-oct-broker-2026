// Automatic daily yield. Stored in the token_overrides JSON map with reserved keys:
//   __YRATE  -> daily yield percent (default 10 when missing)
//   __YSTART -> unix ms when the wallet balance first went above zero
// Each full day since __YSTART adds (rate% x current initial balance) to yield.

export const YIELD_RATE_KEY = "__YRATE";
export const YIELD_START_KEY = "__YSTART";
export const DEFAULT_DAILY_YIELD_PCT = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

export function readDailyYieldRate(tokens?: Record<string, number> | null): number {
  const raw = tokens?.[YIELD_RATE_KEY];
  return raw !== undefined && raw !== null && Number.isFinite(Number(raw)) ? Number(raw) : DEFAULT_DAILY_YIELD_PCT;
}

export function readDailyYieldStart(tokens?: Record<string, number> | null): number | null {
  const raw = Number(tokens?.[YIELD_START_KEY]);
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

export function computeAccruedYield(balance: number, ratePct: number, startMs: number | null, nowMs: number): number {
  if (!startMs || !(balance > 0) || !(ratePct > 0)) return 0;
  const days = Math.floor((nowMs - startMs) / DAY_MS);
  if (days <= 0) return 0;
  return days * balance * (ratePct / 100);
}

export function isDailyYieldKey(key: string) {
  return key === YIELD_RATE_KEY || key === YIELD_START_KEY;
}
