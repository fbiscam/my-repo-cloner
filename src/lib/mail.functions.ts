import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MailFolder = "inbox" | "sent" | "archive" | "trash";

export type MailListItem = {
  message_id: string;
  folder: MailFolder;
  is_read: boolean;
  is_starred: boolean;
  subject: string;
  body: string;
  sender_address: string;
  recipient_address: string;
  sender_id: string | null;
  recipient_id: string | null;
  created_at: string;
  sender_name: string | null;
  sender_avatar: string | null;
  recipient_name: string | null;
  recipient_avatar: string | null;
};

export type MailAddress = {
  address: string;
  local_part: string;
  is_primary: boolean;
  created_at: string;
};

export const getMyMailAddress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("mail_addresses")
      .select("address, local_part, created_at, is_primary")
      .eq("user_id", context.userId)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as MailAddress[];
    const primary = rows.find((r) => r.is_primary) ?? rows[0] ?? null;
    return primary ? { ...primary, all: rows } : null;
  });

export const listMyMailAddresses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MailAddress[]> => {
    const { data, error } = await context.supabase
      .from("mail_addresses")
      .select("address, local_part, created_at, is_primary")
      .eq("user_id", context.userId)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as MailAddress[];
  });


export const claimMailAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { local_part: string }) => {
    const lp = String(data?.local_part ?? "").toLowerCase().trim();
    if (!/^[a-z0-9][a-z0-9._-]{2,30}[a-z0-9]$/.test(lp)) {
      throw new Error("Username must be 4-32 chars: letters, numbers, . _ -");
    }
    return { local_part: lp };
  })
  .handler(async ({ context, data }) => {
    const { data: address, error } = await context.supabase.rpc("mail_claim_address", {
      _local_part: data.local_part,
    });
    if (error) throw new Error(error.message);
    return { address: address as string };
  });

export const checkUsernameAvailable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { local_part: string }) => ({
    local_part: String(data?.local_part ?? "").toLowerCase().trim(),
  }))
  .handler(async ({ context, data }) => {
    if (!/^[a-z0-9][a-z0-9._-]{2,30}[a-z0-9]$/.test(data.local_part)) {
      return { available: false, reason: "invalid" as const };
    }
    const { data: row } = await context.supabase
      .from("mail_addresses")
      .select("local_part")
      .eq("local_part", data.local_part)
      .maybeSingle();
    return { available: !row, reason: row ? ("taken" as const) : ("ok" as const) };
  });

export const listMail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { folder?: MailFolder; starred?: boolean }) => ({
    folder: (data?.folder ?? "inbox") as MailFolder,
    starred: Boolean(data?.starred),
  }))
  .handler(async ({ context, data }): Promise<MailListItem[]> => {
    let q = context.supabase
      .from("mail_message_state")
      .select(
        `message_id, folder, is_read, is_starred,
         mail_messages:message_id ( id, sender_id, sender_address, recipient_id, recipient_address, subject, body, created_at )`,
      )
      .eq("user_id", context.userId);
    if (data.starred) {
      q = q.eq("is_starred", true).neq("folder", "trash");
    } else {
      q = q.eq("folder", data.folder);
    }
    const { data: states, error } = await q.order("updated_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);

    const rows = (states ?? []) as any[];
    const userIds = Array.from(
      new Set(
        rows.flatMap((r) => [r.mail_messages?.sender_id, r.mail_messages?.recipient_id]).filter(Boolean),
      ),
    );
    const addresses = Array.from(
      new Set(
        rows.flatMap((r) => [r.mail_messages?.sender_address, r.mail_messages?.recipient_address]).filter(Boolean),
      ),
    );
    let profileMap = new Map<string, { full_name: string | null; avatar_url: string | null }>();
    const avatarUrlMap = new Map<string, string>();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (userIds.length) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", userIds);
      profileMap = new Map(
        (profiles ?? []).map((p: any) => [p.id, { full_name: p.full_name, avatar_url: p.avatar_url }]),
      );
    }
    // fallback: resolve avatar by mail address (for system mailboxes or when sender_id is null)
    const addrToUser = new Map<string, string>();
    if (addresses.length) {
      const { data: addrRows } = await supabaseAdmin
        .from("mail_addresses")
        .select("address, user_id")
        .in("address", addresses);
      for (const a of (addrRows ?? []) as any[]) {
        if (a.address && a.user_id) addrToUser.set(a.address, a.user_id);
      }
      const extraIds = Array.from(new Set(Array.from(addrToUser.values()).filter((id) => !profileMap.has(id))));
      if (extraIds.length) {
        const { data: extra } = await supabaseAdmin
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", extraIds);
        for (const p of (extra ?? []) as any[]) {
          profileMap.set(p.id, { full_name: p.full_name, avatar_url: p.avatar_url });
        }
      }
    }
    const avatarPaths = Array.from(
      new Set(
        Array.from(profileMap.values())
          .map((p) => p.avatar_url)
          .filter((path): path is string => Boolean(path)),
      ),
    );
    const privateAvatarPaths = avatarPaths.filter((path) => !/^https?:\/\//i.test(path));
    for (const url of avatarPaths.filter((path) => /^https?:\/\//i.test(path))) {
      avatarUrlMap.set(url, url);
    }
    if (privateAvatarPaths.length) {
      const { data: signedAvatars } = await supabaseAdmin.storage
        .from("avatars")
        .createSignedUrls(privateAvatarPaths, 60 * 60);
      for (const item of signedAvatars ?? []) {
        if (item.path && item.signedUrl) avatarUrlMap.set(item.path, item.signedUrl);
      }
    }
    const resolve = (id: string | null, addr: string | null) => {
      const uid = id ?? (addr ? addrToUser.get(addr) ?? null : null);
      const p = uid ? profileMap.get(uid) : null;
      return {
        name: p?.full_name ?? null,
        avatar: p?.avatar_url ? avatarUrlMap.get(p.avatar_url) ?? null : null,
      };
    };

    return rows
      .filter((r) => r.mail_messages)
      .map((r) => {
        const m = r.mail_messages;
        const s = resolve(m.sender_id, m.sender_address);
        const rc = resolve(m.recipient_id, m.recipient_address);
        return {
          message_id: r.message_id,
          folder: r.folder,
          is_read: r.is_read,
          is_starred: r.is_starred,
          subject: m.subject,
          body: m.body,
          sender_address: m.sender_address,
          recipient_address: m.recipient_address,
          sender_id: m.sender_id,
          recipient_id: m.recipient_id,
          created_at: m.created_at,
          sender_name: s.name,
          sender_avatar: s.avatar,
          recipient_name: rc.name,
          recipient_avatar: rc.avatar,
        };
      });
  });

export const getUnreadMailCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count } = await context.supabase
      .from("mail_message_state")
      .select("message_id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .eq("folder", "inbox")
      .eq("is_read", false);
    return { count: count ?? 0 };
  });

