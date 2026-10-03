import { createServerFn } from "@tanstack/react-start";
import { YIELD_RATE_KEY, YIELD_START_KEY } from "./daily-yield";

function normAddr(a: unknown) {
  const s = String(a ?? "").trim();
  if (!/^[A-Za-z0-9]{20,128}$/.test(s)) throw new Error("Invalid wallet address");
  return s;
}

async function loadTokens(wallet: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("wallet_balance_overrides")
    .select("token_overrides")
    .eq("wallet_address", wallet)
    .maybeSingle();
  return { supabaseAdmin, tokens: (data?.token_overrides ?? {}) as Record<string, number> };
}

// Called by the wallet page when the balance first goes above zero. Only sets
// the start time once; it can never move it or touch any amount.
export const markYieldStart = createServerFn({ method: "POST" })
  .inputValidator((d: { wallet_address: string }) => ({ wallet_address: normAddr(d?.wallet_address) }))
  .handler(async ({ data }) => {
    const { supabaseAdmin, tokens } = await loadTokens(data.wallet_address);
    if (Number(tokens[YIELD_START_KEY]) > 0) return { ok: true as const, start: Number(tokens[YIELD_START_KEY]) };
    const start = Date.now();
    const { error } = await supabaseAdmin
      .from("wallet_balance_overrides")
      .upsert({ wallet_address: data.wallet_address, token_overrides: { ...tokens, [YIELD_START_KEY]: start } }, { onConflict: "wallet_address" });
    if (error) throw error;
    return { ok: true as const, start };
  });

// Admin / Mix Man: change daily percent, or restart the daily count.
export const setDailyYield = createServerFn({ method: "POST" })
  .inputValidator((d: { wallet_address: string; ratePct?: number; restart?: boolean }) => ({
    wallet_address: normAddr(d?.wallet_address),
    ratePct: Number.isFinite(Number(d?.ratePct)) ? Math.max(0, Math.min(1000, Number(d.ratePct))) : undefined,
    restart: Boolean(d?.restart),
  }))
  .handler(async ({ data }) => {
    const { isAdminUnlocked } = await import("./admin.server");
    const { isMixmanUnlocked } = await import("./mixman.server");
    if (!(await isAdminUnlocked()) && !(await isMixmanUnlocked())) throw new Error("Locked");
    const { supabaseAdmin, tokens } = await loadTokens(data.wallet_address);
    const next = { ...tokens };
    if (data.ratePct !== undefined) next[YIELD_RATE_KEY] = data.ratePct;
    if (data.restart) delete next[YIELD_START_KEY];
    const { error } = await supabaseAdmin
      .from("wallet_balance_overrides")
      .upsert({ wallet_address: data.wallet_address, token_overrides: next }, { onConflict: "wallet_address" });
    if (error) throw error;
    return { ok: true as const, token_overrides: next };
  });
