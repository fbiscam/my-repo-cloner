// System mail helper — server-only. Sends internal @jenvu.email mail from
// support/alerts/notifications/billing addresses to a user's inbox.
// Never import this from client-reachable modules at module scope; load inside
// server-function handlers via `await import("@/lib/system-mail.server")`.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SystemSender =
  | "support@jenvu.email"
  | "alerts@jenvu.email"
  | "notifications@jenvu.email"
  | "billing@jenvu.email";

export async function sendSystemMail(args: {
  from: SystemSender;
  toUserId: string;
  subject: string;
  body: string;
}): Promise<{ ok: boolean; id?: string | null; error?: string }> {
  try {
    const { data, error } = await supabaseAdmin.rpc("mail_system_send" as never, {
      _from_address: args.from,
      _to_user_id: args.toUserId,
      _subject: args.subject.slice(0, 300),
      _body: args.body.slice(0, 50000),
    } as never);
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: (data as string | null) ?? null };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message };
  }
}

export async function sendSystemMailByEmail(args: {
  from: SystemSender;
  toEmail: string;
  subject: string;
  body: string;
}): Promise<{ ok: boolean; error?: string }> {
  const email = args.toEmail.toLowerCase().trim();
  if (!email) return { ok: false, error: "no_email" };
  const { data: users } = (await supabaseAdmin
    .schema("auth" as never)
    .from("users" as never)
    .select("id")
    .eq("email", email)
    .maybeSingle()) as unknown as { data: { id: string } | null };
  if (!users?.id) return { ok: false, error: "user_not_found" };
  return sendSystemMail({ from: args.from, toUserId: users.id, subject: args.subject, body: args.body });
}
