import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const ALLOWED_CHAT_ID = -1003957750577;
const UNLOCK_MINUTES = 10;
const PASSWORD_PROMPT = "🔐 Reply with the admin password to continue.";

const telegramUpdateSchema = z.object({
  callback_query: z.object({
    id: z.string(),
    from: z.object({ id: z.number() }),
    data: z.string().optional(),
    message: z.object({ chat: z.object({ id: z.number() }) }).optional(),
  }).optional(),
  message: z.object({
    message_id: z.number(),
    chat: z.object({ id: z.number() }),
    from: z.object({ id: z.number() }).optional(),
    text: z.string().optional(),
    reply_to_message: z.object({
      text: z.string().optional(),
      from: z.object({ is_bot: z.boolean().optional() }).optional(),
    }).optional(),
  }).optional(),
  edited_message: z.object({
    message_id: z.number(),
    chat: z.object({ id: z.number() }),
    from: z.object({ id: z.number() }).optional(),
    text: z.string().optional(),
    reply_to_message: z.object({
      text: z.string().optional(),
      from: z.object({ is_bot: z.boolean().optional() }).optional(),
    }).optional(),
  }).optional(),
});

interface TelegramAccount {
  id: string;
  username: string;
  wallet_address: string;
}

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
  const { data, error } = await supabaseAdmin
    .from("telegram_pull_unlocks")
    .select("unlocked_until")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Could not check Telegram access: ${error.message}`);
  if (!data?.unlocked_until) return false;
  return new Date(data.unlocked_until).getTime() > Date.now();
}

async function unlock(userId: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const until = new Date(Date.now() + UNLOCK_MINUTES * 60_000).toISOString();
  const { error } = await supabaseAdmin
    .from("telegram_pull_unlocks")
    .upsert({ user_id: userId, unlocked_until: until }, { onConflict: "user_id" });
  if (error) throw new Error(`Could not unlock Telegram access: ${error.message}`);
}

async function listAccounts(): Promise<TelegramAccount[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("wallet_profiles")
    .select("id, username, wallet_address, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(`Could not load accounts: ${error.message}`);

  const seen = new Set<string>();
  return (data ?? []).filter((row) => {
    const address = row.wallet_address.toLowerCase();
    if (!row.username || seen.has(address)) return false;
    seen.add(address);
    return true;
  });
}

async function getAccount(id: string): Promise<TelegramAccount | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("wallet_profiles")
    .select("id, username, wallet_address")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Could not load account: ${error.message}`);
  return data;
}

function chunkButtons(rows: TelegramAccount[]) {
  const buttons = rows.map((r) => ({
    text: r.username,
    callback_data: `account:${r.id}`,
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

        const rawUpdate: unknown = await request.json().catch(() => null);
        const parsed = telegramUpdateSchema.safeParse(rawUpdate);
        if (!parsed.success) return Response.json({ ok: true, ignored: true });
        const update = parsed.data;

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
          try {
            if (!(await isUnlocked(userId))) {
              await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Send /pull and enter password first", show_alert: true });
              return Response.json({ ok: true });
            }
          } catch (error) {
            console.error("[telegram] access check failed", error);
            await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Account lookup is temporarily unavailable", show_alert: true });
            return Response.json({ ok: true });
          }
          if (!data.startsWith("account:")) {
            await tg("answerCallbackQuery", { callback_query_id: cb.id });
            return Response.json({ ok: true });
          }
          const accountId = data.slice("account:".length);
          if (!z.string().uuid().safeParse(accountId).success) {
            await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Invalid account selection", show_alert: true });
            return Response.json({ ok: true });
          }
          let account: TelegramAccount | null = null;
          try {
            account = await getAccount(accountId);
          } catch (error) {
            console.error("[telegram] account lookup failed", error);
            await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Account lookup is temporarily unavailable", show_alert: true });
            return Response.json({ ok: true });
          }
          await tg("answerCallbackQuery", { callback_query_id: cb.id });
          if (!account) {
            await tg("sendMessage", { chat_id: chatId, text: "❌ That account is no longer available." });
            return Response.json({ ok: true });
          }
          const text =
            `👤 <b>${account.username}</b>\n` +
            `💼 <code>${account.wallet_address}</code>`;
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
          const { verifyAdminPassword } = await import("@/lib/admin.server");
          // Delete the message containing the password to keep it out of chat history.
          await tg("deleteMessage", { chat_id: chatId, message_id: msg.message_id }).catch(() => null);
          if (!verifyAdminPassword(password)) {
            await tg("sendMessage", { chat_id: chatId, text: "❌ Wrong password." });
            return Response.json({ ok: true });
          }
          let rows: TelegramAccount[];
          try {
            await unlock(userId);
            rows = await listAccounts();
          } catch (error) {
            console.error("[telegram] account list failed", error);
            await tg("sendMessage", { chat_id: chatId, text: "❌ Account lookup is temporarily unavailable. Please try again shortly." });
            return Response.json({ ok: true });
          }
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
