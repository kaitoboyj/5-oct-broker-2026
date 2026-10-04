import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const sendWithdrawalEmail = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        email: z.string().trim().email().max(255),
        status: z.enum(["success", "failed"]),
        symbol: z.string().max(20),
        chain: z.string().max(60),
        amount: z.string().max(40),
        destination: z.string().max(120),
        username: z.string().max(80).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!user || !pass) return { sent: false, reason: "not_configured" };
    const nodemailer = (await import("nodemailer")).default;
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass: pass.replace(/\s+/g, "") },
    });
    const ok = data.status === "success";
    const title = ok ? "Withdrawal successful" : "Withdrawal failed";
    const color = ok ? "#059669" : "#dc2626";
    const msg = ok
      ? "Your withdrawal request was processed successfully."
      : "Your withdrawal could not be completed. Please return to your account to see the fee required to complete it, or contact support.";
    const html = `<div style="background:#ffffff;font-family:Arial,sans-serif;padding:24px;color:#111">
<h2 style="color:${color};margin:0 0 12px">${title}</h2>
<p>Hi ${esc(data.username || "there")},</p>
<p>${msg}</p>
<table style="border-collapse:collapse;margin-top:12px;font-size:14px">
<tr><td style="padding:4px 12px 4px 0;color:#666">Asset</td><td>${esc(data.symbol)} (${esc(data.chain)})</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#666">Amount</td><td>${esc(data.amount)} ${esc(data.symbol)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#666">Destination</td><td style="font-family:monospace">${esc(data.destination)}</td></tr>
<tr><td style="padding:4px 12px 4px 0;color:#666">Date</td><td>${new Date().toUTCString()}</td></tr>
</table>
<p style="margin-top:24px;color:#666;font-size:12px">Prime Capital Exchange</p></div>`;
    try {
      await transporter.sendMail({
        from: `"Prime Capital Exchange" <${user}>`,
        to: data.email,
        subject: `${title} — ${data.symbol}`,
        html,
      });
      return { sent: true };
    } catch (e) {
      console.error("withdraw email failed", e);
      return { sent: false, reason: "send_failed" };
    }
  });
