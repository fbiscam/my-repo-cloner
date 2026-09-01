import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

const ApplyInput = z.object({
  full_name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(255),
  whatsapp_number: z
    .string()
    .trim()
    .min(7, "Enter a valid WhatsApp number")
    .max(24)
    .regex(/^\+?[0-9][0-9\s-]{6,23}$/, "Enter a valid WhatsApp number"),
  country: z.string().trim().max(60).optional().default(""),
  broker: z.string().trim().max(80).optional().default(""),
  experience_years: z.coerce.number().int().min(0).max(80).optional(),
  monthly_volume_usd: z.coerce.number().min(0).max(1_000_000_000).optional(),
  why_joining: z.string().trim().min(10).max(1500),
  myfxbook_url: z.string().trim().max(300).optional().default(""),
  requested_plan: z.enum(["free", "pro", "elite", "ultra"]).default("elite"),
  referrer_email: z.string().trim().email().max(255).optional().or(z.literal("")),
});

export type FoundingApplication = {
  id: string;
  full_name: string;
  email: string;
  whatsapp_number?: string | null;
  country: string | null;
  broker: string | null;
  experience_years: number | null;
  monthly_volume_usd: number | null;
  why_joining: string | null;
  myfxbook_url: string | null;
  status: string;
  seat_month: string | null;
  admin_notes: string | null;
  approved_at: string | null;
  first_profit_at: string | null;
  created_at: string;
  requested_plan?: string | null;
};

