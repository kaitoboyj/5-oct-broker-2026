// DexScreener live price feed for major coins (uses deepest-liquidity pair).
import { DEXSCREENER_BASE } from "./api-keys";

const MAJORS: Record<string, { chain: string; address: string; name: string }> = {
  eth: { chain: "ethereum", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", name: "Ethereum" },
  btc: { chain: "ethereum", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", name: "Bitcoin" },
  usdt: { chain: "ethereum", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", name: "Tether" },
  usdc: { chain: "ethereum", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", name: "USD Coin" },
  link: { chain: "ethereum", address: "0x514910771AF9Ca656af840dff83E8264EcF986CA", name: "Chainlink" },
  uni: { chain: "ethereum", address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984", name: "Uniswap" },
  pepe: { chain: "ethereum", address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933", name: "Pepe" },
  shib: { chain: "ethereum", address: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE", name: "Shiba Inu" },
  bnb: { chain: "bsc", address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", name: "BNB" },
  sol: { chain: "solana", address: "So11111111111111111111111111111111111111112", name: "Solana" },
  pol: { chain: "polygon", address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", name: "Polygon" },
  matic: { chain: "polygon", address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", name: "Polygon" },
  avax: { chain: "avalanche", address: "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7", name: "Avalanche" },
};

let cache: { at: number; data: Record<string, { price: number; change24h: number }> } | null = null;

export async function dexMajorPrices(): Promise<Record<string, { price: number; change24h: number }>> {
  if (cache && Date.now() - cache.at < 20_000) return cache.data;
  const byChain: Record<string, string[]> = {};
  for (const m of Object.values(MAJORS)) (byChain[m.chain] ??= []).includes(m.address) || byChain[m.chain].push(m.address);
  const best: Record<string, any> = {};
  await Promise.all(
    Object.entries(byChain).map(async ([chain, addrs]) => {
      try {
        const c = new AbortController();
        const t = setTimeout(() => c.abort(), 6_000);
        const res = await fetch(`${DEXSCREENER_BASE}/tokens/v1/${chain}/${addrs.join(",")}`, { signal: c.signal }).finally(() => clearTimeout(t));
        if (!res.ok) return;
        const pairs: any[] = await res.json();
        for (const p of Array.isArray(pairs) ? pairs : []) {
          const a = String(p?.baseToken?.address ?? "").toLowerCase();
          if (!best[a] || Number(p?.liquidity?.usd ?? 0) > Number(best[a]?.liquidity?.usd ?? 0)) best[a] = p;
        }
      } catch { /* ignore */ }
    }),
  );
  const out: Record<string, { price: number; change24h: number }> = {};
  for (const [sym, m] of Object.entries(MAJORS)) {
    const p = best[m.address.toLowerCase()];
    const price = Number(p?.priceUsd ?? 0);
    if (price > 0) out[sym] = { price, change24h: Number(p?.priceChange?.h24 ?? 0) };
  }
  if (Object.keys(out).length) cache = { at: Date.now(), data: out };
  return out;
}

/** Overlay DexScreener prices on a coin list; build a list if it is empty. */
export async function applyDexPrices(list: any[]): Promise<any[]> {
  const dex = await dexMajorPrices();
  if (!Array.isArray(list) || list.length === 0) {
    return Object.entries(dex).map(([sym, d], i) => ({
      id: MAJORS[sym].name.toLowerCase().replace(/\s+/g, "-"),
      symbol: sym, name: MAJORS[sym].name, image: "",
      current_price: d.price, market_cap: 0, market_cap_rank: i + 1, total_volume: 0,
      price_change_percentage_24h: d.change24h, circulating_supply: 0,
    }));
  }
  return list.map((c) => {
    const d = dex[String(c?.symbol ?? "").toLowerCase()];
    return d ? { ...c, current_price: d.price } : c;
  });
}
