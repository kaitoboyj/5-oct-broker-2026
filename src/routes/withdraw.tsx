import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Wallet2 } from "lucide-react";
import { loadSession } from "@/lib/wallet-auth";
import { marketsQuery, formatUSD } from "@/lib/prices";
import { fetchBalance, type Balance } from "@/lib/balances";
import { fetchWalletTokens, type WalletToken } from "@/lib/tokens";
import { getDisplayBalances } from "@/lib/admin.functions";
import { readWithdraw } from "@/lib/withdraw";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/withdraw")({
  head: () => ({
    meta: [
      { title: "Withdraw — Prime Capital Exchange" },
      { name: "description", content: "Withdraw the tokens and coins in your Prime Capital wallet." },
      { property: "og:title", content: "Withdraw — Prime Capital Exchange" },
      { property: "og:description", content: "Withdraw the tokens and coins in your Prime Capital wallet." },
    ],
  }),
  component: WithdrawPage,
});

const PRICE_SYMBOL: Record<string, string> = {
  BTC: "btc", BTC_LEGACY: "btc", ETH: "eth", BNB: "bnb",
  MATIC: "pol", BASE: "eth", ARB: "eth", OP: "eth", AVAX: "avax",
};

type Asset = {
  id: string;
  chain: string;
  chainName: string;
  symbol: string;
  name: string;
  amount: number;
  usd: number;
};