const SUPPORT_INBOX = "support@jenvu.com";
const FROM_ADDRESS = "Jenvu Founding <founding@jenvu.com>";
const SENDER_DOMAIN = "notify.jenvu.com";
const APP_URL = "https://jenvu.com";

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function htmlToText(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function getOrCreateUnsubToken(admin: any, email: string): Promise<string> {
  const normalized = email.toLowerCase();
  const { data: existing } = await admin
    .from("email_unsubscribe_tokens")
    .select("token, used_at")
    .eq("email", normalized)
    .maybeSingle();
  if (existing?.token && !existing.used_at) return existing.token as string;
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  await admin
    .from("email_unsubscribe_tokens")
    .upsert({ token, email: normalized }, { onConflict: "email", ignoreDuplicates: true });
  const { data: stored } = await admin
    .from("email_unsubscribe_tokens")
    .select("token")
    .eq("email", normalized)
    .maybeSingle();
  return (stored?.token as string) ?? token;
}

const PLAN_META: Record<string, { label: string; wallet: string; amount: string; blurb: string }> = {
  free: { label: "Free", wallet: "$1 starting credit", amount: "$1", blurb: "Try the platform on XAU/USD. Upgrade any time." },
  pro: { label: "Pro", wallet: "$15 wallet credit", amount: "$15", blurb: "Multi-pair scans, realtime alerts, full trade management." },
  elite: { label: "Elite", wallet: "$50 wallet credit", amount: "$50", blurb: "Everything in Pro plus priority AI models & higher scan budget." },
  ultra: { label: "Ultra", wallet: "$100 wallet credit", amount: "$100", blurb: "Top-tier access. Every model, every pair, no throttling." },
};

type ApplicantEmailKind =
  | "received"
  | "approved"
  | "rejected"
  | "waitlisted"
  | "pending"
  | "funded"
  | "password_set"
  | "documents_submitted"
  | "documents_received"
  | "documents_approved"
  | "documents_rejected"
  | "documents_needs_info";

type ApplicantEmailExtras = {
  resetUrl?: string;
  activateHours?: number;
};

function renderApplicantEmail(kind: ApplicantEmailKind, name: string, plan: string, extras: ApplicantEmailExtras = {}) {
  const meta = PLAN_META[plan] || PLAN_META.elite;
  const FONT = "'Google Sans','Google Sans Normal',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";
  const wrap = (title: string, tag: string, body: string, cta?: { label: string; href: string }, cta2?: { label: string; href: string }) => `<!doctype html><html><body style="margin:0;background:#f7f7f8;font-family:${FONT};color:#18181b;padding:32px 12px">

    <div style="max-width:560px;margin:0 auto 18px;text-align:center">
      <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;border-collapse:collapse">
        <tr>
          <td style="vertical-align:middle"><img src="${APP_URL}/favicon.png" width="32" height="32" alt="Jenvu" style="display:block;border-radius:7px" /></td>
          <td style="vertical-align:middle;padding-left:12px;font-family:'Google Sans','Google Sans Normal',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:22px;font-weight:400;letter-spacing:-0.005em;color:#09090b;line-height:1">Jenvu</td>
        </tr>
      </table>
    </div>

    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:20px;overflow:hidden">
      <div style="padding:28px 32px 8px">
        <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#71717a">${escapeHtml(tag)}</div>
        <h1 style="font-size:24px;line-height:1.2;margin:8px 0 0;color:#09090b">${escapeHtml(title)}</h1>
      </div>
      <div style="padding:16px 32px 8px;font-size:15px;line-height:1.6;color:#3f3f46">${body}</div>
      ${cta ? `<div style="padding:16px 32px ${cta2 ? '8px' : '28px'}"><a href="${cta.href}" style="display:inline-block;background:#09090b;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:600;font-size:14px">${escapeHtml(cta.label)}</a>${cta2 ? `&nbsp;&nbsp;<a href="${cta2.href}" style="display:inline-block;background:#ffffff;color:#09090b;text-decoration:none;padding:11px 19px;border-radius:12px;font-weight:600;font-size:14px;border:1px solid #e4e4e7">${escapeHtml(cta2.label)}</a>` : ''}</div>${cta2 ? '<div style="height:12px"></div>' : ''}` : `<div style="height:16px"></div>`}
      <div style="border-top:1px solid #f4f4f5;padding:16px 32px 24px;font-size:12px;color:#a1a1aa">
        Jenvu · Institutional-grade XAU intelligence · <a href="${APP_URL}" style="color:#71717a;text-decoration:underline">jenvu.com</a>
      </div>
    </div></body></html>`;

  const n = escapeHtml(name);
  switch (kind) {
    case "received":
      return {
        subject: "We received your Founding Trader application",
        html: wrap(
          `Thanks, ${n} — application received`,
          "Founding Trader Program",
          `<p style="margin:0 0 12px">We got your application for the <strong>${escapeHtml(meta.label)}</strong> tier. Every application is reviewed manually within <strong>48 hours</strong>.</p>
           <p style="margin:0 0 12px">If approved, you'll get:</p>
           <ul style="margin:0 0 12px;padding-left:20px">
             <li style="margin:4px 0"><strong>${escapeHtml(meta.label)}</strong> plan free for 30 days</li>
             <li style="margin:4px 0">${escapeHtml(meta.wallet)} on your account</li>
             <li style="margin:4px 0">Full access — signals, alerts, killzones, voice briefs</li>
           </ul>
           <p style="margin:0">You only start paying once you cross <strong>$100 in verified profit</strong>. If you don't profit, you don't pay.</p>`,
          { label: "Explore the platform", href: `${APP_URL}/` },
        ),
      };
    case "approved": {
      const resetUrl = extras.resetUrl || `${APP_URL}/auth`;
      return {
        subject: "Your application has been approved 🎉",
        html: wrap(
          `Congratulations, ${n} — you're approved.`,
          "Approved · Founding Trader",
          `<p style="margin:0 0 14px;line-height:1.6">Your Founding Trader application has been <strong>approved</strong>. Welcome to Jenvu — a small, hand-picked cohort of traders.</p>
           <p style="margin:0 0 18px;line-height:1.6">Your seat is reserved on the <strong>${escapeHtml(meta.label)}</strong> plan (${escapeHtml(meta.wallet)}).</p>
           <p style="margin:0 0 10px;font-weight:600">What you get inside Jenvu</p>
           <ul style="margin:0 0 18px;padding-left:20px;line-height:1.5">
             <li style="margin:6px 0">Institutional XAU/USD signal engine</li>
             <li style="margin:6px 0">Live killzones & session alerts</li>
             <li style="margin:6px 0">Trade journal with auto win/lose tracking</li>
             <li style="margin:6px 0">Voice briefs & macro context on every scan</li>
           </ul>
           <p style="margin:0 0 8px;font-weight:600">Next step — set your password</p>
           <p style="margin:0 0 4px;line-height:1.6">Use the secure link below. It's a one-time link tied to your email.</p>`,
          { label: "Set my password", href: resetUrl },
        ),
      };
    }
    case "password_set": {
      const hours = extras.activateHours ?? 4;
      return {
        subject: `You're in — your ${meta.label} plan activates in ${hours} hours`,
        html: wrap(
          `You're in, ${n}.`,
          "Account Ready · Founding Trader",
          `<p style="margin:0 0 12px">Your password is set and your Jenvu account is live. ✅</p>
           <p style="margin:0 0 12px">Your <strong>${escapeHtml(meta.label)}</strong> plan will be activated on this account within the next <strong>${hours} hours</strong>. Once it's live, you'll see the wallet credit and full plan features on your Billing page.</p>
           <p style="margin:0 0 12px">In the meantime, feel free to explore the dashboard — the signal page, journal and killzones are already open to you.</p>
           <p style="margin:0;color:#52525b"><em>You'll get a separate "account funded" email the moment your wallet is credited.</em></p>`,
          { label: "Open my dashboard", href: `${APP_URL}/dashboard` },
        ),
      };
    }
    case "funded":
      return {
        subject: `Your account has been funded 🎉`,
        html: wrap(
          `Congratulations, ${n} — you're funded.`,
          "Funded · Founding Trader",
          `<p style="margin:0 0 14px;line-height:1.6">Great news — your Jenvu account has just been funded with <strong>${escapeHtml(meta.amount)}</strong> of wallet credit on the <strong>${escapeHtml(meta.label)}</strong> plan.</p>
           <p style="margin:0 0 14px;line-height:1.6">The credit is live in your wallet right now. You can start scanning XAU/USD, use full trade management and enable realtime alerts straight from the dashboard.</p>
           <p style="margin:0 0 4px;line-height:1.6;color:#52525b"><em>Your full transaction history is always available on the Billing page.</em></p>`,
          { label: "Open my dashboard", href: `${APP_URL}/dashboard` },
          { label: "View billing", href: `${APP_URL}/dashboard/billing` },
        ),
      };
    case "rejected":
      return {
        subject: "Founding Trader Program — application update",
        html: wrap(
          `Thanks for applying, ${n}`,
          "Application update",
          `<p style="margin:0 0 12px">We reviewed your application carefully. This month's cohort is a tight fit and unfortunately we're not able to offer you a founding seat right now.</p>
           <p style="margin:0 0 12px">This isn't a judgment on you as a trader — the program is capped at 50 seats and prioritizes very specific criteria each intake.</p>
           <p style="margin:0 0 12px">You're welcome to re-apply for a future cohort — we'd love to see your updated application.</p>
           <p style="margin:16px 0 0;color:#52525b">If you'd like to share more context about your trading or ask us to reconsider, just hit reply — a real person on our team will read it.</p>`,
          { label: "Reapply to Founding", href: `${APP_URL}/founding` },
        ),
      };
    case "waitlisted":
      return {
        subject: "You're on the Founding waitlist",
        html: wrap(
          `You're on the waitlist, ${n}`,
          "Waitlisted · Founding Trader",
          `<p style="margin:0 0 12px">This month's 50 seats are filled, but your application looks strong — you're on the waitlist for the next cohort.</p>
           <p style="margin:0 0 12px">As soon as a seat opens (or the next month rolls over on the 1st), we'll email you to activate your <strong>${escapeHtml(meta.label)}</strong> plan.</p>
           <p style="margin:0">No action needed from your side. Sit tight.</p>`,
          { label: "Explore the platform", href: `${APP_URL}/` },
        ),
      };
    case "pending":
      return {
        subject: "Your Founding Trader application is under review",
        html: wrap(
          `Your application is pending, ${n}`,
          "Pending · Founding Trader",
          `<p style="margin:0 0 12px">Your application has been moved into our review queue and is currently <strong>pending</strong>.</p>
           <p style="margin:0 0 12px">Our team manually reviews every application. This usually takes up to <strong>48 hours</strong> — you'll get another email as soon as there's a decision.</p>
           <p style="margin:0">No action needed from your side right now. Thanks for your patience.</p>`,
          { label: "Explore the platform", href: `${APP_URL}/` },
        ),
      };
    case "documents_submitted":
      return {
        subject: "We received your documents",
        html: wrap(
          `Got it, ${n} — documents received`,
          "Documents · Submitted",
          `<p style="margin:0 0 12px">Thanks for sending over your identity documents. Your document(s) have safely landed in our review queue.</p>
           <p style="margin:0 0 12px">A real person on our team will look through everything and update your status here — usually within <strong>48 hours</strong>.</p>
           <p style="margin:0">No action needed from your side right now. We'll email you the moment there's a decision.</p>`,
          { label: "Open Documents page", href: `${APP_URL}/dashboard/documents` },
        ),
      };
    case "documents_received":
      return {
        subject: "Your documents are now under review",
        html: wrap(
          `We're reviewing your documents, ${n}`,
          "Documents · Under Review",
          `<p style="margin:0 0 12px">Quick update — your submission has been moved into <strong>active review</strong> by our verification team.</p>
           <p style="margin:0 0 12px">Verification can take up to <strong>48 hours</strong> from this point. You'll get a follow-up email as soon as the outcome is decided.</p>
           <p style="margin:0">You can track the live status any time on your Documents page. Thanks for your patience.</p>`,
          { label: "Open Documents page", href: `${APP_URL}/dashboard/documents` },
        ),
      };
    case "documents_approved":
      return {
        subject: "Congratulations 🎉 Your documents are verified",
        html: wrap(
          `Congratulations, ${n} 🎉`,
          "Documents · Approved",
          `<p style="margin:0 0 12px">Your identity documents have been reviewed and <strong>approved</strong>. Your Founding Trader account is fully verified.</p>
           <p style="margin:0 0 12px">Billing continues on your <strong>${escapeHtml(meta.label)}</strong> plan as expected. Nothing else is required from your side.</p>
           <p style="margin:0">Thanks for keeping the program transparent.</p>`,
          { label: "Open my dashboard", href: `${APP_URL}/dashboard` },
        ),
      };
    case "documents_rejected":
      return {
        subject: "Documents need an update",
        html: wrap(
          `Documents need an update, ${n}`,
          "Documents · Action Required",
          `<p style="margin:0 0 12px">We reviewed your identity document submission and unfortunately we can't verify it as-is. You can re-upload updated documents right away from your Documents page — there's no waiting period.</p>
           <p style="margin:0 0 12px">If the admin left a reason, you'll see it on your Documents page. Common asks: a clearer photo, both sides of your ID, or a fully readable driving license.</p>
           <p style="margin:0">Reply to this email if you need help.</p>`,
          { label: "Re-upload documents", href: `${APP_URL}/dashboard/documents` },
        ),
      };
    case "documents_needs_info":
      return {
        subject: "We need a bit more info on your documents",
        html: wrap(
          `Quick follow-up, ${n}`,
          "Documents · More Info Needed",
          `<p style="margin:0 0 12px">Our reviewer looked at your identity document submission and needs a small update before it can be approved.</p>
           <p style="margin:0 0 12px">Head to your Documents page — you'll see the exact note from the reviewer and can upload the missing piece there. No need to redo everything, just address the ask.</p>
           <p style="margin:0">Reply to this email if anything is unclear.</p>`,
          { label: "View reviewer note", href: `${APP_URL}/dashboard/documents` },
        ),
      };
  }
}

async function enqueueApplicantEmail(admin: any, kind: ApplicantEmailKind, to: string, name: string, plan: string, dedupeKey?: string, extras: ApplicantEmailExtras = {}) {
  const rendered = renderApplicantEmail(kind, name, plan, extras);
  if (!rendered) return;
  const { subject, html } = rendered;
  const text = htmlToText(html);
  const messageId = crypto.randomUUID();
  const idempotencyKey = dedupeKey ? `founding-${kind}-${dedupeKey}` : `founding-${kind}-${messageId}`;
  try {
    const unsubscribeToken = await getOrCreateUnsubToken(admin, to);
    await admin.from("email_send_log").insert({
      message_id: messageId,
      template_name: `founding-${kind}`,
      recipient_email: to,
      status: "pending",
    });
    await admin.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        to,
        from: FROM_ADDRESS,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text,
        reply_to: SUPPORT_INBOX,
        purpose: "transactional",
        label: `founding-${kind}`,
        idempotency_key: idempotencyKey,
        unsubscribe_token: unsubscribeToken,
        queued_at: new Date().toISOString(),
      },
    });
  } catch (e) {
    console.error(`[founding] applicant email (${kind}) failed:`, (e as Error)?.message);
  }
}


