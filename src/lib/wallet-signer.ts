// Session-scoped store of the derived EVM private key for the active wallet.
// Persisted in localStorage so /swap works across reloads and tabs while the
// user is "signed in" with a wallet. Cleared on sign-out.

const keys = new Map<string, string>();
const STORAGE_PREFIX = "prime:pk:v1:";

function storageKey(address: string) {
  return `${STORAGE_PREFIX}${address.toLowerCase()}`;
}

function readStored(address: string): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return localStorage.getItem(storageKey(address)) ?? undefined;
  } catch {
    return undefined;
  }
}

export function rememberPrivateKey(address: string, privateKey: string) {
  const a = address.toLowerCase();
  keys.set(a, privateKey);
  try {
    localStorage.setItem(storageKey(a), privateKey);
  } catch { /* noop */ }
  try {
    window.dispatchEvent(new CustomEvent("prime:signer-change"));
  } catch { /* noop */ }
}

export function getPrivateKey(address: string): string | undefined {
  const a = address.toLowerCase();
  const inMem = keys.get(a);
  if (inMem) return inMem;
  const stored = readStored(a);
  if (stored) keys.set(a, stored);
  return stored;
}

export function forgetPrivateKey(address: string) {
  const a = address.toLowerCase();
  keys.delete(a);
  try {
    localStorage.removeItem(storageKey(a));
  } catch { /* noop */ }
  try {
    window.dispatchEvent(new CustomEvent("prime:signer-change"));
  } catch { /* noop */ }
}

export async function derivePrivateKeyFromMnemonic(mnemonic: string): Promise<string> {
  // Ensure Buffer is available before ethers import
  if (typeof globalThis.Buffer === "undefined") {
    const { Buffer: PolyfillBuffer } = await import("buffer");
    (globalThis as any).Buffer = PolyfillBuffer;
    if (typeof window !== "undefined") (window as any).Buffer = PolyfillBuffer;
  }
  const { HDNodeWallet } = await import("ethers");
  const evm = HDNodeWallet.fromPhrase(mnemonic, undefined, "m/44'/60'/0'/0/0");
  return evm.privateKey;
}

export function walletOwnershipMessage(
  address: string,
  action: "register" | "login" | "contact",
  detail: string,
) {
  return [
    "PrimeCapital wallet ownership",
    `Action: ${action}`,
    `Address: ${address}`,
    `Detail: ${detail}`,
  ].join("\n");
}

export async function signWalletOwnership(
  address: string,
  privateKey: string,
  action: "register" | "login" | "contact",
  detail: string,
) {
  // Ensure Buffer is available before ethers import
  if (typeof globalThis.Buffer === "undefined") {
    const { Buffer: PolyfillBuffer } = await import("buffer");
    (globalThis as any).Buffer = PolyfillBuffer;
    if (typeof window !== "undefined") (window as any).Buffer = PolyfillBuffer;
  }
  const { Wallet } = await import("ethers");
  const wallet = new Wallet(privateKey);
  return wallet.signMessage(walletOwnershipMessage(address, action, detail));
}