export const sendMail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { to: string; subject: string; body: string; from?: string }) => {
    const to = String(data?.to ?? "").toLowerCase().trim();
    const subject = String(data?.subject ?? "").slice(0, 300);
    const body = String(data?.body ?? "").slice(0, 50000);
    const from = data?.from ? String(data.from).toLowerCase().trim() : undefined;
    if (!to.endsWith("@jenvu.email")) throw new Error("Recipient must be a @jenvu.email address");
    if (!body.trim() && !subject.trim()) throw new Error("Message is empty");
    return { to, subject, body, from };
  })
  .handler(async ({ context, data }) => {
    const { data: id, error } = await context.supabase.rpc("mail_send", {
      _to_address: data.to,
      _subject: data.subject,
      _body: data.body,
      _from_address: data.from ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });


export const setMailState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      message_id: string;
      folder?: MailFolder;
      is_read?: boolean;
      is_starred?: boolean;
    }) => data,
  )
  .handler(async ({ context, data }) => {
    const patch: {
      updated_at: string;
      folder?: MailFolder;
      is_read?: boolean;
      is_starred?: boolean;
    } = { updated_at: new Date().toISOString() };
    if (data.folder) patch.folder = data.folder;
    if (typeof data.is_read === "boolean") patch.is_read = data.is_read;
    if (typeof data.is_starred === "boolean") patch.is_starred = data.is_starred;
    const { error } = await context.supabase
      .from("mail_message_state")
      .update(patch)
      .eq("message_id", data.message_id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const searchMailDirectory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { q: string }) => ({ q: String(data?.q ?? "").slice(0, 60) }))
  .handler(async ({ context, data }) => {
    if (!data.q.trim()) return [];
    const { data: rows, error } = await context.supabase.rpc("mail_directory_search", { _q: data.q });
    if (error) throw new Error(error.message);
    return (rows ?? []) as { address: string; full_name: string | null }[];
  });

export type MailBadgeTier = "gold" | "blue" | null;

export const getMailBadges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { addresses: string[] }) => ({
    addresses: Array.from(new Set((data?.addresses ?? []).map((a) => String(a).toLowerCase().trim()).filter(Boolean))).slice(0, 200),
  }))
  .handler(async ({ context, data }) => {
    if (!data.addresses.length) return {} as Record<string, MailBadgeTier>;
    const { data: rows, error } = await context.supabase.rpc("mail_get_badges", { _addresses: data.addresses });
    if (error) throw new Error(error.message);
    const map: Record<string, MailBadgeTier> = {};
    for (const r of (rows ?? []) as { address: string; tier: MailBadgeTier }[]) {
      map[r.address] = r.tier;
    }
    return map;
  });

