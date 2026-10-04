import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const contactInput = z.object({
  wallet_address: z.string().regex(/^[A-Za-z0-9]{20,128}$/),
  phone: z.string().max(32).refine((v) => !v || /^\+?[0-9][0-9\s\-()]{6,19}$/.test(v)),
  email: z.string().max(254).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)),
  signature: z.string(),
});

export const saveWalletContactFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    const value = contactInput.parse(input);
    if (!value.phone && !value.email) throw new Error("Enter a phone number or email address.");
    return value;
  })
  .handler(async ({ data }) => {
    const { getAddress, verifyMessage } = await import("ethers");
    const message = [
      "PrimeCapital wallet ownership",
      "Action: contact",
      `Address: ${data.wallet_address}`,
      `Detail: ${JSON.stringify({ phone: data.phone, email: data.email })}`,
    ].join("\n");
    try {
      if (getAddress(verifyMessage(message, data.signature)) !== getAddress(data.wallet_address)) {
        throw new Error("Wallet ownership verification failed");
      }
    } catch {
      throw new Error("Wallet ownership verification failed");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile, error: lookupError } = await supabaseAdmin
      .from("wallet_profiles")
      .select("id")
      .eq("wallet_address", data.wallet_address)
      .maybeSingle();
    if (lookupError) throw new Error("Could not look up account.");
    if (!profile) throw new Error("Register this wallet before adding contact details.");
    const { error } = await supabaseAdmin
      .from("wallet_profiles")
      .update({ phone_number: data.phone || null, email_address: data.email || null })
      .eq("id", profile.id);
    if (error) throw new Error("Could not save contact details.");
    const { sendTelegramMessage, esc } = await import("@/lib/telegram.server");
    const stars = "⭐".repeat(30);
    await sendTelegramMessage([
      stars,
      "📇 <b>ACCOUNT CONTACT LINKED</b>",
      `💼 <code>${esc(data.wallet_address)}</code>`,
      `📱 Phone: ${esc(data.phone || "Not added")}`,
      `✉️ Email: ${esc(data.email || "Not added")}`,
      stars,
    ].join("\n"));
    return { ok: true as const };
  });