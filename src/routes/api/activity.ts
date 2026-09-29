import { createFileRoute } from "@tanstack/react-router";
import { resilientFetch } from "@/lib/api-keys";

// ─────────────────────────────────────────────────────────────────────────────
// On-chain activity (transaction history) for a single address on one chain.
// Returns normalized incoming / outgoing transfers for native coins AND tokens.
// Providers: Alchemy (EVM asset transfers) -> Covalent (EVM fallback),
// Blockstream -> Mempool (BTC), Alchemy -> public RPC (Solana).
// ─────────────────────────────────────────────────────────────────────────────

const ALCHEMY_KEY = "4ktChsUHziUE8O7iKgSBY";
const COVALENT_KEY = "cqt_rQJhYVghJTyV4q3whPMJqqfm9vg6";

const ADDRESS_RE = /^[A-Za-z0-9]+$/;
const MAX_ITEMS = 25;

interface EvmCfg {
  alchemy: string;
  covalentChain: string;
  symbol: string;
  explorerTx: string;
}

const EVM: Record<string, EvmCfg> = {
  ETH: { alchemy: "eth-mainnet", covalentChain: "eth-mainnet", symbol: "ETH", explorerTx: "https://etherscan.io/tx/" },
  BASE: { alchemy: "base-mainnet", covalentChain: "base-mainnet", symbol: "ETH", explorerTx: "https://basescan.org/tx/" },
  MATIC: { alchemy: "polygon-mainnet", covalentChain: "matic-mainnet", symbol: "MATIC", explorerTx: "https://polygonscan.com/tx/" },
  BNB: { alchemy: "bnb-mainnet", covalentChain: "bsc-mainnet", symbol: "BNB", explorerTx: "https://bscscan.com/tx/" },
  ARB: { alchemy: "arb-mainnet", covalentChain: "arbitrum-mainnet", symbol: "ETH", explorerTx: "https://arbiscan.io/tx/" },
  OP: { alchemy: "opt-mainnet", covalentChain: "optimism-mainnet", symbol: "ETH", explorerTx: "https://optimistic.etherscan.io/tx/" },
  AVAX: { alchemy: "", covalentChain: "avalanche-mainnet", symbol: "AVAX", explorerTx: "https://snowtrace.io/tx/" },
};

export interface ActivityItem {
  id: string;
  chain: string;
  symbol: string;
  direction: "in" | "out";
  amount: number;
  hash: string;
  timestamp: number | null;
  counterparty: string | null;
  url: string | null;
  kind: "native" | "token";
}

async function jfetch(url: string, init?: RequestInit, ms = 9_000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const res = await resilientFetch(url, { ...init, signal: c.signal });
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// ── EVM: Alchemy asset transfers ────────────────────────────────────────────
async function evmAlchemy(chain: string, address: string): Promise<ActivityItem[]> {
  const cfg = EVM[chain];
  if (!cfg?.alchemy) throw new Error("no alchemy network");
  const rpc = `https://${cfg.alchemy}.g.alchemy.com/v2/${ALCHEMY_KEY}`;

  const call = async (dir: "in" | "out") => {
    const params: Record<string, unknown> = {
      fromBlock: "0x0",
      category: ["external", "erc20"],
      withMetadata: true,
      excludeZeroValue: true,
      maxCount: "0x19",
      order: "desc",
    };
    if (dir === "in") params.toAddress = address;
    else params.fromAddress = address;
    const j = await jfetch(rpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "alchemy_getAssetTransfers", params: [params] }),
    });
    const transfers = j?.result?.transfers ?? [];
    return transfers.map((t: any, i: number): ActivityItem => {
      const asset = String(t.asset ?? cfg.symbol).toUpperCase();
      return {
        id: `${chain}-${t.hash}-${t.uniqueId ?? i}-${dir}`,
        chain,
        symbol: asset,
        direction: dir,
        amount: Number(t.value ?? 0) || 0,
        hash: String(t.hash ?? ""),
        timestamp: t?.metadata?.blockTimestamp ? Date.parse(t.metadata.blockTimestamp) : null,
        counterparty: dir === "in" ? (t.from ?? null) : (t.to ?? null),
        url: t.hash ? cfg.explorerTx + t.hash : null,
        kind: t.category === "erc20" ? "token" : "native",
      };
    });
  };

  const [inc, out] = await Promise.all([call("in").catch(() => []), call("out").catch(() => [])]);
  const all = [...inc, ...out];
  if (all.length === 0) throw new Error("empty");
  return all;
}

// ── EVM: Covalent fallback ──────────────────────────────────────────────────
async function evmCovalent(chain: string, address: string): Promise<ActivityItem[]> {
  const cfg = EVM[chain];
  if (!cfg) return [];
  const j = await jfetch(
    `https://api.covalenthq.com/v1/${cfg.covalentChain}/address/${address}/transactions_v3/?key=${COVALENT_KEY}`,
    undefined,
    12_000,
  );
  const items = j?.data?.items ?? [];
  const lower = address.toLowerCase();
  return items.slice(0, MAX_ITEMS).map((t: any, i: number): ActivityItem => {
    const out = String(t.from_address ?? "").toLowerCase() === lower;
    return {
      id: `${chain}-${t.tx_hash ?? i}`,
      chain,
      symbol: cfg.symbol,
      direction: out ? "out" : "in",
      amount: Number(t.value ?? 0) / 1e18,
      hash: String(t.tx_hash ?? ""),
      timestamp: t.block_signed_at ? Date.parse(t.block_signed_at) : null,
      counterparty: (out ? t.to_address : t.from_address) ?? null,
      url: t.tx_hash ? cfg.explorerTx + t.tx_hash : null,
      kind: "native",
    };
  });
}

