// Lightweight, stable-ish browser fingerprint for signup abuse control.
// Not privacy-invasive tracking — used only to cap accounts per device.
// Browsers do NOT expose the MAC address, so we combine a set of stable
// signals into a SHA-256 hash.

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function canvasSignal(): string {
  try {
    const c = document.createElement("canvas");
    c.width = 220; c.height = 40;
    const ctx = c.getContext("2d");
    if (!ctx) return "";
    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = "#f60";
    ctx.fillRect(0, 0, 220, 40);
    ctx.fillStyle = "#069";
    ctx.fillText("jenvu-fp-\u2708\u2764\uD83C\uDF10", 2, 4);
    ctx.strokeStyle = "rgba(120,50,200,0.7)";
    ctx.strokeRect(10, 10, 200, 20);
    return c.toDataURL();
  } catch { return ""; }
}

export async function getDeviceFingerprint(): Promise<string> {
  if (typeof window === "undefined") return "";
  try {
    const nav = window.navigator;
    const scr = window.screen;
    const parts = [
      nav.userAgent,
      nav.language,
      (nav.languages || []).join(","),
      String(nav.hardwareConcurrency ?? ""),
      String((nav as any).deviceMemory ?? ""),
      `${scr.width}x${scr.height}x${scr.colorDepth}`,
      String(new Date().getTimezoneOffset()),
      Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      nav.platform || "",
      canvasSignal(),
    ];
    return await sha256Hex(parts.join("|"));
  } catch {
    return "";
  }
}
