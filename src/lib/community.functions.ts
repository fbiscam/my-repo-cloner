import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CommunityTier = "gold" | "blue" | null;

export type CommunityProfileRow = {
  user_id: string;
  handle: string;
  display_name: string | null;
  bio: string | null;
  cover_url: string | null;
  location: string | null;
  website: string | null;
  avatar_url: string | null;
  tier: CommunityTier;
  followers: number;
  following: number;
  is_following: boolean;
  is_self: boolean;
};

export type CommunityPostRow = {
  id: string;
  author_id: string;
  author_handle: string | null;
  author_name: string | null;
  author_avatar: string | null;
  author_tier: CommunityTier;
  body: string;
  media_urls: string[];
  cashtags: string[];
  parent_post_id: string | null;
  like_count: number;
  reply_count: number;
  repost_count: number;
  bookmark_count: number;
  view_count: number;
  liked_by_me: boolean;
  reposted_by_me: boolean;
  bookmarked_by_me: boolean;
  created_at: string;
};

// ---------- helpers ----------
async function signAvatars(admin: any, paths: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const priv = paths.filter((p) => p && !/^https?:\/\//i.test(p));
  const pub = paths.filter((p) => p && /^https?:\/\//i.test(p));
  for (const p of pub) map.set(p, p);
  if (priv.length) {
    const { data } = await admin.storage.from("avatars").createSignedUrls(priv, 60 * 60);
    for (const it of data ?? []) if (it.path && it.signedUrl) map.set(it.path, it.signedUrl);
  }
  return map;
}

async function signCommunityMedia(admin: any, paths: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const priv = paths.filter((p) => p && !/^https?:\/\//i.test(p));
  const pub = paths.filter((p) => p && /^https?:\/\//i.test(p));
  for (const p of pub) map.set(p, p);
  if (priv.length) {
    const { data } = await admin.storage.from("community-media").createSignedUrls(priv, 60 * 60);
    for (const it of data ?? []) if (it.path && it.signedUrl) map.set(it.path, it.signedUrl);
  }
  return map;
}

async function hydratePosts(admin: any, rows: any[], viewerId: string): Promise<CommunityPostRow[]> {
  if (!rows.length) return [];
  const authorIds = Array.from(new Set(rows.map((r) => r.author_id)));
  const postIds = rows.map((r) => r.id);

  const [{ data: cps }, { data: profs }, { data: likes }, { data: reposts }, { data: bmks }] = await Promise.all([
    admin.from("community_profiles").select("user_id, handle").in("user_id", authorIds),
    admin.from("profiles").select("id, full_name, avatar_url").in("id", authorIds),
    admin.from("community_likes").select("post_id").eq("user_id", viewerId).in("post_id", postIds),
    admin.from("community_reposts").select("post_id").eq("user_id", viewerId).in("post_id", postIds),
    admin.from("community_bookmarks").select("post_id").eq("user_id", viewerId).in("post_id", postIds),
  ]);

  const handleMap = new Map<string, string>();
  for (const c of cps ?? []) handleMap.set(c.user_id, c.handle);
  const profMap = new Map<string, { name: string | null; avatar: string | null }>();
  for (const p of profs ?? []) profMap.set(p.id, { name: p.full_name ?? null, avatar: p.avatar_url ?? null });

  const avatarPaths = Array.from(new Set(Array.from(profMap.values()).map((p) => p.avatar).filter((x): x is string => !!x)));
  const avatarSigned = await signAvatars(admin, avatarPaths);

  const allMedia = Array.from(new Set(rows.flatMap((r) => r.media_urls || [])));
  const mediaSigned = await signCommunityMedia(admin, allMedia);

  // tier lookup
  const tierMap = new Map<string, CommunityTier>();
  for (const uid of authorIds) {
    const { data } = await admin.rpc("community_get_tier", { _user_id: uid });
    tierMap.set(uid, (data as CommunityTier) ?? null);
  }

  const likedSet = new Set((likes ?? []).map((x: any) => x.post_id));
  const rpSet = new Set((reposts ?? []).map((x: any) => x.post_id));
  const bmSet = new Set((bmks ?? []).map((x: any) => x.post_id));

  return rows.map((r) => {
    const prof = profMap.get(r.author_id);
    return {
      id: r.id,
      author_id: r.author_id,
      author_handle: handleMap.get(r.author_id) ?? null,
      author_name: prof?.name ?? null,
      author_avatar: prof?.avatar ? avatarSigned.get(prof.avatar) ?? null : null,
      author_tier: tierMap.get(r.author_id) ?? null,
      body: r.body,
      media_urls: (r.media_urls || []).map((m: string) => mediaSigned.get(m) ?? m),
      cashtags: r.cashtags || [],
      parent_post_id: r.parent_post_id,
      like_count: r.like_count,
      reply_count: r.reply_count,
      repost_count: r.repost_count,
      bookmark_count: r.bookmark_count,
      view_count: r.view_count,
      liked_by_me: likedSet.has(r.id),
      reposted_by_me: rpSet.has(r.id),
      bookmarked_by_me: bmSet.has(r.id),
      created_at: r.created_at,
    };
  });
}

// ---------- profile ----------
export const getMyCommunityProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("community_profiles")
      .select("user_id, handle, display_name, bio, cover_url, location, website")
      .eq("user_id", context.userId)
      .maybeSingle();
    return data ?? null;
  });

export const claimCommunityHandle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { handle: string; display_name?: string }) => {
    const h = String(d.handle || "").trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(h)) throw new Error("Handle must be 3–20 chars: letters, digits, underscore");
    return { handle: h, display_name: (d.display_name || "").slice(0, 60) };
  })
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("community_profiles").insert({
      user_id: context.userId,
      handle: data.handle,
      display_name: data.display_name || null,
    });
    if (error) throw new Error(error.message.includes("duplicate") ? "Handle already taken" : error.message);
    return { ok: true };
  });

