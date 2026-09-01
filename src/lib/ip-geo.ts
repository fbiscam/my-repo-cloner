// Shared IP geolocation lookup with a 24h localStorage cache and in-flight
// de-duplication. ipapi.co rate-limits hard (HTTP 429) when several components
// each fetch it on mount, so every caller must go through this helper.

export type IpGeo = { timezone?: string; city?: string; country_name?: string };

const CACHE_KEY = "jenvu:ipGeo";
const TZ_KEY = "jenvu:ipTimezone";
const TTL_MS = 24 * 60 * 60 * 1000;

let inFlight: Promise<IpGeo | null> | null = null;

function readCache(): IpGeo | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; data: IpGeo };
    if (!parsed?.at || Date.now() - parsed.at > TTL_MS) return null;
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

function writeCache(data: IpGeo) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data }));
    if (data.timezone) window.localStorage.setItem(TZ_KEY, data.timezone);
  } catch {
    /* storage full / blocked — ignore */
  }
}

const FAIL_KEY = "jenvu:ipGeoFailAt";
const FAIL_BACKOFF_MS = 30 * 60 * 1000;

function recentlyFailed(): boolean {
  try {
    const at = Number(window.localStorage.getItem(FAIL_KEY) ?? 0);
    return !!at && Date.now() - at < FAIL_BACKOFF_MS;
  } catch {
    return false;
  }
}

function markFailed() {
  try { window.localStorage.setItem(FAIL_KEY, String(Date.now())); } catch { /* ignore */ }
}

/** Cached geo lookup. Returns null when offline, blocked or rate-limited. */
export async function getIpGeo(): Promise<IpGeo | null> {
  if (typeof window === "undefined") return null;
  const cached = readCache();
  if (cached) return cached;
  if (inFlight) return inFlight;
  // Negative cache: after a failure (429 / offline) stop hammering the API.
  if (recentlyFailed()) return null;

  inFlight = (async () => {
    try {
      const res = await fetch("https://ipapi.co/json/");
      if (!res.ok) { markFailed(); return null; } // 429 etc — fall back to device TZ
      const json = (await res.json()) as IpGeo & { error?: boolean };
      if (!json || json.error || !json.timezone) { markFailed(); return null; }
      const data: IpGeo = {
        timezone: json.timezone,
        city: json.city,
        country_name: json.country_name,
      };
      writeCache(data);
      return data;
    } catch {
      markFailed();
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Best-effort timezone: cached IP timezone, else the device timezone. */
export function cachedIpTimezone(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TZ_KEY);
  } catch {
    return null;
  }
}