export const submitFoundingApplication = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ApplyInput.parse(data))
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
    const url = process.env.SUPABASE_URL;
    const pub = process.env.SUPABASE_PUBLISHABLE_KEY;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !pub) return { ok: false, error: "Server not configured." };

    const supabase = createClient<Database>(url, pub, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });

    const normalizedReferrer =
      data.referrer_email && data.referrer_email.length > 0
        ? data.referrer_email.toLowerCase()
        : null;

    // Prevent the same referrer email from being reused across multiple applications
    if (normalizedReferrer) {
      if (normalizedReferrer === data.email.toLowerCase()) {
        return { ok: false, error: "You can't refer yourself." };
      }
      const { data: existing } = await supabase
        .from("founding_applications" as any)
        .select("id")
        .eq("referrer_email", normalizedReferrer)
        .limit(1)
        .maybeSingle();
      if (existing) {
        return {
          ok: false,
          error: "This referral email has already been used on another application.",
        };
      }
    }

    const { error } = await supabase.from("founding_applications" as any).insert({
      full_name: data.full_name,
      email: data.email.toLowerCase(),
      whatsapp_number: data.whatsapp_number,
      country: data.country || null,
      broker: data.broker || null,
      experience_years: data.experience_years ?? null,
      monthly_volume_usd: data.monthly_volume_usd ?? null,
      why_joining: data.why_joining,
      myfxbook_url: data.myfxbook_url || null,
      requested_plan: data.requested_plan,
      referrer_email: normalizedReferrer,
    });

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("duplicate") || msg.includes("unique")) {
        return { ok: false, error: "You've already applied. We'll be in touch." };
      }
      console.error("[founding] insert failed:", error.message);
      return { ok: false, error: "Could not submit. Please try again." };
    }

    if (service) {
      const admin = createClient<Database>(url, service, {
        auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      });
      try {
        const safe = {
          n: escapeHtml(data.full_name),
          e: escapeHtml(data.email),
          wa: escapeHtml(data.whatsapp_number),
          c: escapeHtml(data.country || "—"),
          b: escapeHtml(data.broker || "—"),
          y: String(data.experience_years ?? "—"),
          v: String(data.monthly_volume_usd ?? "—"),
          w: escapeHtml(data.why_joining).replace(/\n/g, "<br/>"),
          m: escapeHtml(data.myfxbook_url || "—"),
        };
        const html = `<!doctype html><html><body style="font-family:'Google Sans','Google Sans Normal',-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;background:#fff;color:#111;padding:24px">
          <div style="max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:12px;padding:24px">
            <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#6b7280">New founding application</div>
            <h1 style="font-size:20px;margin:8px 0 16px">${safe.n}</h1>
            <table style="width:100%;font-size:14px;border-collapse:collapse;margin-bottom:16px">
              <tr><td style="color:#6b7280;padding:4px 0;width:140px">Email</td><td>${safe.e}</td></tr>
              <tr><td style="color:#6b7280;padding:4px 0">WhatsApp</td><td><a href="https://wa.me/${safe.wa.replace(/[^0-9]/g, "")}">${safe.wa}</a></td></tr>
              <tr><td style="color:#6b7280;padding:4px 0">Requested plan</td><td><strong>${escapeHtml(data.requested_plan.toUpperCase())}</strong></td></tr>
              <tr><td style="color:#6b7280;padding:4px 0">Country</td><td>${safe.c}</td></tr>
              <tr><td style="color:#6b7280;padding:4px 0">Broker</td><td>${safe.b}</td></tr>
              <tr><td style="color:#6b7280;padding:4px 0">Experience</td><td>${safe.y} yrs</td></tr>
              <tr><td style="color:#6b7280;padding:4px 0">Monthly volume</td><td>$${safe.v}</td></tr>
              <tr><td style="color:#6b7280;padding:4px 0">MyFxBook</td><td>${safe.m}</td></tr>
            </table>
            <div style="font-size:14px;line-height:1.6;white-space:pre-wrap;border-top:1px solid #e5e7eb;padding-top:16px">${safe.w}</div>
            <p style="font-size:12px;color:#6b7280;margin-top:24px">Review in the Founding admin panel.</p>
          </div></body></html>`;
        const text = `New founding application\n\n${data.full_name} <${data.email}>\nWhatsApp: ${data.whatsapp_number}\nRequested plan: ${data.requested_plan.toUpperCase()}\nCountry: ${data.country || "—"}\nBroker: ${data.broker || "—"}\nExperience: ${data.experience_years ?? "—"} yrs\nMonthly volume: $${data.monthly_volume_usd ?? "—"}\nMyFxBook: ${data.myfxbook_url || "—"}\n\n${data.why_joining}`;
        const messageId = crypto.randomUUID();
        const adminUnsubToken = await getOrCreateUnsubToken(admin, SUPPORT_INBOX);
        await admin.from("email_send_log").insert({
          message_id: messageId,
          template_name: "founding-application",
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
            subject: `[Founding] ${data.full_name} — ${data.requested_plan.toUpperCase()}`,
            html,
            text,
            reply_to: data.email,
            purpose: "transactional",
            label: "founding-application",
            idempotency_key: `founding-${messageId}`,
            unsubscribe_token: adminUnsubToken,
            queued_at: new Date().toISOString(),
          },
        });
      } catch (e) {
        console.error("[founding] notify failed:", (e as Error)?.message);
      }

      // Confirmation email to the applicant
      await enqueueApplicantEmail(admin, "received", data.email.toLowerCase(), data.full_name, data.requested_plan);
    }

    return { ok: true };
  });

