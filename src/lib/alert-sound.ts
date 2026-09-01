// Client-side alert sound presets. Preference is stored in localStorage
// under `jenvu.alert.sound` — no DB migration needed.

export type AlertSoundKey = "chime" | "bell" | "ping" | "off";

export const ALERT_SOUND_OPTIONS: { key: AlertSoundKey; label: string; description: string }[] = [
  { key: "chime", label: "Chime", description: "Warm 3-note arpeggio (default)" },
  { key: "bell", label: "Bell", description: "Single soft bell tone" },
  { key: "ping", label: "Ping", description: "Short high ping" },
  { key: "off", label: "Muted", description: "Silent — visual toasts only" },
];

const STORAGE_KEY = "jenvu.alert.sound";

export function getAlertSoundPref(): AlertSoundKey {
  if (typeof window === "undefined") return "chime";
  try {
    const v = window.localStorage.getItem(STORAGE_KEY) as AlertSoundKey | null;
    if (v === "chime" || v === "bell" || v === "ping" || v === "off") return v;
  } catch { /* ignore */ }
  return "chime";
}

export function setAlertSoundPref(v: AlertSoundKey) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, v);
    window.dispatchEvent(new CustomEvent("jenvu:alert-sound-changed", { detail: v }));
  } catch { /* ignore */ }
}

type SoundSpec = { freq: number; start: number; dur: number; gain: number };

const PRESETS: Record<Exclude<AlertSoundKey, "off">, SoundSpec[]> = {
  chime: [
    { freq: 880,  start: 0.00, dur: 0.18, gain: 0.18 },
    { freq: 1175, start: 0.12, dur: 0.18, gain: 0.18 },
    { freq: 1568, start: 0.24, dur: 0.20, gain: 0.18 },
  ],
  bell: [
    { freq: 660,  start: 0.00, dur: 0.55, gain: 0.20 },
    { freq: 990,  start: 0.00, dur: 0.55, gain: 0.08 },
  ],
  ping: [
    { freq: 1760, start: 0.00, dur: 0.14, gain: 0.16 },
  ],
};

export function playAlertSound(key?: AlertSoundKey) {
  if (typeof window === "undefined") return;
  const which = key ?? getAlertSoundPref();
  if (which === "off") return;
  try {
    const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const t0 = ctx.currentTime;
    const spec = PRESETS[which];
    let maxEnd = 0;
    for (const s of spec) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = s.freq;
      g.gain.setValueAtTime(0.0001, t0 + s.start);
      g.gain.exponentialRampToValueAtTime(s.gain, t0 + s.start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + s.start + s.dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t0 + s.start);
      o.stop(t0 + s.start + s.dur + 0.02);
      maxEnd = Math.max(maxEnd, s.start + s.dur);
    }
    setTimeout(() => ctx.close().catch(() => { /* ignore */ }), (maxEnd + 0.2) * 1000);
  } catch { /* ignore */ }
}
