// Cache the signed avatar URL together with its expiry so the dashboard can
// paint the real photo instantly on load and never show a dead (expired) link.
const KEY = "jenvu:profile:avatar";
const TTL_SECONDS = 60 * 60; // matches createSignedUrl expiry

type Cached = { url: string; exp: number };

export const AVATAR_TTL_SECONDS = TTL_SECONDS;

export function readCachedAvatar(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cached;
    if (!parsed?.url || typeof parsed.exp !== "number") return null;
    // Treat the last 5 minutes as expired to avoid racing the real expiry.
    if (Date.now() > parsed.exp - 5 * 60 * 1000) return null;
    return parsed.url;
  } catch {
    return null;
  }
}

export function writeCachedAvatar(url: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (!url) localStorage.removeItem(KEY);
    else
      localStorage.setItem(
        KEY,
        JSON.stringify({ url, exp: Date.now() + TTL_SECONDS * 1000 } satisfies Cached),
      );
  } catch {
    /* ignore */
  }
}

export function clearCachedAvatar() {
  writeCachedAvatar(null);
}
