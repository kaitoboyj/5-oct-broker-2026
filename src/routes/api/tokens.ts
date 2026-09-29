import { createFileRoute } from "@tanstack/react-router";
import { resilientFetch } from "@/lib/api-keys";
import {
  KNOWN_SPL_BY_SYMBOL,
  KNOWN_SPL_TOKENS,
  TOKEN_CHAIN_LABEL,
  TOKEN_DISPLAY_NAME,
  listCustomTokens,
  normalizeChain,
  type WalletToken,
} from "@/lib/tokens";


const ALCHEMY_KEY = "4ktChsUHziUE8O7iKgSBY";

const EVM_TOKEN_RPC: Record<string, { rpc: string; platform: string }> = {
  ETH: { rpc: `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`, platform: "ethereum" },
  BNB: { rpc: `https://bnb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`, platform: "binance-smart-chain" },
  MATIC: { rpc: `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`, platform: "polygon-pos" },
  BASE: { rpc: `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`, platform: "base" },
};

const SOL_RPC = `https://solana-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;
const SPL_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

async function jsonRpc(url: string, method: string, params: unknown[], ms = 9_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  const res = await resilientFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
  if (!res.ok) throw new Error(`${method} -> ${res.status}`);
  const j = await res.json();
  if (j?.error) throw new Error(j.error?.message ?? "rpc error");
  return j?.result;
}

async function contractPrices(platform: string, contracts: string[]): Promise<Record<string, number>> {
  if (contracts.length === 0) return {};
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9_000);
    const res = await resilientFetch(
      `https://api.coingecko.com/api/v3/simple/token_price/${platform}?contract_addresses=${contracts
        .slice(0, 40)
        .join(",")}&vs_currencies=usd`,
      { signal: controller.signal },
    ).finally(() => clearTimeout(timeout));
    if (!res.ok) return {};
    const j = (await res.json()) as Record<string, { usd?: number }>;
    const out: Record<string, number> = {};
    for (const [addr, v] of Object.entries(j ?? {})) out[addr.toLowerCase()] = Number(v?.usd ?? 0) || 0;
    return out;
  } catch {
    return {};
  }
}

async function evmTokens(chain: string, address: string): Promise<WalletToken[]> {
  const cfg = EVM_TOKEN_RPC[chain];
  if (!cfg) return [];
  let balances: Array<{ contractAddress: string; tokenBalance: string }> = [];
  try {
    const result = await jsonRpc(cfg.rpc, "alchemy_getTokenBalances", [address, "erc20"]);
    balances = (result?.tokenBalances ?? []).filter(
      (t: any) => t?.tokenBalance && BigInt(t.tokenBalance) > 0n,
    );
  } catch {
    return [];
  }
  balances = balances.slice(0, 15);

  const metas = await Promise.all(
    balances.map(async (t) => {
      try {
        const m = await jsonRpc(cfg.rpc, "alchemy_getTokenMetadata", [t.contractAddress]);
        return { contract: t.contractAddress, raw: t.tokenBalance, meta: m };
      } catch {
        return { contract: t.contractAddress, raw: t.tokenBalance, meta: null };
      }
    }),
  );

  const prices = await contractPrices(cfg.platform, metas.map((m) => m.contract.toLowerCase()));

  const out: WalletToken[] = [];
  for (const m of metas) {
    const decimals = Number(m.meta?.decimals ?? 18);
    const amount = Number(BigInt(m.raw)) / Math.pow(10, Number.isFinite(decimals) ? decimals : 18);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const symbol = String(m.meta?.symbol ?? "TOKEN").toUpperCase().slice(0, 12);
    const price = prices[m.contract.toLowerCase()] ?? 0;
    out.push({
      chain,
      chainName: TOKEN_CHAIN_LABEL[chain] ?? chain,
      symbol,
      name: String(m.meta?.name ?? symbol).slice(0, 40),
      amount,
      price,
      usd: amount * price,
      contract: m.contract,
    });
  }
  return out;
}

async function solTokens(address: string): Promise<WalletToken[]> {
  let accounts: any[] = [];
  try {
    const result = await jsonRpc(SOL_RPC, "getTokenAccountsByOwner", [
      address,
      { programId: SPL_PROGRAM },
      { encoding: "jsonParsed" },
    ]);
    accounts = result?.value ?? [];
  } catch {
    return [];
  }

  const held = accounts
    .map((a) => a?.account?.data?.parsed?.info)
    .filter((i) => i && Number(i?.tokenAmount?.uiAmount ?? 0) > 0)
    .slice(0, 15);
  if (held.length === 0) return [];

  const mints = held.map((h) => String(h.mint));
  const prices = await contractPrices("solana", mints.map((m) => m.toLowerCase()));
  // pump.fun / DEX-only tokens aren't on CoinGecko — fall back to DexScreener.
  const missing = mints.filter((m) => !prices[m.toLowerCase()]);
  const dex = await dexScreenerPrices(missing);

  return held.map((h) => {
    const amount = Number(h.tokenAmount?.uiAmount ?? 0);
    const mint = String(h.mint);
    const price = prices[mint.toLowerCase()] ?? dex[mint.toLowerCase()] ?? 0;
    const known = KNOWN_SPL_TOKENS[mint];
    const symbol = known?.symbol ?? `${mint.slice(0, 4)}…${mint.slice(-4)}`;
    return {
      chain: "SOL",
      chainName: "Solana",
      symbol,
      name: known?.name ?? "SPL token",
      amount,
      price,
      usd: amount * price,
      contract: mint,
    } satisfies WalletToken;
  });
}

/** Live USD prices for Solana mints via DexScreener (covers pump.fun tokens). */
async function dexScreenerPrices(mints: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (mints.length === 0) return out;
  await Promise.all(
    mints.slice(0, 15).map(async (mint) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 9_000);
        const res = await resilientFetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, {
          signal: controller.signal,
        }).finally(() => clearTimeout(timeout));
        if (!res.ok) return;
        const j = (await res.json()) as { pairs?: Array<{ priceUsd?: string; liquidity?: { usd?: number } }> };
        const best = (j.pairs ?? [])
          .slice()
          .sort((a, b) => Number(b.liquidity?.usd ?? 0) - Number(a.liquidity?.usd ?? 0))[0];
        const price = Number(best?.priceUsd ?? 0);
        if (Number.isFinite(price) && price > 0) out[mint.toLowerCase()] = price;
      } catch {
        /* ignore */
      }
    }),
  );
  return out;
}

async function manualTokens(walletKey: string): Promise<WalletToken[]> {
  try {
    if (!/^[A-Za-z0-9]{20,128}$/.test(walletKey)) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("wallet_balance_overrides")
      .select("token_overrides")
      .eq("wallet_address", walletKey)
      .maybeSingle();
    if (error || !data) return [];
    return listCustomTokens((data.token_overrides ?? {}) as Record<string, number>).map((t) => ({
      chain: t.chain,
      chainName: TOKEN_CHAIN_LABEL[t.chain] ?? t.chain,
      symbol: t.symbol,
      name:
        TOKEN_DISPLAY_NAME[t.symbol] ??
        KNOWN_SPL_TOKENS[KNOWN_SPL_BY_SYMBOL[t.symbol] ?? ""]?.name ??
        t.symbol,

      amount: t.amount,
      price: t.price,
      usd: t.amount * t.price,
      ...(t.contract ? { contract: t.contract } : {}),
      manual: true,
    }));
  } catch {
    return [];
  }
}

export const Route = createFileRoute("/api/tokens")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const walletKey = url.searchParams.get("walletKey") ?? "";
        const pairs = url.searchParams.getAll("a").slice(0, 8);

        const detected = await Promise.all(
          pairs.map(async (pair) => {
            const [rawChain, address] = pair.split(":");
            const chain = normalizeChain(rawChain ?? "");
            if (!address || address.length < 20 || address.length > 128 || !/^[A-Za-z0-9]+$/.test(address)) {
              return [] as WalletToken[];
            }
            try {
              if (chain === "SOL") return await solTokens(address);
              if (EVM_TOKEN_RPC[chain]) return await evmTokens(chain, address);
            } catch (err) {
              console.error("[api/tokens] scan failed", chain, err);
            }
            return [] as WalletToken[];
          }),
        );

        const manual = await manualTokens(walletKey);

        // Merge: manual entries add on top of detected ones. Imported tokens are
        // matched by contract address first so an on-chain deposit of the same
        // token adds up with the edited balance.
        const mergeKey = (t: WalletToken) =>
          t.contract ? `${t.chain}:${t.contract.toLowerCase()}` : `${t.chain}:${t.symbol}`;
        const merged = new Map<string, WalletToken>();
        const bySymbol = new Map<string, string>();
        for (const t of detected.flat()) {
          const key = mergeKey(t);
          merged.set(key, t);
          bySymbol.set(`${t.chain}:${t.symbol}`, key);
        }
        for (const m of manual) {
          const key = merged.has(mergeKey(m))
            ? mergeKey(m)
            : (bySymbol.get(`${m.chain}:${m.symbol}`) ?? mergeKey(m));
          const existing = merged.get(key);
          if (existing) {
            const amount = existing.amount + m.amount;
            const price = m.price > 0 ? m.price : existing.price;
            merged.set(key, { ...existing, amount, price, usd: amount * price, manual: true });
          } else {
            merged.set(key, m);
          }
        }

        const tokens = Array.from(merged.values()).filter((t) => t.amount > 0);
        return Response.json({ tokens });
      },
    },
  },
});