export const updateCommunityProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { display_name?: string; bio?: string; location?: string; website?: string }) => ({
    display_name: (d.display_name ?? "").slice(0, 60),
    bio: (d.bio ?? "").slice(0, 160),
    location: (d.location ?? "").slice(0, 60),
    website: (d.website ?? "").slice(0, 200),
  }))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("community_profiles")
      .update(data)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getCommunityProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { handle: string }) => ({ handle: String(d.handle || "").trim().toLowerCase() }))
  .handler(async ({ context, data }): Promise<CommunityProfileRow | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: p } = await supabaseAdmin
      .from("community_profiles")
      .select("*")
      .eq("handle", data.handle)
      .maybeSingle();
    if (!p) return null;
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("full_name, avatar_url").eq("id", p.user_id).maybeSingle();
    const [{ count: followers }, { count: following }, { data: iFollow }, { data: tier }] = await Promise.all([
      supabaseAdmin.from("community_follows").select("follower_id", { count: "exact", head: true }).eq("followee_id", p.user_id),
      supabaseAdmin.from("community_follows").select("followee_id", { count: "exact", head: true }).eq("follower_id", p.user_id),
      supabaseAdmin.from("community_follows").select("follower_id").eq("follower_id", context.userId).eq("followee_id", p.user_id).maybeSingle(),
      supabaseAdmin.rpc("community_get_tier", { _user_id: p.user_id }),
    ]);
    const avatarSigned = await signAvatars(supabaseAdmin, prof?.avatar_url ? [prof.avatar_url] : []);
    return {
      user_id: p.user_id, handle: p.handle, display_name: p.display_name,
      bio: p.bio, cover_url: p.cover_url, location: p.location, website: p.website,
      avatar_url: prof?.avatar_url ? avatarSigned.get(prof.avatar_url) ?? null : null,
      tier: (tier as CommunityTier) ?? null,
      followers: followers ?? 0, following: following ?? 0,
      is_following: !!iFollow, is_self: p.user_id === context.userId,
    };
  });

// ---------- feed ----------
export const listCommunityFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { mode?: "for_you" | "following"; before?: string; author_id?: string; limit?: number } = {}) => ({
    mode: d.mode ?? "for_you",
    before: d.before,
    author_id: d.author_id,
    limit: Math.min(Math.max(d.limit ?? 30, 1), 50),
  }))
  .handler(async ({ context, data }): Promise<CommunityPostRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("community_posts")
      .select("*")
      .is("deleted_at", null)
      .is("parent_post_id", null)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.before) q = q.lt("created_at", data.before);
    if (data.author_id) q = q.eq("author_id", data.author_id);
    if (data.mode === "following") {
      const { data: fol } = await supabaseAdmin
        .from("community_follows").select("followee_id").eq("follower_id", context.userId);
      const ids = (fol ?? []).map((r: any) => r.followee_id);
      if (!ids.length) return [];
      q = q.in("author_id", ids);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return hydratePosts(supabaseAdmin, rows ?? [], context.userId);
  });

