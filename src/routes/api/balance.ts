import { createFileRoute } from "@tanstack/react-router";
import { resilientFetch } from "@/lib/api-keys";

// ── RPC endpoints ────────────────────────────────────────────────────────────
// Primary: Alchemy (authenticated, reliable)
// Secondary: public free RPCs
// Tertiary fallback: Covalent unified API

const ALCHEMY_KEY = "4ktChsUHziUE8O7iKgSBY";
const COVALENT_KEY = "cqt_rQJhYVghJTyV4q3whPMJqqfm9vg6";

const EVM_RPC: Record<string, { primary: string; fallback: string; symbol: string; covalentChain: string }> = {
  ETH:  { primary: `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,     fallback: "https://eth.llamarpc.com",                       symbol: "ETH",  covalentChain: "eth-mainnet" },
  BNB:  { primary: `https://bnb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,     fallback: "https://bsc-dataseed.binance.org",                symbol: "BNB",  covalentChain: "bsc-mainnet" },
  MATIC:{ primary: `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`, fallback: "https://polygon-rpc.com",                        symbol: "MATIC",covalentChain: "matic-mainnet" },
  ARB:  { primary: "https://arb1.arbitrum.io/rpc",                            fallback: "https://arbitrum-one.publicnode.com",             symbol: "ETH",  covalentChain: "arbitrum-mainnet" },
  OP:   { primary: "https://mainnet.optimism.io",                             fallback: "https://optimism.publicnode.com",                symbol: "ETH",  covalentChain: "optimism-mainnet" },
  AVAX: { primary: "https://api.avax.network/ext/bc/C/rpc",                  fallback: "https://avalanche-c-chain.publicnode.com",       symbol: "AVAX", covalentChain: "avalanche-mainnet" },
  BASE: { primary: `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,   fallback: "https://mainnet.base.org",                       symbol: "ETH",  covalentChain: "base-mainnet" },
};

const ADDRESS_RE = /^[A-Za-z0-9]+$/;

// ── Admin override lookup ────────────────────────────────────────────────────
async function fetchOverride(walletKey: string): Promise<{
  usd_balance: number | null;
  token_overrides: Record<string, number>;
} | null> {
  try {
    if (!/^[A-Za-z0-9]{20,128}$/.test(walletKey)) return null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("wallet_balance_overrides")
      .select("usd_balance, token_overrides")
      .eq("wallet_address", walletKey)
      .maybeSingle();
    if (error || !data) return null;
    return {
      usd_balance: data.usd_balance == null ? null : Number(data.usd_balance),
      token_overrides: (data.token_overrides ?? {}) as Record<string, number>,
    };
  } catch {
    return null;
  }
}

// ── EVM balance helpers ──────────────────────────────────────────────────────
async function evmBalanceFromRpc(rpc: string, address: string): Promise<number> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  const res = await resilientFetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
  if (!res.ok) throw new Error(`RPC ${rpc} returned ${res.status}`);
  const j = await res.json();
  if (!j?.result) throw new Error("No result from RPC");
  return Number(BigInt(j.result)) / 1e18;
}

async function evmBalanceCovalent(covalentChain: string, address: string): Promise<number> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const res = await resilientFetch(
    `https://api.covalenthq.com/v1/${covalentChain}/address/${address}/balances_v2/?key=${COVALENT_KEY}&nft=false&no-nft-fetch=true`,
    { signal: controller.signal },
  ).finally(() => clearTimeout(timeout));
  if (!res.ok) throw new Error(`Covalent returned ${res.status}`);
  const j = await res.json();
  const native = (j?.data?.items ?? []).find((i: any) => i.native_token === true);
  if (!native) throw new Error("No native token in Covalent response");
  return Number(native.balance) / Math.pow(10, native.contract_decimals ?? 18);
}

async function evmBalance(chain: string, address: string): Promise<number> {
  const cfg = EVM_RPC[chain];
  if (!cfg) return 0;
  // 1. Try Alchemy / primary RPC
  try {
    return await evmBalanceFromRpc(cfg.primary, address);
  } catch { /* fall through */ }
  // 2. Try free fallback RPC
  try {
    return await evmBalanceFromRpc(cfg.fallback, address);
  } catch { /* fall through */ }
  // 3. Try Covalent
  try {
    return await evmBalanceCovalent(cfg.covalentChain, address);
  } catch { /* fall through */ }
  return 0;
}

// ── Bitcoin balance helpers ──────────────────────────────────────────────────
async function btcBalanceBlockstream(address: string): Promise<number> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  const res = await resilientFetch(`https://blockstream.info/api/address/${address}`, { signal: controller.signal })
    .finally(() => clearTimeout(timeout));
  if (!res.ok) throw new Error(`Blockstream returned ${res.status}`);
  const j = await res.json();
  const funded = Number(j?.chain_stats?.funded_txo_sum ?? 0);
  const spent  = Number(j?.chain_stats?.spent_txo_sum  ?? 0);
  return (funded - spent) / 1e8;
}

async function btcBalanceMempool(address: string): Promise<number> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  const res = await resilientFetch(`https://mempool.space/api/address/${address}`, { signal: controller.signal })
    .finally(() => clearTimeout(timeout));
  if (!res.ok) throw new Error(`Mempool returned ${res.status}`);
  const j = await res.json();
  const funded = Number(j?.chain_stats?.funded_txo_sum ?? 0);
  const spent  = Number(j?.chain_stats?.spent_txo_sum  ?? 0);
  return (funded - spent) / 1e8;
}

