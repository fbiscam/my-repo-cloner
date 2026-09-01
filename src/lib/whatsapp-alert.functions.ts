import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getWhatsappAlertLink = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("whatsapp_alert_links")
      .select("phone_number, whatsapp_enabled, verified_at, last_error, code_expires_at")
      .eq("user_id", context.userId)
      .maybeSingle();

    if (error) throw new Error(error.message);

    let senderNumber: string | null = null;
    try {
      const { resolveSender } = await import("./whatsapp-api.server");
      senderNumber = (await resolveSender()).displayNumber;
    } catch {
      senderNumber = null;
    }

    const pendingUntil = data?.code_expires_at ?? null;
    return {
      linked: !!data?.verified_at,
      phoneNumber: data?.phone_number ?? null,
      enabled: data?.whatsapp_enabled ?? false,
      verifiedAt: data?.verified_at ?? null,
      lastError: data?.last_error ?? null,
      senderNumber,
      pendingVerification:
        !data?.verified_at && !!pendingUntil && new Date(pendingUntil).getTime() > Date.now(),
    };
  });

/** Step 1 — store the number and send a 6-digit code over WhatsApp. */
export const connectWhatsappAlertLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ phoneNumber: z.string().min(8).max(20) }).parse(d))
  .handler(async ({ data, context }) => {
    const { normalizePhone, sendWhatsappOtp } = await import("./whatsapp-api.server");
    const phone = normalizePhone(data.phoneNumber);
    if (phone.length < 8) throw new Error("Enter a valid number with country code, e.g. +923001234567");

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error } = await supabaseAdmin
      .from("whatsapp_alert_links")
      .upsert(
        {
          user_id: context.userId,
          phone_number: phone,
          whatsapp_enabled: false,
          verified_at: null,
          verification_code: code,
          code_expires_at: expires,
          code_attempts: 0,
          last_error: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);

    try {
      await sendWhatsappOtp(phone, code);
    } catch (e) {
      const msg = (e as Error).message;
      await supabaseAdmin
        .from("whatsapp_alert_links")
        .update({ last_error: msg.slice(0, 500) })
        .eq("user_id", context.userId);
      throw new Error(`Could not send the WhatsApp code: ${msg}`);
    }

    return { ok: true, phoneNumber: phone, expiresAt: expires };
  });

/** Step 2 — confirm the code the user received on WhatsApp. */
export const verifyWhatsappAlertCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ code: z.string().min(4).max(8) }).parse(d))
  .handler(async ({ data, context }) => {
    const code = data.code.replace(/\D/g, "");
    const { data: row, error } = await supabaseAdmin
      .from("whatsapp_alert_links")
      .select("phone_number, verification_code, code_expires_at, code_attempts")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row?.verification_code || !row.code_expires_at) {
      throw new Error("No verification pending. Send a new code first.");
    }
    if (new Date(row.code_expires_at).getTime() < Date.now()) {
      throw new Error("Code expired. Send a new code.");
    }
    if ((row.code_attempts ?? 0) >= 5) {
      throw new Error("Too many attempts. Send a new code.");
    }
    if (code !== row.verification_code) {
      await supabaseAdmin
        .from("whatsapp_alert_links")
        .update({ code_attempts: (row.code_attempts ?? 0) + 1 })
        .eq("user_id", context.userId);
      throw new Error("Incorrect code. Please try again.");
    }

    const { error: upErr } = await supabaseAdmin
      .from("whatsapp_alert_links")
      .update({
        verified_at: new Date().toISOString(),
        whatsapp_enabled: true,
        verification_code: null,
        code_expires_at: null,
        code_attempts: 0,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", context.userId);
    if (upErr) throw new Error(upErr.message);

    try {
      const { sendWhatsappText } = await import("./whatsapp-api.server");
      await sendWhatsappText(
        row.phone_number,
        "✅ WhatsApp alerts are now active. You'll receive Jenvu XAU/USD signals here.",
      );
    } catch {
      // non-fatal
    }

    return { ok: true, phoneNumber: row.phone_number };
  });

export const setWhatsappAlertEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("whatsapp_alert_links")
      .update({ whatsapp_enabled: data.enabled, updated_at: new Date().toISOString() })
      .eq("user_id", context.userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const disconnectWhatsappAlertLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await supabaseAdmin
      .from("whatsapp_alert_links")
      .delete()
      .eq("user_id", context.userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });
