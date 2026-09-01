import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

type AdminSession = { unlocked?: boolean; username?: string };

const SESSION_NAME = "jenvu-admin-gate";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function sessionConfig() {
  return {
    password: process.env.ADMIN_SESSION_SECRET!,
    name: SESSION_NAME,
    maxAge: MAX_AGE,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "none" as const,
      path: "/",
    },
  };
}

function safeEqual(a: string, b: string): boolean {
  const ah = createHash("sha256").update(a, "utf8").digest();
  const bh = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ah, bh);
}

/**
 * Real access gate for the Support Inbox server functions.
 * Allows either:
 *  - an unlocked ops-console session cookie, or
 *  - the admin-gate session cookie, or
 *  - a valid Supabase bearer token belonging to a user with the 'admin' role.
 */
async function requireUnlocked() {
  // 1) Ops console session
  const { isOpsUnlocked } = await import("./admin-guard.server");
  if (await isOpsUnlocked()) return { unlocked: true as const, username: "ops" };

  // 2) Admin-gate session cookie
  try {
    if (process.env.ADMIN_SESSION_SECRET) {
      const session = await useSession<AdminSession>(sessionConfig());
      if (session.data.unlocked) {
        return { unlocked: true as const, username: session.data.username ?? "admin" };
      }
    }
  } catch {
    // fall through
  }

  // 3) Supabase bearer token with admin role
  try {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const header = getRequestHeader("authorization") ?? "";
    const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
    if (token) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: userRes } = await supabaseAdmin.auth.getUser(token);
      const uid = userRes?.user?.id;
      if (uid) {
        const { data: role } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", uid)
          .eq("role", "admin")
          .maybeSingle();
        if (role) return { unlocked: true as const, username: userRes.user!.email ?? "admin" };
      }
    }
  } catch {
    // fall through
  }

  throw new Error("Unauthorized");
}





export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((data: { username: string; password: string }) => data)
  .handler(async ({ data }) => {
    const expectedUser = process.env.ADMIN_USERNAME;
    const expectedPass = process.env.ADMIN_PASSWORD;
    if (!expectedUser || !expectedPass) {
      return { ok: false as const, error: "Server not configured" };
    }
    const uOk = safeEqual(data.username || "", expectedUser);
    const pOk = safeEqual(data.password || "", expectedPass);
    if (!uOk || !pOk) {
      return { ok: false as const, error: "Invalid credentials" };
    }
    const session = await useSession<AdminSession>(sessionConfig());
    await session.update({ unlocked: true, username: expectedUser });
    return { ok: true as const };
  });

export const adminLogout = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useSession<AdminSession>(sessionConfig());
  await session.clear();
  return { ok: true as const };
});

export const adminMe = createServerFn({ method: "GET" }).handler(async () => {
  // Gate disabled — always report unlocked.
  return { unlocked: true as const, username: "admin" };
});


// ---- Unified inbox (chat sessions + contact form messages) ----

type UnifiedItem = {
  id: string; // "chat:<uuid>" or "form:<uuid>"
  source: "chat" | "form";
  guest_name: string | null;
  guest_email: string | null;
  status: string;
  last_message_at: string;
  unread_admin: number;
  created_at: string;
  subject?: string | null;
};

