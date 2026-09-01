/**
 * Intl safety guard.
 *
 * Some systems report a locale tag that the ECMA-402 parser rejects — the most
 * common in our error log is `en-US@posix` (Linux/ChromeOS boxes started with
 * `LANG=en_US@posix`). On those machines EVERY default-locale call
 * (`date.toLocaleTimeString()`, `new Intl.DateTimeFormat()`, …) throws
 * `RangeError: Invalid language tag: en-US@posix`, which crashes the React tree.
 * That is why a manual scan worked fine on most accounts but blew up on a few —
 * it was the user's machine locale, not their plan or credits.
 *
 * This module detects the broken environment once and, only then, makes the
 * default locale fall back to `en-US`. Machines with a valid locale are
 * untouched.
 */
let installed = false;

export function installIntlGuard(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  let broken = false;
  try {
    new Date().toLocaleString();
    new Intl.DateTimeFormat();
    new Intl.NumberFormat();
  } catch {
    broken = true;
  }
  if (!broken) return;

  const FALLBACK = "en-US";
  const hasLocale = (l: unknown) =>
    typeof l === "string" ? l.length > 0 : Array.isArray(l) ? l.length > 0 : false;

  const patchDate = (key: "toLocaleString" | "toLocaleDateString" | "toLocaleTimeString") => {
    const orig = Date.prototype[key];
    Date.prototype[key] = function (this: Date, locales?: unknown, options?: unknown) {
      try {
        return orig.call(this, (hasLocale(locales) ? locales : FALLBACK) as never, options as never);
      } catch {
        return orig.call(this, FALLBACK as never, options as never);
      }
    } as typeof orig;
  };
  patchDate("toLocaleString");
  patchDate("toLocaleDateString");
  patchDate("toLocaleTimeString");

  const origNum = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = function (this: number, locales?: unknown, options?: unknown) {
    try {
      return origNum.call(this, (hasLocale(locales) ? locales : FALLBACK) as never, options as never);
    } catch {
      return origNum.call(this, FALLBACK as never, options as never);
    }
  } as typeof origNum;

  for (const name of ["DateTimeFormat", "NumberFormat", "RelativeTimeFormat", "ListFormat"] as const) {
    const Ctor = (Intl as unknown as Record<string, unknown>)[name] as
      | (new (locales?: unknown, options?: unknown) => unknown)
      | undefined;
    if (typeof Ctor !== "function") continue;
    const Base = Ctor as new (locales?: unknown, options?: unknown) => unknown;
    const Patched = function (this: unknown, locales?: unknown, options?: unknown) {
      const loc = hasLocale(locales) ? locales : FALLBACK;
      try {
        return new Base(loc, options);
      } catch {
        return new Base(FALLBACK, options);
      }
    } as unknown as typeof Ctor;
    (Patched as unknown as Record<string, unknown>).prototype = (Ctor as unknown as Record<string, unknown>).prototype;
    (Patched as unknown as Record<string, unknown>).supportedLocalesOf =
      (Ctor as unknown as Record<string, unknown>).supportedLocalesOf;
    (Intl as unknown as Record<string, unknown>)[name] = Patched;
  }
}