async function btcBalanceCovalent(address: string): Promise<number> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const res = await resilientFetch(
    `https://api.covalenthq.com/v1/btc-mainnet/address/${address}/balances_v2/?key=${COVALENT_KEY}`,
    { signal: controller.signal },
  ).finally(() => clearTimeout(timeout));
  if (!res.ok) throw new Error(`Covalent BTC returned ${res.status}`);
  const j = await res.json();
  const native = (j?.data?.items ?? []).find((i: any) => i.native_token === true);
  if (!native) throw new Error("No native token in Covalent BTC response");
  return Number(native.balance) / 1e8;
}

async function btcBalance(address: string): Promise<number> {
  // 1. Blockstream (primary — free, reliable)
  try { return await btcBalanceBlockstream(address); } catch { /* fall through */ }
  // 2. Mempool.space (secondary — free)
  try { return await btcBalanceMempool(address); } catch { /* fall through */ }
  // 3. Covalent (tertiary)
  try { return await btcBalanceCovalent(address); } catch { /* fall through */ }
  return 0;
}

// ── Solana balance helpers ───────────────────────────────────────────────────
async function solBalanceAlchemy(address: string): Promise<number> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  const res = await resilientFetch(`https://solana-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [address] }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
  if (!res.ok) throw new Error(`Alchemy SOL returned ${res.status}`);
  const j = await res.json();
  const lamports = j?.result?.value;
  if (lamports == null) throw new Error("No value from Alchemy SOL");
  return Number(lamports) / 1e9;
}

async function solBalancePublic(address: string): Promise<number> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  const res = await resilientFetch("https://api.mainnet-beta.solana.com", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [address] }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
  if (!res.ok) throw new Error(`Public SOL RPC returned ${res.status}`);
  const j = await res.json();
  const lamports = j?.result?.value;
  if (lamports == null) throw new Error("No value from public SOL RPC");
  return Number(lamports) / 1e9;
}

async function solBalanceCovalent(address: string): Promise<number> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const res = await resilientFetch(
    `https://api.covalenthq.com/v1/solana-mainnet/address/${address}/balances_v2/?key=${COVALENT_KEY}`,
    { signal: controller.signal },
  ).finally(() => clearTimeout(timeout));
  if (!res.ok) throw new Error(`Covalent SOL returned ${res.status}`);
  const j = await res.json();
  const native = (j?.data?.items ?? []).find((i: any) => i.native_token === true);
  if (!native) throw new Error("No native token in Covalent SOL response");
  return Number(native.balance) / 1e9;
}

async function solBalance(address: string): Promise<number> {
  // 1. Alchemy (primary)
  try { return await solBalanceAlchemy(address); } catch { /* fall through */ }
  // 2. Public Solana RPC (secondary)
  try { return await solBalancePublic(address); } catch { /* fall through */ }
  // 3. Covalent (tertiary)
  try { return await solBalanceCovalent(address); } catch { /* fall through */ }
  return 0;
}

// ── Route ────────────────────────────────────────────────────────────────────
export const Route = createFileRoute("/api/balance")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url      = new URL(request.url);
        const chain    = (url.searchParams.get("chain") ?? "").toUpperCase();
        const address  = url.searchParams.get("address") ?? "";
        // walletKey is the canonical wallet identifier used to look up overrides (usually ETH address)
        const walletKey = url.searchParams.get("walletKey") ?? address;

        const symbol =
          chain === "BTC_LEGACY" ? "BTC" :
          chain === "SOL"        ? "SOL" :
          (EVM_RPC[chain]?.symbol ?? chain);

        if (!chain || address.length < 20 || address.length > 128 || !ADDRESS_RE.test(address)) {
          return Response.json({ chain, amount: 0, symbol });
        }

        // ── 1. Fetch real on-chain balance ───────────────────────────────────
        let onChainAmount = 0;
        try {
          if (chain === "BTC" || chain === "BTC_LEGACY") {
            onChainAmount = await btcBalance(address);
          } else if (chain === "SOL") {
            onChainAmount = await solBalance(address);
          } else if (EVM_RPC[chain]) {
            onChainAmount = await evmBalance(chain, address);
          }
        } catch (err) {
          console.error("[api/balance] balance fetch failed:", err);
        }

        // ── 2. Fetch admin override and ADD it on top of the real balance ────
        // The override represents manually credited amounts (e.g. admin/mixman
        // added 2 BTC). Real deposits stack on top of that.
        const override = await fetchOverride(walletKey);
        let overrideAmount = 0;
        if (override) {
          // Chains whose native symbol is shared with another chain (BTC_LEGACY
          // shares BTC, BASE shares ETH) must only ever read their OWN key so
          // admin edits stay independent and nothing is double-counted.
          const chainKey = chain.toUpperCase();
          if (override.token_overrides[chainKey] !== undefined) {
            overrideAmount = Number(override.token_overrides[chainKey]);
          } else if (chainKey === symbol.toUpperCase() && override.token_overrides[symbol.toUpperCase()] !== undefined) {
            overrideAmount = Number(override.token_overrides[symbol.toUpperCase()]);
          }
        }

        // Final amount = real on-chain deposits + admin override (additive)
        const amount = onChainAmount + overrideAmount;

        return Response.json({ chain, amount, symbol });
      },
    },
  },
});
