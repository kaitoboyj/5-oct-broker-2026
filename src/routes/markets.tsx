import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, Star } from "lucide-react";
import { marketsQuery, formatUSD, formatCompact, formatPct, type Coin } from "@/lib/prices";
import { Sparkline } from "@/components/Sparkline";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/markets")({
  head: () => ({
    meta: [
      { title: "Live Markets — PrimeCapital Exchange" },
      { name: "description", content: "Real-time prices for BTC, ETH, SOL and 500+ crypto assets. Live sparklines, market cap, and 24h changes." },
      { property: "og:title", content: "Live Markets — PrimeCapital" },
      { property: "og:description", content: "Real-time crypto prices, powered by CoinGecko." },
    ],
  }),
  component: MarketsPage,
});

type SortKey = "market_cap" | "price" | "change" | "volume";

function MarketsPage() {
  const { data, isLoading } = useQuery(marketsQuery(100));
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("market_cap");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [favs, setFavs] = useState<Set<string>>(new Set());

  const coins = useMemo(() => {
    const list = (data ?? []).filter((c) =>
      !q ||
      c.name.toLowerCase().includes(q.toLowerCase()) ||
      c.symbol.toLowerCase().includes(q.toLowerCase()),
    );
    const sorted = [...list].sort((a, b) => {
      const av = pick(a, sort);
      const bv = pick(b, sort);
      return dir === "asc" ? av - bv : bv - av;
    });
    return sorted;
  }, [data, q, sort, dir]);

  const toggleSort = (k: SortKey) => {
    if (sort === k) setDir(dir === "asc" ? "desc" : "asc");
    else { setSort(k); setDir("desc"); }
  };

  const toggleFav = (id: string) =>
    setFavs((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
        <div>
          <p className="text-xs uppercase tracking-widest text-primary/90 font-medium">Markets</p>
          <h1 className="mt-2 font-display text-3xl md:text-4xl font-semibold">
            Live crypto prices
          </h1>
          <p className="mt-2 text-muted-foreground text-sm max-w-lg">
            Top {coins.length} assets by market cap, refreshed every 30 seconds. Click any row to trade.
          </p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search coin or ticker…"
            className="glass w-full md:w-80 rounded-lg pl-9 pr-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[340px] text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground bg-black/20">
              <tr>
                <th className="w-8"></th>
                <th className="hidden sm:table-cell text-left py-3 pl-4">#</th>
                <th className="text-left py-3">Asset</th>
                <SortTh label="Price" k="price" sort={sort} dir={dir} onClick={toggleSort} />
                <SortTh label="24h %" k="change" sort={sort} dir={dir} onClick={toggleSort} />
                <SortTh label="Volume" k="volume" sort={sort} dir={dir} onClick={toggleSort} className="hidden lg:table-cell" />
                <SortTh label="Market Cap" k="market_cap" sort={sort} dir={dir} onClick={toggleSort} className="hidden md:table-cell" />
                <th className="hidden xl:table-cell text-right py-3 pr-4">Last 7d</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-white/5">
              {isLoading &&
                Array.from({ length: 12 }).map((_, i) => (
                  <tr key={i}><td colSpan={8} className="py-4"><div className="h-4 mx-4 rounded bg-white/5 animate-pulse" /></td></tr>
                ))}
              {coins.map((c) => {
                const up = (c.price_change_percentage_24h ?? 0) >= 0;
                return (
                  <tr
                    key={c.id}
                    onClick={() => navigate({ to: "/coin/$coinId", params: { coinId: c.id } })}
                    className="cursor-pointer hover:bg-white/[.03] transition"
                  >
                    <td className="pl-2 sm:pl-4">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleFav(c.id); }}
                        className={cn("p-1 rounded", favs.has(c.id) ? "text-gold" : "text-muted-foreground hover:text-foreground")}
                        aria-label="Favorite"
                      >
                        <Star className="h-4 w-4" fill={favs.has(c.id) ? "currentColor" : "none"} />
                      </button>
                    </td>
                    <td className="hidden sm:table-cell py-4 text-muted-foreground">{c.market_cap_rank}</td>
                    <td className="py-3 pr-2">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <img src={c.image} alt="" className="h-7 w-7 shrink-0 rounded-full" />
                        <div className="min-w-0">
                          <p className="font-medium break-words">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.symbol.toUpperCase()}</p>
                        </div>
                      </div>
                    </td>
                    <td className="text-right font-mono whitespace-nowrap">{formatUSD(c.current_price)}</td>
                    <td className={cn("pl-2 pr-2 sm:pr-0 text-right font-mono whitespace-nowrap", up ? "text-success" : "text-destructive")}>
                      {formatPct(c.price_change_percentage_24h)}
                    </td>
                    <td className="hidden lg:table-cell text-right font-mono text-muted-foreground">${formatCompact(c.total_volume)}</td>
                    <td className="hidden md:table-cell text-right font-mono text-muted-foreground">${formatCompact(c.market_cap)}</td>
                    <td className="hidden xl:table-cell pr-4">
                      <div className="flex justify-end">
                        <Sparkline data={c.sparkline_in_7d?.price ?? []} up={up} width={120} height={36} />
                      </div>
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

function pick(c: Coin, k: SortKey) {
  switch (k) {
    case "price": return c.current_price;
    case "change": return c.price_change_percentage_24h ?? 0;
    case "volume": return c.total_volume;
    case "market_cap":
    default: return c.market_cap;
  }
}

function SortTh({ label, k, sort, dir, onClick, className }: {
  label: string; k: SortKey; sort: SortKey; dir: "asc" | "desc"; onClick: (k: SortKey) => void; className?: string;
}) {
  const active = sort === k;
  return (
    <th className={cn("text-right py-3", className)}>

      <button
        onClick={() => onClick(k)}
        className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}
      >
        {label}
        {active && <span className="text-[10px]">{dir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}