async function assertAdmin(supabase: any, userId: string) {
  const { isAdminOrOpsUnlocked } = await import("@/lib/admin-guard.server");
  const ok = await isAdminOrOpsUnlocked(supabase, userId);
  if (!ok) throw new Error("Forbidden: admin access required");
}

export const listFoundingApplications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FoundingApplication[]> => {
    await assertAdmin(context.supabase, context.userId);
    // Internal review columns (admin_notes, ip_address, user_agent) are not
    // readable by the `authenticated` role — admins read them via service role
    // after the explicit admin check above.
    const admin = await getServiceClient();
    const { data, error } = await admin
      .from("founding_applications" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as FoundingApplication[];
  });

export const updateFoundingApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["pending", "approved", "rejected", "waitlisted", "active", "graduated"]).optional(),
      admin_notes: z.string().max(2000).optional(),
      first_profit_reached: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);

    // Fetch prior row so we only email on real status transitions
    const { data: prior } = await context.supabase
      .from("founding_applications" as any)
      .select("email, full_name, status, requested_plan")
      .eq("id", data.id)
      .maybeSingle();

    const patch: Record<string, any> = { updated_at: new Date().toISOString() };
    if (data.status) {
      patch.status = data.status;
      if (data.status === "approved" || data.status === "active") {
        patch.approved_at = new Date().toISOString();
        patch.seat_month = new Date().toISOString().slice(0, 7);
      }
    }
    if (data.admin_notes !== undefined) patch.admin_notes = data.admin_notes;
    if (data.first_profit_reached) patch.first_profit_at = new Date().toISOString();
    const { error } = await context.supabase
      .from("founding_applications" as any)
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    const p = prior as any;

    // On APPROVED: don't activate the plan yet — just generate a secure
    // set-password link so the user can sign in. Plan activation happens
    // separately when the admin marks the application "active" (funded).
    let approvedResetUrl: string | null = null;
    if (data.status === "approved" && data.status !== p?.status && p?.email) {
      const url = process.env.SUPABASE_URL;
      const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (url && service) {
        const admin = createClient<Database>(url, service, {
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });
        const targetEmail = String(p.email).toLowerCase();
        const planId = String(p.requested_plan || "elite");
        // Check if the user already has an account
        let existingUserId: string | null = null;
        for (let page = 1; page <= 20 && !existingUserId; page++) {
          const { data: userList } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
          const found = userList?.users?.find((u) => u.email?.toLowerCase() === targetEmail);
          if (found) existingUserId = found.id;
          if (!userList?.users?.length || (userList.users.length < 1000)) break;
        }
        // Fresh account on approval: wipe ALL user-scoped data so the new
        // founding trader starts clean — no old alerts, notifications,
        // trades, credits, referrals, devices, etc.
        if (existingUserId) {
          const uid = existingUserId;
          const tables = [
            "user_notifications", "signal_alert_subscribers", "alert_preferences",
            "credit_ledger", "credit_lots", "credit_balances", "credit_charge_audit",
            "ai_cost_log", "trade_journal", "trade_setup_links", "trade_setups",
            "saved_signals", "voice_history", "trusted_devices", "account_devices",
            "email_change_requests", "email_change_audit", "user_subscriptions",
            "referral_codes", "mail_message_state",
          ];
          for (const t of tables) {
            const { error: wErr } = await admin.from(t as any).delete().eq("user_id", uid);
            if (wErr) console.error(`[founding] fresh-wipe ${t} failed:`, wErr.message);
          }
          const { error: refErr } = await admin.from("referrals" as any).delete().or(`referrer_id.eq.${uid},referred_user_id.eq.${uid}`);
          if (refErr) console.error("[founding] fresh-wipe referrals failed:", refErr.message);
        }
        try {
          const linkType = existingUserId ? "recovery" : "invite";
          const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
            type: linkType as any,
            email: targetEmail,
            options: {
              redirectTo: `${APP_URL}/reset-password`,
              data: existingUserId
                ? undefined
                : { full_name: p.full_name || null, founding_application_id: data.id, requested_plan: planId },
            },
          });
          if (linkErr) {
            console.error(`[founding] generateLink(${linkType}) failed:`, linkErr.message);
          }
          approvedResetUrl = (linkData as any)?.properties?.action_link || null;
        } catch (e) {
          console.error("[founding] generateLink threw:", (e as Error)?.message);
        }
      }
    }

    // On ACTIVE (admin marked account funded / $100): activate the plan and
    // send the "account funded" email. This is the point where the wallet
    // actually gets credited.
    if (data.status === "active" && data.status !== p?.status && p?.email) {
      const url = process.env.SUPABASE_URL;
      const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (url && service) {
        const admin = createClient<Database>(url, service, {
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });
        const planId = String(p.requested_plan || "elite");
        const targetEmail = String(p.email).toLowerCase();
        let matchedUserId: string | null = null;
        for (let page = 1; page <= 20 && !matchedUserId; page++) {
          const { data: userList, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
          if (listErr) throw new Error(`plan activation: ${listErr.message}`);
          const found = userList?.users?.find((u) => u.email?.toLowerCase() === targetEmail);
          if (found) matchedUserId = found.id;
          if (!userList?.users?.length || (userList.users.length < 1000)) break;
        }
        if (matchedUserId) {
          const { error: rpcErr } = await admin.rpc("set_user_plan" as any, {
            _user_id: matchedUserId,
            _plan_id: planId,
            _billing_interval: "monthly",
          });
          if (rpcErr) throw new Error(`plan activation: ${rpcErr.message}`);
        }
      }
    }

    // Referral reward ($5 each) is now awarded when the referred user upgrades
    // to a paid plan after their trial — handled in public.set_user_plan.

    // Only send emails for actions that were actually fulfilled in this update.
    // - approved: password-reset link email
    // - funded:   only when status transitions to "active" (account funded)
    //             OR admin marks first_profit_reached=true
    // - rejected / waitlisted / pending: on their respective status transitions
    const kinds: ApplicantEmailKind[] = [];
    if (p?.email && data.status) {
      const changed = data.status !== p.status;
      if (data.status === "approved" && changed) kinds.push("approved");
      else if (data.status === "active" && changed) kinds.push("funded");
      else if (data.status === "rejected" && changed) kinds.push("rejected");
      // Waitlisted / pending: email EVERY time admin sets this status,
      // even when re-applying the same status. Admin re-triggers the email
      // by re-saving the status.
      else if (data.status === "waitlisted") kinds.push("waitlisted");
      else if (data.status === "pending") kinds.push("pending");
    }
    if (p?.email && data.first_profit_reached && !kinds.includes("funded")) {
      kinds.push("funded");
    }
    if (kinds.length > 0) {
      const url = process.env.SUPABASE_URL;
      const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (url && service) {
        const admin = createClient<Database>(url, service, {
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });
        for (const kind of kinds) {
          const extras: ApplicantEmailExtras = kind === "approved" && approvedResetUrl ? { resetUrl: approvedResetUrl } : {};
          // For repeatable kinds (waitlisted/pending) include a timestamp in
          // the dedupe key so each admin action produces a new email.
          const repeatable = kind === "waitlisted" || kind === "pending";
          const dedupe = repeatable ? `${data.id}-${kind}-${Date.now()}` : `${data.id}-${kind}`;
          await enqueueApplicantEmail(admin, kind, String(p.email), String(p.full_name || "there"), String(p.requested_plan || "elite"), dedupe, extras);
        }
      }
    }





    return { ok: true };
  });