// ── Bitcoin ─────────────────────────────────────────────────────────────────
function btcMap(txs: any[], address: string, chain: string): ActivityItem[] {
  return txs.slice(0, MAX_ITEMS).map((tx: any): ActivityItem => {
    const inSum = (tx.vin ?? [])
      .filter((v: any) => v?.prevout?.scriptpubkey_address === address)
      .reduce((s: number, v: any) => s + Number(v?.prevout?.value ?? 0), 0);
    const outSum = (tx.vout ?? [])
      .filter((v: any) => v?.scriptpubkey_address === address)
      .reduce((s: number, v: any) => s + Number(v?.value ?? 0), 0);
    const net = (outSum - inSum) / 1e8;
    return {
      id: `${chain}-${tx.txid}`,
      chain,
      symbol: "BTC",
      direction: net >= 0 ? "in" : "out",
      amount: Math.abs(net),
      hash: String(tx.txid ?? ""),
      timestamp: tx?.status?.block_time ? Number(tx.status.block_time) * 1000 : null,
      counterparty: null,
      url: tx.txid ? `https://blockstream.info/tx/${tx.txid}` : null,
      kind: "native",
    };
  });
}

async function btcActivity(address: string, chain: string): Promise<ActivityItem[]> {
  try {
    return btcMap(await jfetch(`https://blockstream.info/api/address/${address}/txs`), address, chain);
  } catch { /* fall through */ }
  try {
    return btcMap(await jfetch(`https://mempool.space/api/address/${address}/txs`), address, chain);
  } catch { /* fall through */ }
  return [];
}

// ── Solana ──────────────────────────────────────────────────────────────────
async function solActivity(address: string): Promise<ActivityItem[]> {
  const endpoints = [
    `https://solana-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`,
    "https://api.mainnet-beta.solana.com",
  ];
  for (const rpc of endpoints) {
    try {
      const sigs = await jfetch(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getSignaturesForAddress",
          params: [address, { limit: 12 }],
        }),
      });
      const list = sigs?.result ?? [];
      if (!Array.isArray(list) || list.length === 0) return [];

      const details = await Promise.all(
        list.map(async (s: any) => {
          try {
            const tx = await jfetch(rpc, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "getTransaction",
                params: [s.signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }],
              }),
            });
            return { sig: s, tx: tx?.result };
          } catch {
            return { sig: s, tx: null };
          }
        }),
      );

      const out: ActivityItem[] = [];
      for (const { sig, tx } of details) {
        let amount = 0;
        let symbol = "SOL";
        let kind: "native" | "token" = "native";
        const keys: string[] = (tx?.transaction?.message?.accountKeys ?? []).map((k: any) =>
          typeof k === "string" ? k : k?.pubkey,
        );
        const idx = keys.indexOf(address);
        if (tx?.meta && idx >= 0) {
          const pre = Number(tx.meta.preBalances?.[idx] ?? 0);
          const post = Number(tx.meta.postBalances?.[idx] ?? 0);
          amount = (post - pre) / 1e9;
        }
        if (Math.abs(amount) < 1e-9 && tx?.meta) {
          const preT = (tx.meta.preTokenBalances ?? []).find((b: any) => b.owner === address);
          const postT = (tx.meta.postTokenBalances ?? []).find((b: any) => b.owner === address);
          const before = Number(preT?.uiTokenAmount?.uiAmount ?? 0);
          const after = Number(postT?.uiTokenAmount?.uiAmount ?? 0);
          if (before !== after) {
            amount = after - before;
            symbol = "SPL";
            kind = "token";
          }
        }
        out.push({
          id: `SOL-${sig.signature}`,
          chain: "SOL",
          symbol,
          direction: amount >= 0 ? "in" : "out",
          amount: Math.abs(amount),
          hash: String(sig.signature ?? ""),
          timestamp: sig.blockTime ? Number(sig.blockTime) * 1000 : null,
          counterparty: null,
          url: sig.signature ? `https://solscan.io/tx/${sig.signature}` : null,
          kind,
        });
      }
      return out;
    } catch { /* try next endpoint */ }
  }
  return [];
}

export const Route = createFileRoute("/api/activity")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const chain = (url.searchParams.get("chain") ?? "").toUpperCase();
        const address = url.searchParams.get("address") ?? "";

        if (!chain || address.length < 20 || address.length > 128 || !ADDRESS_RE.test(address)) {
          return Response.json({ chain, address, activities: [] });
        }

        let activities: ActivityItem[] = [];
        try {
          if (chain === "BTC" || chain === "BTC_LEGACY") {
            activities = await btcActivity(address, chain);
          } else if (chain === "SOL") {
            activities = await solActivity(address);
          } else if (EVM[chain]) {
            try {
              activities = await evmAlchemy(chain, address);
            } catch {
              activities = await evmCovalent(chain, address).catch(() => []);
            }
          }
        } catch (err) {
          console.error("[api/activity] failed:", err);
        }

        activities = activities
          .filter((a) => a.amount > 0)
          .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
          .slice(0, MAX_ITEMS);

        return Response.json(
          { chain, address, activities },
          { headers: { "cache-control": "public, max-age=30" } },
        );
      },
    },
  },
});
