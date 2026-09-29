import { createFileRoute } from "@tanstack/react-router";
import { resilientFetch } from "@/lib/api-keys";
import { KNOWN_SPL_TOKENS, TOKEN_CHAINS, normalizeChain, type TokenChain } from "@/lib/tokens";

const ALCHEMY_KEY = "4ktChsUHziUE8O7iKgSBY";

const EVM_RPC: Record<string, { rpc: string; platform: string; dex: string }> = {
  ETH: { rpc: `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`, platform: "ethereum", dex: "ethereum" },
  BNB: { rpc: `https://bnb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`, platform: "binance-smart-chain", dex: "bsc" },
  MATIC: { rpc: `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`, platform: "polygon-pos", dex: "polygon" },
  BASE: { rpc: `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`, platform: "base", dex: "base" },
};

const SOL_RPC = `https://solana-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`;

/** DexScreener chainId -> our chain code. */
const DEX_CHAIN: Record<string, string> = {
  ethereum: "ETH",
  bsc: "BNB",
  polygon: "MATIC",
  base: "BASE",
  solana: "SOL",
};

const TIMEOUT = 8_000;

async function getJson(url: string, init?: RequestInit): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await resilientFetch(url, { ...init, signal: controller.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function jsonRpc(url: string, method: string, params: unknown[]): Promise<any> {
  const j = await getJson(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!j || j.error) return null;
  return j.result ?? null;
}

interface DexHit {
  chain?: string;
  symbol?: string;
  name?: string;
  price: number;
}

/** DexScreener — covers pump.fun / DEX-only tokens on every chain. */
async function dexScreener(contract: string, wantChain?: string): Promise<DexHit> {
  const j = await getJson(`https://api.dexscreener.com/latest/dex/tokens/${contract}`);
  const pairs: Array<any> = Array.isArray(j?.pairs) ? j.pairs : [];
  const matching = pairs.filter(
    (p) => String(p?.baseToken?.address ?? "").toLowerCase() === contract.toLowerCase(),
  );
  const scoped = wantChain
    ? matching.filter((p) => DEX_CHAIN[String(p?.chainId ?? "")] === wantChain)
    : matching;
  const pool = (scoped.length ? scoped : matching)
    .slice()
    .sort((a, b) => Number(b?.liquidity?.usd ?? 0) - Number(a?.liquidity?.usd ?? 0));
  const best = pool[0];
  if (!best) return { price: 0 };
  const price = Number(best.priceUsd ?? 0);
  return {
    ...(DEX_CHAIN[String(best.chainId ?? "")] ? { chain: DEX_CHAIN[String(best.chainId)] } : {}),
    ...(best.baseToken?.symbol ? { symbol: String(best.baseToken.symbol) } : {}),
    ...(best.baseToken?.name ? { name: String(best.baseToken.name) } : {}),
    price: Number.isFinite(price) && price > 0 ? price : 0,
  };
}

async function coingeckoPrice(platform: string, contract: string): Promise<number> {
  const j = await getJson(
    `https://api.coingecko.com/api/v3/simple/token_price/${platform}?contract_addresses=${contract}&vs_currencies=usd`,
  );
  const first = Object.values((j ?? {}) as Record<string, { usd?: number }>)[0];
  return Number(first?.usd ?? 0) || 0;
}

/** Jupiter token search — reliable symbol/name/decimals for any SPL mint. */
async function jupiterToken(mint: string) {
  const j = await getJson(`https://lite-api.jup.ag/tokens/v2/search?query=${mint}`);
  const list: Array<any> = Array.isArray(j) ? j : (j?.tokens ?? []);
  const hit = list.find((t) => String(t?.id ?? t?.address ?? "") === mint);
  if (!hit) return null;
  return {
    symbol: String(hit.symbol ?? ""),
    name: String(hit.name ?? ""),
    decimals: Number(hit.decimals ?? 9),
    price: Number(hit.usdPrice ?? hit.price ?? 0) || 0,
  };
}

async function jupiterPrice(mint: string): Promise<number> {
  const j = await getJson(`https://lite-api.jup.ag/price/v3?ids=${mint}`);
  const entry = (j ?? {})[mint];
  return Number(entry?.usdPrice ?? entry?.price ?? 0) || 0;
}

/** Raw ERC-20 calls, used when Alchemy metadata is unavailable. */
async function erc20Call(rpc: string, contract: string, selector: string) {
  const res = await jsonRpc(rpc, "eth_call", [{ to: contract, data: selector }, "latest"]);
  return typeof res === "string" && res !== "0x" ? res : null;
}

function decodeAbiString(hex: string): string {
  const body = hex.slice(2);
  if (body.length <= 128) {
    // possibly bytes32-style string
    const bytes = body.replace(/(00)+$/, "");
    return hexToUtf8(bytes);
  }
  const len = parseInt(body.slice(64, 128), 16);
  return hexToUtf8(body.slice(128, 128 + len * 2));
}

function hexToUtf8(hex: string): string {
  let out = "";
  for (let i = 0; i + 1 < hex.length; i += 2) {
    const code = parseInt(hex.slice(i, i + 2), 16);
    if (code > 0) out += String.fromCharCode(code);
  }
  return out.replace(/[^\x20-\x7E]/g, "").trim();
}

function clean(symbol: string) {
  return symbol.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}

export const Route = createFileRoute("/api/token-meta")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const rawContract = (url.searchParams.get("contract") ?? "").trim();
        const requested = normalizeChain(url.searchParams.get("chain") ?? "");
        const wantChain = TOKEN_CHAINS.includes(requested as TokenChain) ? requested : "";

        const isEvm = /^0x[0-9a-fA-F]{40}$/.test(rawContract);
        const isSol = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(rawContract);
        if (!isEvm && !isSol) {
          return Response.json({ error: "That does not look like a contract or mint address" }, { status: 400 });
        }

        try {
          // ---- Solana (SPL) ----
          if (isSol && (!wantChain || wantChain === "SOL")) {
            const [jup, dex, supply] = await Promise.all([
              jupiterToken(rawContract),
              dexScreener(rawContract, "SOL"),
              jsonRpc(SOL_RPC, "getTokenSupply", [rawContract]),
            ]);
            const known = KNOWN_SPL_TOKENS[rawContract];
            const decimals = Number(jup?.decimals ?? supply?.value?.decimals ?? 9);
            let price = jup?.price || dex.price;
            if (!price) price = await jupiterPrice(rawContract);
            if (!price) price = await coingeckoPrice("solana", rawContract);
            const symbol =
              clean(known?.symbol ?? jup?.symbol ?? dex.symbol ?? "") ||
              clean(`${rawContract.slice(0, 4)}${rawContract.slice(-4)}`);
            const name = (known?.name ?? jup?.name ?? dex.name ?? symbol).slice(0, 40);
            if (!jup && !dex.symbol && !supply?.value && !known) {
              return Response.json({ error: "Mint not found on Solana" }, { status: 404 });
            }
            return Response.json({ chain: "SOL", contract: rawContract, symbol, name, decimals, price });
          }

          // ---- EVM (ERC-20) ----
          const dexAny = await dexScreener(rawContract, wantChain || undefined);
          const chain = wantChain || dexAny.chain || "ETH";
          const cfg = EVM_RPC[chain];
          if (!cfg) return Response.json({ error: "Unsupported chain for this address" }, { status: 400 });

          const dex = dexAny.chain === chain || !dexAny.chain ? dexAny : await dexScreener(rawContract, chain);
          const meta = await jsonRpc(cfg.rpc, "alchemy_getTokenMetadata", [rawContract]);

          let symbol = clean(String(meta?.symbol ?? dex.symbol ?? ""));
          let name = String(meta?.name ?? dex.name ?? "");
          let decimals = Number(meta?.decimals ?? 18);

          if (!symbol) {
            const [rawSym, rawName, rawDec] = await Promise.all([
              erc20Call(cfg.rpc, rawContract, "0x95d89b41"), // symbol()
              erc20Call(cfg.rpc, rawContract, "0x06fdde03"), // name()
              erc20Call(cfg.rpc, rawContract, "0x313ce567"), // decimals()
            ]);
            if (rawSym) symbol = clean(decodeAbiString(rawSym));
            if (!name && rawName) name = decodeAbiString(rawName);
            if (rawDec) decimals = parseInt(rawDec, 16) || decimals;
          }

          if (!symbol) return Response.json({ error: "Token not found on this chain" }, { status: 404 });

          let price = dex.price;
          if (!price) price = await coingeckoPrice(cfg.platform, rawContract.toLowerCase());

          return Response.json({
            chain,
            contract: rawContract,
            symbol,
            name: (name || symbol).slice(0, 40),
            decimals: Number.isFinite(decimals) ? decimals : 18,
            price,
          });
        } catch (err) {
          console.error("[api/token-meta] lookup failed", rawContract, err);
          return Response.json({ error: "Lookup failed, try again" }, { status: 502 });
        }
      },
    },
  },
});
