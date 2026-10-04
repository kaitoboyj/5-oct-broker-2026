import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { WithdrawButton } from "@/lib/withdraw";

export function WithdrawButtonControl({
  current,
  currentFee,
  onSet,
}: {
  current: WithdrawButton;
  currentFee: number;
  onSet: (button: WithdrawButton, fee: number) => Promise<unknown>;
}) {
  const [fee, setFee] = useState(currentFee ? String(currentFee) : "");
  const [busy, setBusy] = useState<WithdrawButton | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const feeNum = Number(fee);
  const feeValid = fee !== "" && Number.isFinite(feeNum) && feeNum > 0;

  const run = async (button: WithdrawButton) => {
    setBusy(button);
    setErr(null);
    try {
      await onSet(button, feeValid ? feeNum : 0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="glass rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">Withdraw button (home page)</span>
        <span className="text-xs text-muted-foreground">
          Active:{" "}
          {current === "none"
            ? "none"
            : current === "blue"
              ? "blue"
              : current === "red"
                ? `red (support) · fee $${currentFee.toLocaleString()}`
                : `green · fee $${currentFee.toLocaleString()}`}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Only one button shows at a time, at the bottom of the yield section. Green requires the fee
        amount the user must send. Red (Support) activates the support flow in the withdraw dialog.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          inputMode="decimal"
          placeholder="Fee amount (USD)"
          className="w-40 glass rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run("blue")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy === "blue" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Show blue button
        </button>
        <button
          type="button"
          disabled={busy !== null || !feeValid}
          onClick={() => run("green")}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
          title={feeValid ? "" : "Enter the fee amount first"}
        >
          {busy === "green" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Show green button
        </button>
        <button
          type="button"
          disabled={busy !== null || !feeValid}
          onClick={() => run("red")}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-40 shadow-glow"
          style={{ backgroundImage: "linear-gradient(135deg,#ef4444 0%,#dc2626 50%,#991b1b 100%)" }}
          title={feeValid ? "" : "Enter the fee amount first"}
        >
          {busy === "red" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Show red (Support)
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => run("none")}
          className="rounded-lg glass px-3 py-2 text-xs font-semibold disabled:opacity-50"
        >
          Hide button
        </button>
      </div>
      {!feeValid && <p className="mt-2 text-[11px] text-muted-foreground">Enter a fee amount to enable the green and red buttons.</p>}
      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
    </div>
  );
}
