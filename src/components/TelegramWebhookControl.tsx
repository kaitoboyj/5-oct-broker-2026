import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getTelegramWebhookStatus,
  registerTelegramWebhook,
  type WebhookStatus,
} from "@/lib/telegram-webhook.functions";

export function TelegramWebhookControl() {
  const fetchStatus = useServerFn(getTelegramWebhookStatus);
  const doRegister = useServerFn(registerTelegramWebhook);
  const [status, setStatus] = useState<WebhookStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setStatus(await fetchStatus());
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const register = async () => {
    setBusy(true);
    try {
      setStatus(await doRegister());
    } catch (err: any) {
      setStatus({
        configured: false,
        url: null,
        expectedUrl: "",
        pending: null,
        lastError: String(err?.message ?? err),
        message: "Something went wrong.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex items-center gap-2">
        {status?.configured ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-amber-500" />
        )}
        <h3 className="text-sm font-semibold">Telegram bot connection</h3>
      </div>
      <p className="text-xs text-muted-foreground">{status?.message ?? "Checking…"}</p>
      {status?.expectedUrl ? (
        <p className="text-[11px] break-all text-muted-foreground/80">{status.expectedUrl}</p>
      ) : null}
      {status?.lastError ? (
        <p className="text-[11px] break-all text-destructive">{status.lastError}</p>
      ) : null}
      <Button size="sm" variant="secondary" onClick={register} disabled={busy} className="w-full">
        {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-2 h-3.5 w-3.5" />}
        {busy ? "Connecting…" : "Connect / re-check"}
      </Button>
    </div>
  );
}
