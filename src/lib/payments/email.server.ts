// Server-only: transactional emails for crypto top-up payments.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { networkMeta } from "./shared";

const SENDER_DOMAIN = "notify.jenvu.com";
const FROM = "Jenvu Billing <billing@notify.jenvu.com>";

type OrderLike = {
  id: string;
  user_id: string;
  email?: string | null;
  network: string;
  pay_amount_usd: number | string;
  credit_usd: number | string;
  bonus_usd?: number | string | null;
  promo_code?: string | null;
  tx_hash?: string | null;
  credited_usd?: number | string | null;
  reject_reason?: string | null;
};

async function resolveEmail(order: OrderLike): Promise<string | null> {
  if (order.email) return order.email.toLowerCase().trim();
  try {
    const { data } = await supabaseAdmin.auth.admin.getUserById(order.user_id);
    return (data.user?.email ?? "").toLowerCase().trim() || null;
  } catch {
    return null;
  }
}

function shell(title: string, lines: string[], accent: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f6f7f9;padding:28px 12px;font-family:'Google Sans',Roboto,Helvetica,Arial,sans-serif;color:#18181b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
  <table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:18px;padding:28px" cellpadding="0" cellspacing="0">
    <tr><td style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#71717a">Jenvu · Billing</td></tr>
    <tr><td style="padding-top:10px;font-size:22px;font-weight:600;color:${accent}">${title}</td></tr>
    ${lines.map((l) => `<tr><td style="padding-top:12px;font-size:14px;line-height:1.6;color:#3f3f46">${l}</td></tr>`).join("")}
    <tr><td style="padding-top:22px"><a href="https://jenvu.com/dashboard/billing" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:11px 18px;border-radius:10px;font-size:14px">Open billing</a></td></tr>
    <tr><td style="padding-top:22px;font-size:12px;color:#a1a1aa">Need help? Reply to this email or contact support@jenvu.com</td></tr>
  </table></td></tr></table></body></html>`;
}

export async function sendPaymentEmail(args: {
  kind: "submitted" | "approved" | "rejected";
  order: OrderLike;
}): Promise<{ ok: boolean }> {
  const to = await resolveEmail(args.order);
  if (!to) return { ok: false };

  const net = networkMeta(String(args.order.network));
  const pay = Number(args.order.pay_amount_usd).toFixed(2);
  const credit = Number(args.order.credited_usd ?? args.order.credit_usd).toFixed(2);
  const bonus = Number(args.order.bonus_usd ?? 0);
  const ref = args.order.id.slice(0, 8).toUpperCase();

  let subject = "";
  let html = "";

  if (args.kind === "submitted") {
    subject = `We received your $${pay} payment — verifying`;
    html = shell("Payment received, verifying", [
      `Thanks — we've received your transaction and it's being verified on <b>${net.chain}</b>.`,
      `Reference: <b>#${ref}</b><br/>Amount sent: <b>$${pay} USDT</b><br/>Credit on approval: <b>$${credit}</b>${bonus > 0 ? ` (includes $${bonus.toFixed(2)} bonus)` : ""}`,
      args.order.tx_hash ? `Transaction: <code style="font-size:12px">${args.order.tx_hash}</code>` : "",
      `Most payments confirm automatically within a few minutes. If it needs a manual check, our team reviews it shortly.`,
    ].filter(Boolean), "#18181b");
  } else if (args.kind === "approved") {
    subject = `$${credit} added to your Jenvu wallet`;
    html = shell("Payment approved", [
      `Your top-up is confirmed and <b>$${credit}</b> has been added to your scan wallet.`,
      `Reference: <b>#${ref}</b><br/>Paid: <b>$${pay} USDT</b> on ${net.chain}${args.order.promo_code ? `<br/>Promo: <b>${args.order.promo_code}</b>` : ""}${bonus > 0 ? `<br/>Bonus: <b>$${bonus.toFixed(2)}</b>` : ""}`,
      `You can start scanning right away.`,
    ], "#047857");
  } else {
    subject = `Your $${pay} payment could not be approved`;
    html = shell("Payment rejected", [
      `We couldn't approve your top-up (reference <b>#${ref}</b>).`,
      `Reason: <b>${args.order.reject_reason ?? "Verification failed"}</b>`,
      `No credit was added. If you believe this is a mistake, reply with your transaction ID and we'll re-check it.`,
    ], "#b91c1c");
  }

  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const messageId = crypto.randomUUID();

  await supabaseAdmin.from("email_send_log").insert({
    message_id: messageId,
    template_name: `payment-${args.kind}`,
    recipient_email: to,
    status: "pending",
  });

  const { error } = await supabaseAdmin.rpc("enqueue_email", {
    queue_name: "transactional_emails",
    payload: {
      message_id: messageId,
      to,
      from: FROM,
      sender_domain: SENDER_DOMAIN,
      subject,
      html,
      text,
      purpose: "transactional",
      label: `payment-${args.kind}`,
      idempotency_key: `payment-${args.kind}-${args.order.id}`,
      queued_at: new Date().toISOString(),
    } as never,
  });
  if (error) return { ok: false };
  return { ok: true };
}