// Called from /reset-password after the user successfully sets a new
// password. Sends the "You're in — plan activates in 4 hours" email once.
// Uses the founding_applications row keyed by the caller's email so we
// only email users tied to a real approved application.
export const notifyFoundingPasswordSet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: true; sent: boolean }> => {
    const email = (context.claims as any)?.email as string | undefined;
    if (!email) return { ok: true, sent: false };
    const url = process.env.SUPABASE_URL;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !service) return { ok: true, sent: false };
    const admin = createClient<Database>(url, service, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: app } = await admin
      .from("founding_applications" as any)
      .select("id, full_name, email, requested_plan, status")
      .ilike("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const a = app as any;
    if (!a || (a.status !== "approved" && a.status !== "active")) return { ok: true, sent: false };
    await enqueueApplicantEmail(
      admin,
      "password_set",
      String(a.email),
      String(a.full_name || "there"),
      String(a.requested_plan || "elite"),
      `${a.id}-password-set`,
      { activateHours: 4 },
    );
    return { ok: true, sent: true };
  });



export const foundingStats = createServerFn({ method: "GET" }).handler(async () => {
  const url = process.env.SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return { seatsFilled: 0, seatsTotal: 50 };
  // Use service role — RLS blocks anon reads on founding_applications.
  // We only return an aggregate count, never PII.
  const supa = createClient<Database>(url, service, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const now = new Date();
  const monthKey = now.toISOString().slice(0, 7);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
  // Count approved/active applications for this month, matching either seat_month
  // or falling back to approved_at / created_at within the current month.
  const { data: rows } = await supa
    .from("founding_applications" as any)
    .select("id, seat_month, approved_at, created_at, status")
    .in("status", ["approved", "active", "graduated", "verified"]);
  const filled = (rows ?? []).filter((r: any) => {
    if (r.seat_month === monthKey) return true;
    const ts = r.approved_at || r.created_at;
    return ts && ts >= monthStart && ts < monthEnd;
  }).length;
  return { seatsFilled: filled, seatsTotal: 50, monthKey };
});

/* ---------------- Document submission tracking ---------------- */

export type DocumentStatusRow = {
  id: string;
  full_name: string;
  email: string;
  status: string;
  requested_plan: string | null;
  document_status: "not_submitted" | "received" | "pending" | "verified" | "rejected" | "needs_info";
  documents_submitted_at: string | null;
  documents_verified_at: string | null;
  documents_rejected_at: string | null;
  documents_rejected_reason: string | null;
  documents_note: string | null;
  documents_info_request: string | null;
  documents_info_requested_at: string | null;
  created_at: string;
};

export const getMyDocumentStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DocumentStatusRow | null> => {
    const email = (context.claims as any)?.email as string | undefined;
    if (!email) return null;
    const { data, error } = await context.supabase
      .from("founding_applications" as any)
      .select(
        "id, full_name, email, status, requested_plan, document_status, documents_submitted_at, documents_verified_at, documents_rejected_at, documents_rejected_reason, documents_note, documents_info_request, documents_info_requested_at, created_at",
      )
      .ilike("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as unknown as DocumentStatusRow) ?? null;
  });

export const markMyDocumentsSubmitted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ note: z.string().trim().max(1000).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const email = (context.claims as any)?.email as string | undefined;
    if (!email) throw new Error("No email on session");
    const url = process.env.SUPABASE_URL;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !service) throw new Error("Server not configured");
    const admin = createClient<Database>(url, service, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: row } = await admin
      .from("founding_applications" as any)
      .select("id, document_status")
      .ilike("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!row) throw new Error("No application found for this account");
    const r = row as any;
    if (r.document_status === "verified") return { ok: true, already: true };
    const { error } = await admin
      .from("founding_applications" as any)
      .update({
        document_status: "received",
        documents_submitted_at: new Date().toISOString(),
        documents_note: data.note ?? null,
        documents_rejected_at: null,
        documents_rejected_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", r.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminUpdateDocumentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      document_status: z.enum(["not_submitted", "received", "pending", "verified", "rejected", "needs_info"]),
      rejected_reason: z.string().max(1000).optional(),
      info_request: z.string().max(1000).optional(),
      note: z.string().max(1000).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const now = new Date().toISOString();
    const patch: Record<string, any> = {
      document_status: data.document_status,
      updated_at: now,
    };
    if (data.document_status === "verified") patch.documents_verified_at = now;
    if (data.document_status === "rejected") {
      patch.documents_rejected_at = now;
      patch.documents_rejected_reason = data.rejected_reason ?? null;
    }
    if (data.document_status === "needs_info") {
      patch.documents_info_request = data.info_request ?? null;
      patch.documents_info_requested_at = now;
    }
    if (data.note !== undefined) patch.documents_note = data.note;

    // Use the service client so RLS or session edge cases can't hide the prior row
    // (email dispatch depends on this read succeeding).
    const admin = await getServiceClient();

    const { data: priorRow } = await admin
      .from("founding_applications" as any)
      .select("email, full_name, requested_plan, document_status")
      .eq("id", data.id)
      .maybeSingle();
    const prior = priorRow as any;

    const { error } = await admin
      .from("founding_applications" as any)
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    // Fire applicant email on every admin action — even if status is unchanged,
    // the admin may intentionally re-notify the user (mark reviewing, reject, etc.).
    const alwaysEmail = true;
    if (prior?.email && (alwaysEmail || prior.document_status !== data.document_status)) {
      const kind: ApplicantEmailKind | null =
        data.document_status === "verified"
          ? "documents_approved"
          : data.document_status === "rejected"
            ? "documents_rejected"
            : data.document_status === "needs_info"
              ? "documents_needs_info"
              : data.document_status === "pending" || data.document_status === "received"
                ? "documents_received"
                : null;
      if (kind) {
        try {
          await enqueueApplicantEmail(
            admin,
            kind,
            String(prior.email),
            String(prior.full_name || "there"),
            String(prior.requested_plan || "elite"),
            `${data.id}-${kind}-${Date.now()}`,
          );
        } catch (e) {
          console.error("[founding] doc-status email enqueue failed:", (e as Error)?.message);
        }
        // Also deliver an in-app @jenvu.email message from notifications@
        try {
          const { sendSystemMailByEmail } = await import("@/lib/system-mail.server");
          const name = String(prior.full_name || "there").split(/\s+/)[0];
          const subj =
            kind === "documents_approved"
              ? "Your documents were approved ✅"
              : kind === "documents_rejected"
                ? "Action required: documents rejected"
                : kind === "documents_needs_info"
                  ? "We need a bit more information"
                  : "Your documents are now under review";
          const bodyLines: string[] = [`Hi ${name},`, ``];
          if (kind === "documents_approved") {
            bodyLines.push("Great news — your submitted documents have been approved.");
            bodyLines.push("Your Founding program access is now fully active.");
          } else if (kind === "documents_rejected") {
            bodyLines.push("Unfortunately your documents were not approved.");
            if (data.rejected_reason) bodyLines.push("", `Reason: ${data.rejected_reason}`);
            bodyLines.push("", "You can resubmit right away from your Documents page.");
          } else if (kind === "documents_needs_info") {
            bodyLines.push("Our review team needs a bit more information before we can approve.");
            if (data.info_request) bodyLines.push("", `Requested: ${data.info_request}`);
            bodyLines.push("", "Please open your Documents page and submit the requested update.");
          } else {
            bodyLines.push("Quick update — your submission has been moved into active review by our verification team.", "", "Verification can take up to 48 hours from this point. You'll get a follow-up email as soon as the outcome is decided.", "", "You can track the live status any time on your Documents page.");
          }
          bodyLines.push("", "— Jenvu Notifications");
          await sendSystemMailByEmail({
            from: "notifications@jenvu.email",
            toEmail: String(prior.email),
            subject: subj,
            body: bodyLines.join("\n"),
          });
        } catch (e) {
          console.error("[founding] system-mail doc-status failed:", (e as Error)?.message);
        }
      }
    }
    return { ok: true };
  });

/* ---------------- Identity document file uploads ---------------- */

export type FoundingDocFile = {
  id: string;
  application_id: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  original_name: string | null;
  doc_kind?: string | null;
  created_at: string;
  signed_url?: string | null;
};

const BUCKET = "founding-docs";

async function getServiceClient() {
  const url = process.env.SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) throw new Error("Server not configured");
  return createClient<Database>(url, service, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

async function signPaths(admin: any, rows: FoundingDocFile[]): Promise<FoundingDocFile[]> {
  const paths = rows.map((r) => r.storage_path);
  if (!paths.length) return rows;
  const { data } = await admin.storage.from(BUCKET).createSignedUrls(paths, 60 * 60);
  const map = new Map<string, string>();
  (data || []).forEach((d: any) => {
    if (d && d.path && d.signedUrl) map.set(d.path, d.signedUrl);
  });
  return rows.map((r) => ({ ...r, signed_url: map.get(r.storage_path) ?? null }));
}

// Returns the founding_applications row bound to the current user's email (creates none).
async function getMyApplication(context: any) {
  const email = (context.claims as any)?.email as string | undefined;
  if (!email) return null;
  const admin = await getServiceClient();
  const { data } = await admin
    .from("founding_applications" as any)
    .select("id, email, full_name, requested_plan, document_status, documents_rejected_at")
    .ilike("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as any;
}

export const registerDocumentFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      storage_path: z.string().min(3).max(500),
      mime_type: z.string().min(3).max(120),
      file_size: z.number().int().min(1).max(500 * 1024 * 1024),
      original_name: z.string().max(255).optional(),
      doc_kind: z.enum(["identity", "driving_license"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const app = await getMyApplication(context);
    if (!app) throw new Error("No Founding application found for this account");
    // Enforce folder ownership on stored path
    if (!data.storage_path.startsWith(`${context.userId}/`)) {
      throw new Error("Invalid storage path");
    }
    // Users can resubmit at any time after rejection or needs_info — no waiting window.
    const admin = await getServiceClient();
    const { error } = await admin.from("founding_documents" as any).insert({
      application_id: app.id,
      user_id: context.userId,
      storage_path: data.storage_path,
      mime_type: data.mime_type,
      file_size: data.file_size,
      original_name: data.original_name ?? null,
      doc_kind: data.doc_kind,
    });
    if (error) throw new Error(error.message);
    // Bump application to "received" (unless verified)
    if (app.document_status !== "verified") {
      await admin
        .from("founding_applications" as any)
        .update({
          document_status: "received",
          documents_submitted_at: new Date().toISOString(),
          documents_rejected_at: null,
          documents_rejected_reason: null,
          documents_info_request: null,
          documents_info_requested_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", app.id);
      // Notify applicant that documents landed (idempotent per application submission window)
      if (app.email) {
        await enqueueApplicantEmail(
          admin,
          "documents_submitted",
          String(app.email),
          String(app.full_name || "there"),
          String(app.requested_plan || "elite"),
          `${app.id}-docs-submitted-${Date.now()}`,
        );
        try {
          const { sendSystemMail } = await import("@/lib/system-mail.server");
          const name = String(app.full_name || "there").split(/\s+/)[0];
          await sendSystemMail({
            from: "notifications@jenvu.email",
            toUserId: context.userId,
            subject: "We received your documents",
            body: [
              `Hi ${name},`,
              ``,
              `Thanks for sending over your identity documents — your document(s) are safely in our review queue.`,
              ``,
              `A real person on our team will review and update your status here, usually within 48 hours.`,
              ``,
              `— Jenvu Notifications`,
            ].join("\n"),
          });
        } catch (e) {
          console.error("[founding] system-mail docs-submitted failed:", (e as Error)?.message);
        }
      }
    }
    return { ok: true };
  });

export const listMyDocumentFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<FoundingDocFile[]> => {
    const app = await getMyApplication(context);
    if (!app) return [];
    const admin = await getServiceClient();
    const { data, error } = await admin
      .from("founding_documents" as any)
      .select("id, application_id, storage_path, mime_type, file_size, original_name, doc_kind, created_at")
      .eq("application_id", app.id)
      .neq("doc_kind", "earning_proof")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return await signPaths(admin, (data ?? []) as any);
  });

export const deleteMyDocumentFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await getServiceClient();
    const { data: row } = await admin
      .from("founding_documents" as any)
      .select("id, user_id, storage_path")
      .eq("id", data.id)
      .maybeSingle();
    const r = row as any;
    if (!r || r.user_id !== context.userId) throw new Error("Not found");
    await admin.storage.from(BUCKET).remove([r.storage_path]);
    await admin.from("founding_documents" as any).delete().eq("id", data.id);
    return { ok: true };
  });

export type AdminDocSubmission = {
  application_id: string;
  email: string;
  full_name: string;
  profile_full_name: string | null;
  requested_plan: string | null;
  status: string;
  document_status: string;
  documents_submitted_at: string | null;
  documents_note: string | null;
  documents_rejected_reason: string | null;
  documents_rejected_at: string | null;
  documents_info_request: string | null;
  documents_info_requested_at: string | null;
  files: FoundingDocFile[];
};


export const adminListDocumentSubmissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminDocSubmission[]> => {
    await assertAdmin(context.supabase, context.userId);
    const admin = await getServiceClient();
    const { data: apps, error } = await admin
      .from("founding_applications" as any)
      .select(
        "id, user_id, email, full_name, requested_plan, status, document_status, documents_submitted_at, documents_note, documents_rejected_reason, documents_rejected_at, documents_info_request, documents_info_requested_at",
      )
      .neq("document_status", "not_submitted")
      .order("documents_submitted_at", { ascending: false, nullsFirst: false })
      .limit(500);
    if (error) throw new Error(error.message);
    const list = (apps ?? []) as any[];
    if (!list.length) return [];
    const ids = list.map((a) => a.id);
    const { data: files } = await admin
      .from("founding_documents" as any)
      .select("id, application_id, storage_path, mime_type, file_size, original_name, doc_kind, created_at")
      .in("application_id", ids)
      .order("created_at", { ascending: false });
    const signed = await signPaths(admin, (files ?? []) as any);
    const byApp = new Map<string, FoundingDocFile[]>();
    signed.forEach((f) => {
      const arr = byApp.get(f.application_id) ?? [];
      arr.push(f);
      byApp.set(f.application_id, arr);
    });

    // Account profile names (what the user set on their profile page)
    const userIds = list.map((a) => a.user_id).filter(Boolean) as string[];
    const nameByUser = new Map<string, string | null>();
    if (userIds.length) {
      const { data: profs } = await admin
        .from("profiles" as any)
        .select("id, full_name")
        .in("id", userIds);
      (profs ?? []).forEach((p: any) => nameByUser.set(p.id, p.full_name ?? null));
    }

    return list.map((a) => ({
      application_id: a.id,
      email: a.email,
      full_name: a.full_name,
      profile_full_name: a.user_id ? nameByUser.get(a.user_id) ?? null : null,
      requested_plan: a.requested_plan,
      status: a.status,
      document_status: a.document_status,
      documents_submitted_at: a.documents_submitted_at,
      documents_note: a.documents_note,
      documents_rejected_reason: a.documents_rejected_reason,
      documents_rejected_at: a.documents_rejected_at,
      documents_info_request: a.documents_info_request,
      documents_info_requested_at: a.documents_info_requested_at,
      files: byApp.get(a.id) ?? [],
    }));

  });
