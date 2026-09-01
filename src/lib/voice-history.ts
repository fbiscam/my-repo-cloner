// Local persistence of voice agent chat turns (browser-only)
export type VoiceTurn = { query: string; reply: string; ts: number };

const KEY = "jenvu:voice:history";
const MAX = 50;

export function getVoiceHistory(): VoiceTurn[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function appendVoiceTurn(turn: Omit<VoiceTurn, "ts"> & { ts?: number; source?: string }) {
  if (typeof window === "undefined") return;
  try {
    const list = getVoiceHistory();
    list.unshift({ query: turn.query, reply: turn.reply, ts: turn.ts ?? Date.now() });
    const trimmed = list.slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(trimmed));
    window.dispatchEvent(new CustomEvent("jenvu:voice:history:updated"));
  } catch {
    /* ignore */
  }
  // Fire-and-forget server persistence so the dashboard sees it across devices/domains.
  try {
    import("./voice-history.functions").then(({ saveVoiceTurn }) => {
      saveVoiceTurn({ data: { query: turn.query, reply: turn.reply, source: turn.source } })
        .then(() => window.dispatchEvent(new CustomEvent("jenvu:voice:history:updated")))
        .catch(() => {});
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

export function clearVoiceHistory() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent("jenvu:voice:history:updated"));
}

export function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function formatDateTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return new Date(ts).toISOString();
  }
}