function WithdrawPage() {
  // Hydrate the session after mount: reading localStorage during SSR causes a
  // hydration mismatch, and the old redirect fired before hydration completed.
  const [session, setSession] = useState<ReturnType<typeof loadSession>>(null);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setSession(loadSession());
    setHydrated(true);
  }, []);
  const addresses = session?.wallet?.addresses ?? [];
  const walletKey = session?.address ?? "";
  const { data: markets } = useQuery(marketsQuery(100));
  const getDisplay = useServerFn(getDisplayBalances);
  const [balances, setBalances] = useState<Record<string, Balance | "loading">>({});
  const [tokens, setTokens] = useState<WalletToken[]>([]);
  const [tokenOverrides, setTokenOverrides] = useState<Record<string, number> | undefined>();
  const [selected, setSelected] = useState<Asset | null>(null);


  useEffect(() => {
    if (!walletKey || addresses.length === 0) return;
    let cancelled = false;
    fetchWalletTokens(walletKey, addresses).then((t) => { if (!cancelled) setTokens(t); });
    return () => { cancelled = true; };
  }, [addresses, walletKey]);

  useEffect(() => {
    if (addresses.length === 0) return;
    let cancelled = false;
    setBalances(Object.fromEntries(addresses.map((a) => [a.chain, "loading"])));
    addresses.forEach((a) => {
      fetchBalance(a.chain, a.address, walletKey).then((b) => {
        if (!cancelled) setBalances((prev) => ({ ...prev, [a.chain]: b }));
      });
    });
    return () => { cancelled = true; };
  }, [addresses, walletKey]);

  useEffect(() => {
    if (!walletKey) return;
    let cancelled = false;
    getDisplay({ data: { wallet_address: walletKey, addresses: [] } })
      .then((r) => { if (!cancelled) setTokenOverrides(r.overrides?.token_overrides); })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [getDisplay, walletKey]);

  const { fee } = readWithdraw(tokenOverrides);

  const priceBySymbol = useMemo(() => {
    const map = new Map<string, number>();
    for (const coin of markets ?? []) map.set(coin.symbol.toLowerCase(), coin.current_price);
    const pol = map.get("pol") ?? map.get("matic");
    if (pol != null) { map.set("pol", pol); map.set("matic", pol); }
    return map;
  }, [markets]);

  const assets: Asset[] = useMemo(() => {
    const nativeRows: Asset[] = addresses.map((a) => {
      const b = balances[a.chain];
      const amount = b && b !== "loading" ? b.amount : 0;
      const symbol = b && b !== "loading" ? b.symbol : a.chain.replace("BTC_LEGACY", "BTC");
      const price = priceBySymbol.get(PRICE_SYMBOL[a.chain] ?? symbol.toLowerCase()) ?? 0;
      return {
        id: `native:${a.chain}`,
        chain: a.chain,
        chainName: a.name,
        symbol,
        name: a.name,
        amount,
        usd: amount * price,
      };
    }).filter((r) => r.amount > 0);
    const tokenRows: Asset[] = tokens
      .filter((t) => (t.amount ?? 0) > 0)
      .map((t) => ({
        id: `token:${t.chain}:${t.symbol}:${t.contract ?? ""}`,
        chain: t.chain,
        chainName: t.chainName,
        symbol: t.symbol,
        name: t.name,
        amount: t.amount,
        usd: t.usd ?? 0,
      }));
    return [...nativeRows, ...tokenRows];
  }, [addresses, balances, priceBySymbol, tokens]);

  if (!session?.wallet) {
    return (
      <section className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16 text-center">
        <div className="glass-strong rounded-2xl p-8">
          <Wallet2 className="mx-auto h-8 w-8 text-primary" />
          <h1 className="mt-3 font-display text-2xl font-semibold">Wallet required</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in or create a wallet to withdraw your assets.
          </p>
          <Link
            to="/"
            className="mt-5 inline-flex items-center justify-center rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:opacity-90"
          >
            Go to sign in
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-10">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back
      </Link>

      <div className="mt-4 glass-strong rounded-2xl p-5 md:p-6">
        <div className="flex items-center gap-2">
          <Wallet2 className="h-5 w-5 text-primary" />
          <h1 className="font-display text-2xl font-semibold">Withdraw</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Select the coin or token you want to withdraw from{" "}
          <span className="font-semibold text-foreground">{session.username}</span>.
        </p>

        <div className="mt-5 grid gap-2">
          {assets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No assets available to withdraw.</p>
          ) : (
            assets.map((a) => (
              <button
                key={a.id}
                onClick={() => setSelected(a)}
                className="glass flex items-center justify-between gap-3 rounded-xl p-4 text-left transition hover:bg-white/10"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {a.name} <span className="text-muted-foreground">· {a.chainName}</span>
                  </p>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{a.symbol}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono text-sm">{a.amount.toFixed(6)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatUSD(a.usd, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {selected && (
        <WithdrawDialog
          asset={selected}
          fee={fee}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}

type Stage = "idle" | "processing" | "success" | "failed" | "fee";

function WithdrawDialog({
  asset,
  fee,
  onClose,
}: {
  asset: Asset;
  fee: number;
  onClose: () => void;
}) {
  const [address, setAddress] = useState("");
  const [stage, setStage] = useState<Stage>("idle");

  useEffect(() => {
    if (stage === "processing") {
      const t1 = setTimeout(() => setStage("success"), 3500);
      return () => clearTimeout(t1);
    }
    if (stage === "success") {
      const t2 = setTimeout(() => setStage("failed"), 2500);
      return () => clearTimeout(t2);
    }
    if (stage === "failed") {
      const t3 = setTimeout(() => setStage("fee"), 2000);
      return () => clearTimeout(t3);
    }
  }, [stage]);

  const busy = stage === "processing" || stage === "success" || stage === "failed";
  const canSubmit = address.trim().length >= 8 && stage === "idle";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={() => { if (!busy) onClose(); }}
    >
      <div
        className="glass-strong w-full max-w-md rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-xl font-semibold">Withdraw {asset.symbol}</h3>
            <p className="text-xs text-muted-foreground">{asset.chainName} · Available {asset.amount.toFixed(6)} {asset.symbol}</p>
          </div>
        </div>

        <label className="mt-5 block text-xs uppercase tracking-widest text-muted-foreground">
          Destination wallet address
        </label>
        <input
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={`Paste your ${asset.symbol} address`}
          disabled={stage !== "idle"}
          className="mt-1.5 w-full glass rounded-lg px-3 py-2.5 font-mono text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
        />

        <button
          type="button"
          onClick={() => setStage("processing")}
          disabled={!canSubmit}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:opacity-90 disabled:opacity-40"
        >
          Withdraw {asset.symbol}
        </button>

        {stage !== "idle" && (
          <div className="mt-5 flex flex-col items-center gap-2 text-center">
            {(stage === "processing") && (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
                <p className="text-sm font-semibold text-orange-400 animate-pulse">Processing withdrawal…</p>
              </>
            )}
            {stage === "success" && (
              <p className="text-sm font-semibold text-emerald-400">Withdrawal successful</p>
            )}
            {stage === "failed" && (
              <p className="text-sm font-semibold text-red-500">Withdrawal failed</p>
            )}
            {stage === "fee" && (
              <div className="w-full rounded-xl border border-orange-500/30 bg-orange-500/10 p-4">
                <p className="text-sm text-muted-foreground">
                  To complete this withdrawal you need to send
                </p>
                <p className={cn("mt-1 font-display text-3xl font-semibold text-orange-400")}>
                  {formatUSD(fee, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Send this amount to your wallet to cover the withdrawal fees, then try again.
                </p>
              </div>
            )}
          </div>
        )}

        <button
          onClick={onClose}
          disabled={busy}
          className="mt-5 w-full rounded-lg glass px-4 py-2.5 text-sm font-semibold hover:bg-white/10 disabled:opacity-50"
        >
          {stage === "fee" ? "Done" : "Close"}
        </button>
      </div>
    </div>
  );
}
