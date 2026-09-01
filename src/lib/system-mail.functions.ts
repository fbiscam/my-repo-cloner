// Client-callable system mail server function (for welcome mail after signup).
// Users can only trigger sends TO themselves.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const sendWelcomeSystemMail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { fullName?: string }) => ({
    fullName: String(d?.fullName ?? "").slice(0, 120),
  }))
  .handler(async ({ context, data }) => {
    const { sendSystemMail } = await import("@/lib/system-mail.server");
    const firstName = data.fullName?.trim()?.split(/\s+/)[0] || "there";
    const subject = `Welcome to Jenvu, ${firstName} 👋`;
    const body = [
      `Hi ${firstName},`,
      ``,
      `Welcome to Jenvu — your account is ready.`,
      ``,
      `Here's what you can do next:`,
      `• Run a XAU/USD scan on the Signal page`,
      `• Review your dashboard, balance, and referral link`,
      `• Reply to this message any time — support@jenvu.email is monitored by our team`,
      ``,
      `— The Jenvu Team`,
    ].join("\n");
    await sendSystemMail({
      from: "support@jenvu.email",
      toUserId: context.userId,
      subject,
      body,
    });
    return { ok: true };
  });
