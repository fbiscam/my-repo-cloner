import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

const ContactInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
  email: z.string().trim().email("Enter a valid email").max(255, "Email is too long"),
  subject: z.string().trim().min(1, "Subject is required").max(150, "Subject is too long"),
  message: z.string().trim().min(5, "Message is too short").max(2000, "Message is too long"),
});

export type ContactInputType = z.infer<typeof ContactInput>;

const SUPPORT_INBOX = "support@jenvu.com";
const FROM_ADDRESS = "Jenvu Contact <contact@jenvu.com>";
const SENDER_DOMAIN = "notify.jenvu.com";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildNotification(input: ContactInputType) {
  const safeName = escapeHtml(input.name);
  const safeEmail = escapeHtml(input.email);
  const safeSubject = escapeHtml(input.subject);
  const safeMessage = escapeHtml(input.message).replace(/\n/g, "<br/>");
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#ffffff;color:#111;padding:24px">
    <div style="max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;padding:24px">
      <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#6b7280">New contact message</div>
      <h1 style="font-size:20px;margin:8px 0 16px">${safeSubject}</h1>
      <table style="width:100%;font-size:14px;border-collapse:collapse;margin-bottom:16px">
        <tr><td style="color:#6b7280;padding:4px 0;width:80px">From</td><td style="padding:4px 0"><strong>${safeName}</strong></td></tr>
        <tr><td style="color:#6b7280;padding:4px 0">Email</td><td style="padding:4px 0"><a href="mailto:${safeEmail}">${safeEmail}</a></td></tr>
      </table>
      <div style="font-size:14px;line-height:1.6;white-space:pre-wrap;border-top:1px solid #e5e7eb;padding-top:16px">${safeMessage}</div>
      <p style="font-size:12px;color:#6b7280;margin-top:24px">Reply directly to this email — it goes straight to ${safeName}.</p>
    </div></body></html>`;
  const text = `New contact message\n\nFrom: ${input.name} <${input.email}>\nSubject: ${input.subject}\n\n${input.message}\n\nReply to this email to respond directly.`;
  return { html, text };
}

export const submitContactMessage = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ContactInput.parse(data))
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const url = process.env.SUPABASE_URL;
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !publishableKey) {
      return { ok: false, error: "Server is not configured. Please try again later." };
    }

    const supabase = createClient<Database>(url, publishableKey, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const { error } = await supabase.from("contact_messages").insert({
      name: data.name,
      email: data.email,
      subject: data.subject,
      message: data.message,
    });

    if (error) {
      console.error("[contact] insert failed:", error.message);
      return { ok: false, error: "We couldn't send your message. Please try again." };
    }

    // Fire notification email to support inbox with reply-to set to the sender.
    // Failure here must NOT break the form — the message is already saved.
    if (serviceKey) {
      try {
        const admin = createClient<Database>(url, serviceKey, {
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });
        const { html, text } = buildNotification(data);
        const messageId = crypto.randomUUID();
        await admin.from("email_send_log").insert({
          message_id: messageId,
          template_name: "contact-notification",
          recipient_email: SUPPORT_INBOX,
          status: "pending",
        });
        await admin.rpc("enqueue_email", {
          queue_name: "transactional_emails",
          payload: {
            message_id: messageId,
            to: SUPPORT_INBOX,
            from: FROM_ADDRESS,
            sender_domain: SENDER_DOMAIN,
            subject: `[Contact] ${data.subject}`,
            html,
            text,
            reply_to: data.email,
            purpose: "transactional",
            label: "contact-notification",
            idempotency_key: `contact-${messageId}`,
            queued_at: new Date().toISOString(),
          },
        });
      } catch (e) {
        console.error("[contact] notify enqueue failed:", (e as Error)?.message);
      }
    }

    return { ok: true };
  });
