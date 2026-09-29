// Central list of blockchain / price API keys. The first key of each list is
// the primary; later keys are automatic backups used when a request fails.

export const ALCHEMY_KEYS = ["4ktChsUHziUE8O7iKgSBY", "alch_4dQ3tBZGKOI7F32Ud2_ff"];
export const COVALENT_KEYS = ["cqt_rQJhYVghJTyV4q3whPMJqqfm9vg6", "cqt_rQbVJY3vD7GMV9wF4RM8R36vYHRQ"];

export const QUICKNODE_SOL_HTTP =
  "https://orbital-light-butterfly.solana-mainnet.quiknode.pro/b67d74d3bf2c6c6c1c703d10630c34d0981f006b/";
export const QUICKNODE_SOL_WSS =
  "wss://orbital-light-butterfly.solana-mainnet.quiknode.pro/b67d74d3bf2c6c6c1c703d10630c34d0981f006b/";

export const ALCHEMY_ETH_BACKUP = `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEYS[1]}`;
export const DEXSCREENER_BASE = "https://api.dexscreener.com";

/** CoinGecko Demo key — sent as the x-cg-demo-api-key header. */
export const COINGECKO_KEY = "CG-5gpxSxmCWnPjD5Vp7qGQUXpw";

/** Adds the CoinGecko key header when the request targets CoinGecko. */
export function withApiHeaders(url: string, init: RequestInit = {}): RequestInit {
  if (!url.includes("api.coingecko.com")) return init;
  const headers = new Headers(init.headers);
  headers.set("x-cg-demo-api-key", COINGECKO_KEY);
  headers.set("accept", "application/json");
  return { ...init, headers };
}

/** Every URL variant to try for a request: original first, then backups. */
export function candidateUrls(url: string): string[] {
  const out = [url];
  const alch = url.match(/^https:\/\/([a-z0-9-]+)\.g\.alchemy\.com\/v2\/([^/?#]+)/);
  if (alch) {
    for (const k of ALCHEMY_KEYS) if (k !== alch[2]) out.push(url.replace(alch[2], k));
    if (alch[1] === "solana-mainnet") out.push(QUICKNODE_SOL_HTTP);
  } else if (url.includes("api.covalenthq.com")) {
    const m = url.match(/key=([^&]+)/);
    if (m) for (const k of COVALENT_KEYS) if (k !== m[1]) out.push(url.replace(m[1], k));
  } else if (url.startsWith("https://api.mainnet-beta.solana.com")) {
    out.push(QUICKNODE_SOL_HTTP);
  }
  return out;
}

function isJsonRpcError(text: string) {
  return /^\s*\{/.test(text) && /"error"\s*:\s*\{/.test(text) && !/"result"/.test(text);
}

/**
 * Drop-in `fetch` replacement that falls back to backup keys / QuickNode when
 * the primary provider errors, rate-limits or returns a JSON-RPC error.
 */
export async function resilientFetch(url: string, init: RequestInit = {}, ms = 8_000): Promise<Response> {
  const urls = candidateUrls(url);
  const { signal: _ignored, ...rest } = init;
  let last: Response | null = null;
  let lastErr: unknown = null;
  for (let i = 0; i < urls.length; i++) {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), ms);
    try {
      const res = await fetch(urls[i], { ...withApiHeaders(urls[i], rest), signal: c.signal });
      if (res.ok) {
        if (i === urls.length - 1) return res;
        const text = await res.text();
        if (!isJsonRpcError(text)) {
          return new Response(text, { status: res.status, headers: res.headers });
        }
        last = new Response(text, { status: res.status, headers: res.headers });
        continue;
      }
      last = res;
    } catch (e) {
      lastErr = e;
    } finally {
      clearTimeout(t);
    }
  }
  if (last) return last;
  throw lastErr ?? new Error("all providers failed");
}
