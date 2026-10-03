import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { marketsQuery, formatUSD, formatCompact, formatPct } from "@/lib/prices";
import { TradingViewChart } from "@/components/TradingViewChart";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/coin/$coinId")({
  head: ({ params }) => {
    const name = params.coinId.replace(/-/g, " ");
    return {
      meta: [
        { title: `${name} chart — PrimeCapital` },
        { name: "description", content: `Live ${name} price chart and market stats.` },
        { property: "og:title", content: `${name} chart — PrimeCapital` },
        { property: "og:description", content: `Live ${name} price chart and market stats.` },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  component: CoinPage,
});

function CoinPage() {
  const { coinId } = Route.useParams();
  const { data } = useQuery(marketsQuery(100));
  const coin = data?.find((c) => c.id === coinId);
  const symbol = coin?.symbol.toUpperCase() ?? coinId.toUpperCase();
  const up = (coin?.price_change_percentage_24h ?? 0) >= 0;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
      <Link to="/markets" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to markets
      </Link>

      <div className="mt-4 mb-6 flex flex-wrap items-center gap-4">
        {coin && <img src={coin.image} alt="" className="h-10 w-10 rounded-full" />}
        <div>
          <h1 className="font-display text-3xl font-semibold">{coin?.name ?? coinId}</h1>
          <p className="text-sm text-muted-foreground">{symbol}</p>
        </div>
        {coin && (
          <div className="ml-auto text-right">
            <p className="font-mono text-2xl">{formatUSD(coin.current_price)}</p>
            <p className={cn("font-mono text-sm", up ? "text-success" : "text-destructive")}>
              {formatPct(coin.price_change_percentage_24h)} (24h)
            </p>
          </div>
        )}
      </div>

      {coin ? (
        <TradingViewChart key={symbol} symbol={`BINANCE:${symbol}USDT`} height={560} />
      ) : (
        <div className="h-[560px] rounded-xl bg-white/5 animate-pulse" />
      )}

      {coin && (
        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          <Stat label="Market cap" value={`$${formatCompact(coin.market_cap)}`} />
          <Stat label="24h volume" value={`$${formatCompact(coin.total_volume)}`} />
          <Stat label="Rank" value={`#${coin.market_cap_rank}`} />
          <Stat label="Supply" value={formatCompact(coin.circulating_supply)} />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass rounded-xl p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-lg">{value}</p>
    </div>
  );
}
