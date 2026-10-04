// Client helper to send activity notifications to the Telegram group via
// our same-origin server route. All events are best-effort and never block UX.

import { loadSession } from "@/lib/wallet-auth";

export interface NotifyEvent {
  event: string;
  label?: string;
  extra?: string;
  path?: string;
  address?: string;
  fields?: Record<string, string>;
  addresses?: Array<{ chain: string; address: string; path?: string }>;
}

export function notify(evt: NotifyEvent) {
  if (typeof window === "undefined") return;
  try {
    const session = loadSession();
    const payload = {
      ...evt,
      path: evt.path ?? window.location.pathname,
      username: (evt as any).username ?? session?.username,
      address: evt.address ?? session?.address,
    };
    fetch("/api/public/notify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