export const getCommunityPost = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ context, data }): Promise<{ post: CommunityPostRow | null; replies: CommunityPostRow[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: post } = await supabaseAdmin.from("community_posts").select("*").eq("id", data.id).is("deleted_at", null).maybeSingle();
    if (!post) return { post: null, replies: [] };
    const { data: replies } = await supabaseAdmin
      .from("community_posts").select("*")
      .eq("parent_post_id", data.id).is("deleted_at", null)
      .order("created_at", { ascending: true }).limit(200);
    const hydrated = await hydratePosts(supabaseAdmin, [post, ...(replies ?? [])], context.userId);
    return { post: hydrated[0] ?? null, replies: hydrated.slice(1) };
  });

// ---------- create ----------
export const createCommunityPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { body: string; media_urls?: string[]; parent_post_id?: string | null }) => {
    const body = String(d.body || "").trim();
    if (!body && !(d.media_urls || []).length) throw new Error("Post is empty");
    if (body.length > 500) throw new Error("Post too long (max 500 chars)");
    const media = (d.media_urls || []).slice(0, 4);
    const cashtags = Array.from(new Set((body.match(/\$[A-Za-z]{1,10}/g) || []).map((s) => s.slice(1).toUpperCase())));
    return { body, media_urls: media, parent_post_id: d.parent_post_id ?? null, cashtags };
  })
  .handler(async ({ context, data }) => {
    // ensure profile exists
    const { data: prof } = await context.supabase.from("community_profiles").select("user_id").eq("user_id", context.userId).maybeSingle();
    if (!prof) throw new Error("Claim a @handle first");
    const { data: inserted, error } = await context.supabase
      .from("community_posts")
      .insert({
        author_id: context.userId,
        body: data.body,
        media_urls: data.media_urls,
        parent_post_id: data.parent_post_id,
        cashtags: data.cashtags,
      })
      .select("id").single();
    if (error) throw new Error(error.message);
    return { id: inserted.id as string };
  });

export const deleteCommunityPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("community_posts").update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id).eq("author_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- engagement ----------
export const toggleLike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { post_id: string; liked: boolean }) => d)
  .handler(async ({ context, data }) => {
    if (data.liked) {
      await context.supabase.from("community_likes").delete().eq("user_id", context.userId).eq("post_id", data.post_id);
    } else {
      await context.supabase.from("community_likes").insert({ user_id: context.userId, post_id: data.post_id });
    }
    return { liked: !data.liked };
  });

export const toggleRepost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { post_id: string; on: boolean }) => d)
  .handler(async ({ context, data }) => {
    if (data.on) {
      await context.supabase.from("community_reposts").delete().eq("user_id", context.userId).eq("post_id", data.post_id);
    } else {
      await context.supabase.from("community_reposts").insert({ user_id: context.userId, post_id: data.post_id });
    }
    return { on: !data.on };
  });

export const toggleBookmark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { post_id: string; on: boolean }) => d)
  .handler(async ({ context, data }) => {
    if (data.on) {
      await context.supabase.from("community_bookmarks").delete().eq("user_id", context.userId).eq("post_id", data.post_id);
    } else {
      await context.supabase.from("community_bookmarks").insert({ user_id: context.userId, post_id: data.post_id });
    }
    return { on: !data.on };
  });

export const toggleFollow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { followee_id: string; on: boolean }) => d)
  .handler(async ({ context, data }) => {
    if (data.followee_id === context.userId) throw new Error("Cannot follow yourself");
    if (data.on) {
      await context.supabase.from("community_follows").delete().eq("follower_id", context.userId).eq("followee_id", data.followee_id);
    } else {
      await context.supabase.from("community_follows").insert({ follower_id: context.userId, followee_id: data.followee_id });
    }
    return { on: !data.on };
  });

export const recordImpression = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { post_id: string }) => d)
  .handler(async ({ context, data }) => {
    await context.supabase.from("community_impressions").insert({ user_id: context.userId, post_id: data.post_id });
    return { ok: true };
  });

export const reportContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { post_id?: string; profile_id?: string; reason: string }) => {
    const reason = String(d.reason || "").slice(0, 500);
    if (!reason.trim()) throw new Error("Reason required");
    return { post_id: d.post_id, profile_id: d.profile_id, reason };
  })
  .handler(async ({ context, data }) => {
    await context.supabase.from("community_reports").insert({
      reporter_id: context.userId,
      post_id: data.post_id ?? null,
      profile_id: data.profile_id ?? null,
      reason: data.reason,
    });
    return { ok: true };
  });