export const adminListSessions = createServerFn({ method: "GET" }).handler(async () => {
  await requireUnlocked();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [chatsRes, formsRes] = await Promise.all([
    supabaseAdmin
      .from("chat_sessions")
      .select("id,guest_name,guest_email,status,last_message_at,unread_admin,created_at")
      .order("last_message_at", { ascending: false })
      .limit(200),
    supabaseAdmin
      .from("contact_messages")
      .select("id,name,email,subject,message,status,created_at")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  if (chatsRes.error) throw new Error(chatsRes.error.message);
  if (formsRes.error) throw new Error(formsRes.error.message);

  const chats: UnifiedItem[] = (chatsRes.data ?? []).map((c: any) => ({
    id: `chat:${c.id}`,
    source: "chat",
    guest_name: c.guest_name,
    guest_email: c.guest_email,
    status: c.status,
    last_message_at: c.last_message_at,
    unread_admin: c.unread_admin || 0,
    created_at: c.created_at,
  }));

  const forms: UnifiedItem[] = (formsRes.data ?? []).map((f: any) => ({
    id: `form:${f.id}`,
    source: "form",
    guest_name: f.name,
    guest_email: f.email,
    status: f.status === "archived" || f.status === "replied" ? "closed" : "open",
    last_message_at: f.created_at,
    unread_admin: f.status === "new" ? 1 : 0,
    created_at: f.created_at,
    subject: f.subject,
  }));

  const sessions = [...chats, ...forms].sort(
    (a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime(),
  );
  return { sessions };
});

export const adminGetMessages = createServerFn({ method: "POST" })
  .inputValidator((data: { sessionId: string }) => data)
  .handler(async ({ data }) => {
    await requireUnlocked();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.sessionId.startsWith("form:")) {
      const realId = data.sessionId.slice(5);
      const { data: row, error } = await supabaseAdmin
        .from("contact_messages")
        .select("id,name,email,subject,message,status,created_at")
        .eq("id", realId)
        .single();
      if (error) throw new Error(error.message);
      if (row.status === "new") {
        await supabaseAdmin
          .from("contact_messages")
          .update({ status: "read" })
          .eq("id", realId);
      }
      const content = row.subject
        ? `Subject: ${row.subject}\n\n${row.message}`
        : row.message;
      return {
        messages: [
          {
            id: row.id,
            sender: "guest" as const,
            content,
            created_at: row.created_at,
          },
        ],
      };
    }

    const realId = data.sessionId.startsWith("chat:") ? data.sessionId.slice(5) : data.sessionId;
    const { data: rows, error } = await supabaseAdmin
      .from("chat_messages")
      .select("id,sender,content,created_at")
      .eq("session_id", realId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("chat_sessions")
      .update({ unread_admin: 0 })
      .eq("id", realId);
    return { messages: rows ?? [] };
  });

export const adminReply = createServerFn({ method: "POST" })
  .inputValidator((data: { sessionId: string; content: string }) => {
    const content = (data.content ?? "").trim();
    if (!content) throw new Error("Empty message");
    if (content.length > 4000) throw new Error("Message too long");
    return { sessionId: data.sessionId, content };
  })
  .handler(async ({ data }) => {
    await requireUnlocked();
    if (data.sessionId.startsWith("form:")) {
      throw new Error("Reply to form messages by email");
    }
    const realId = data.sessionId.startsWith("chat:") ? data.sessionId.slice(5) : data.sessionId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const { error: mErr } = await supabaseAdmin.from("chat_messages").insert({
      session_id: realId,
      sender: "admin",
      content: data.content,
    });
    if (mErr) throw new Error(mErr.message);
    const { error: sErr } = await supabaseAdmin
      .from("chat_sessions")
      .update({ last_message_at: now, status: "open" })
      .eq("id", realId);
    if (sErr) throw new Error(sErr.message);
    return { ok: true as const };
  });

export const adminCloseSession = createServerFn({ method: "POST" })
  .inputValidator((data: { sessionId: string }) => data)
  .handler(async ({ data }) => {
    await requireUnlocked();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.sessionId.startsWith("form:")) {
      const realId = data.sessionId.slice(5);
      const { error } = await supabaseAdmin
        .from("contact_messages")
        .update({ status: "archived" })
        .eq("id", realId);
      if (error) throw new Error(error.message);
      return { ok: true as const };
    }
    const realId = data.sessionId.startsWith("chat:") ? data.sessionId.slice(5) : data.sessionId;
    const { error } = await supabaseAdmin
      .from("chat_sessions")
      .update({ status: "closed" })
      .eq("id", realId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
