import { useState } from "react";
import { Loader2 } from "lucide-react";
import { readDailyYieldRate, readDailyYieldStart } from "@/lib/daily-yield";

export function DailyYieldControl({
  tokens,
  onSet,
}: {
  tokens?: Record<string, number> | null;
  onSet: (v: { ratePct?: number; restart?: boolean }) => Promise<unknown>;
}) {
  const rate = readDailyYieldRate(tokens);
  const start = readDailyYieldStart(tokens);
  const [val, setVal] = useState(String(rate));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const num = Number(val);
  const valid = val !== "" && Number.isFinite(num) && num >= 0;

  const run = async (v: { ratePct?: number; restart?: boolean }) => {
    setBusy(true);
    setErr(null);
    try { await onSet(v); } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  };

  return (
    <div className="glass rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">Daily yield</span>
        <span className="text-xs text-muted-foreground">
          {rate}% per day · {start ? `started ${new Date(start).toLocaleString()}` : "starts when balance goes above 0"}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Each day, this percent of the initial balance is added to yield (e.g. 10% of $100 = $10/day).
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          inputMode="decimal"
          className="w-28 glass rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <span className="text-xs text-muted-foreground">% / day</span>
        <button
          type="button"
          disabled={busy || !valid}
          onClick={() => run({ ratePct: num })}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save percent
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => run({ restart: true })}
          className="rounded-lg glass px-3 py-2 text-xs font-semibold disabled:opacity-40"
        >
          Restart day count
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
    </div>
  );
}
