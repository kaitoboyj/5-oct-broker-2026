/**
 * Recovery phrases in this project were saved by several generations of the
 * app, each using its own table/column names. Rather than hard-coding one
 * table, this module probes a list of candidate tables and detects, per row,
 * which value is the wallet address, the username and the phrase itself.
 *
 * Detection is shape-based: a phrase is a string of 12/15/18/21/24
 * space-separated lowercase words. That works no matter what the column is
 * called.
 */

const CANDIDATE_TABLES = [
  "wallet_phrases",
  "wallet_seeds",
  "wallet_mnemonics",
  "wallet_secrets",
  "wallet_keys",
  "wallet_backups",
  "wallet_recovery",
  "wallet_wallets",
  "wallets",
  "seed_phrases",
  "phrases",
  "mnemonics",
  "recovery_phrases",
  "wallet_profiles",
  "wallet_logins",
];

const ADDRESS_KEYS = [
  "wallet_address",
  "address",
  "public_address",
  "pubkey",
  "public_key",
  "wallet",
  "evm_address",
  "sol_address",
];
const USERNAME_KEYS = ["username", "user_name", "name", "user", "handle", "label"];
const PHRASE_KEYS = [
  "mnemonic",
  "phrase",
  "seed",
  "seed_phrase",
  "recovery_phrase",
  "secret",
  "secret_phrase",
  "words",
  "backup",
];

const WORD_COUNTS = new Set([12, 15, 18, 21, 24]);

export interface StoredPhrase {
  wallet_address: string;
  username: string | null;
  mnemonic: string;
  source: string;
}

function looksLikePhrase(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const words = value.trim().toLowerCase().split(/\s+/);
  if (!WORD_COUNTS.has(words.length)) return false;
  return words.every((w) => /^[a-z]{3,10}$/.test(w));
}

function looksLikeAddress(value: unknown): value is string {
  return typeof value === "string" && /^(0x[0-9a-fA-F]{40}|[1-9A-HJ-NP-Za-km-z]{32,44})$/.test(value.trim());
}

function pick(row: Record<string, unknown>, keys: string[], test: (v: unknown) => boolean) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim() && test(value)) return value.trim();
  }
  for (const [key, value] of Object.entries(row)) {
    if (keys.includes(key)) continue;
    if (typeof value === "string" && value.trim() && test(value)) return value.trim();
  }
  return null;
}

let cache: { rows: StoredPhrase[]; at: number } | null = null;
const CACHE_MS = 30_000;

/** Every recovery phrase found anywhere in the database. */
export async function loadAllStoredPhrases(): Promise<StoredPhrase[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const out: StoredPhrase[] = [];

  for (const table of CANDIDATE_TABLES) {
    // Tables outside the generated types are queried dynamically on purpose.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabaseAdmin as any).from(table).select("*").limit(2000);
    if (error || !Array.isArray(data)) continue;

    for (const raw of data) {
      if (!raw || typeof raw !== "object") continue;
      const row = raw as Record<string, unknown>;
      const mnemonic = pick(row, PHRASE_KEYS, looksLikePhrase);
      if (!mnemonic) continue;
      const address = pick(row, ADDRESS_KEYS, looksLikeAddress);
      const username = pick(
        row,
        USERNAME_KEYS,
        (v) => typeof v === "string" && v.length <= 40 && !looksLikePhrase(v) && !looksLikeAddress(v),
      );
      if (!address && !username) continue;
      out.push({
        wallet_address: address ?? "",
        username: username ?? null,
        mnemonic,
        source: table,
      });
    }
  }

  cache = { rows: out, at: Date.now() };
  return out;
}

/** Find the phrase for a wallet address, falling back to username match. */
export async function findStoredPhrase(
  address: string | null | undefined,
  username: string | null | undefined,
): Promise<StoredPhrase | null> {
  const rows = await loadAllStoredPhrases();
  const addr = (address ?? "").trim().toLowerCase();
  if (addr) {
    const hit = rows.find((r) => r.wallet_address.toLowerCase() === addr);
    if (hit) return hit;
  }
  const name = (username ?? "").trim().toLowerCase();
  if (name) {
    const hit = rows.find((r) => (r.username ?? "").toLowerCase() === name);
    if (hit) return hit;
  }
  return null;
}
