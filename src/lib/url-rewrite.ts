/**
 * URL rewriting for the apex domain (jenvu.com).
 *
 * Goals:
 *  - Stop the subdomain mounting scene (dash./leads./blogs./support.jenvu.com).
 *  - Keep the internal route tree at /dashboard/* for the trading dashboard.
 *  - Expose clean public URLs on the apex domain:
 *      jenvu.com/alerts           -> /dashboard/alerts
 *      jenvu.com/billing          -> /dashboard/billing
 *      jenvu.com/admin/accuracy   -> /dashboard/admin/accuracy
 *      jenvu.com/dashboard        -> /dashboard (overview, no rewrite)
 *      jenvu.com/leads/*          -> /leads/* (no rewrite, just the normal route)
 *
 * On the server, `apexRedirectTarget` sends subdomain traffic and legacy
 * /dashboard/child paths to the new apex URL, then the router rewrite maps
 * the apex URL to the internal route tree.
 */

const ROOT_DOMAIN = "jenvu.com";

const SUBDOMAIN_SECTIONS: Record<string, string> = {
  leads: "/leads",
  dash: "/dashboard",
  blogs: "/insights",
  support: "/help",
};

// Top-level dashboard children that should be exposed at the root.
const DASHBOARD_CHILDREN = new Set([
  "alerts",
  "analytics",
  "billing",
  "documents",
  "journal",
  "notifications",
  "profile",
  "referrals",
  "risk",
  "security",
  "usage",
  "workspace",
]);

/** Paths that must never be rewritten or redirected (server endpoints, assets, RPC). */
function isReserved(pathname: string): boolean {
  return (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/lovable/") ||
    pathname.startsWith("/email/") ||
    pathname.startsWith("/_serverFn") ||
    pathname.startsWith("/_build/") ||
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/@") ||
    /\.[a-z0-9]{2,5}$/i.test(pathname)
  );
}

function isApex(host: string): boolean {
  return host === ROOT_DOMAIN || host === `www.${ROOT_DOMAIN}`;
}

/**
 * Server-level redirect target.
 *
 * 1. Send all jenvu.com subdomains (and www) to the apex domain with the
 *    correct section prefix so old bookmarks still work.
 * 2. On the apex domain, redirect legacy /dashboard/child URLs to the
 *    clean /child URL (the router will map back to /dashboard/child internally).
 */
export function apexRedirectTarget(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  const p = url.pathname;
  if (isReserved(p)) return null;

  // 1. Subdomain -> apex (with section prefix). Handle www. specially.
  if (host === `www.${ROOT_DOMAIN}`) {
    if (isReserved(p)) return null;
    const next = new URL(url);
    next.hostname = ROOT_DOMAIN;
    return next.toString();
  }

  if (host !== ROOT_DOMAIN && host.endsWith(`.${ROOT_DOMAIN}`)) {
    const sub = host.slice(0, host.length - `.${ROOT_DOMAIN}`.length);
    if (sub.includes(".")) return null;
    const section = SUBDOMAIN_SECTIONS[sub];
    if (!section) return null;
    const next = new URL(url);
    next.hostname = ROOT_DOMAIN;
    // For the dash section, the dashboard child pages are exposed at the root.
    if (section === "/dashboard") {
      next.pathname = p === "/" ? "/dashboard" : p;
    } else {
      next.pathname = p === "/" ? section : `${section}${p}`;
    }
    return next.toString();
  }


  // 2. Apex domain: redirect /dashboard/child -> /child for clean URLs.
  if (isApex(host)) {
    const segments = p.split("/").filter(Boolean);
    if (segments.length >= 2 && segments[0] === "dashboard") {
      const child = segments[1];
      const isAdmin = child === "admin";
      const isKnownChild = DASHBOARD_CHILDREN.has(child);
      if (isKnownChild || isAdmin) {
        const next = new URL(url);
        next.hostname = ROOT_DOMAIN;
        if (isAdmin) {
          // /dashboard/admin/accuracy -> /admin/accuracy
          next.pathname = "/" + segments.slice(1).join("/");
        } else {
          // /dashboard/alerts -> /alerts
          next.pathname = "/" + segments.slice(1).join("/");
        }
        return next.toString();
      }
    }
  }

  return null;
}

/**
 * External address-bar URL -> internal router URL.
 *
 * On the apex domain, map clean URLs back to the internal route tree.
 */
export function rewriteInput(url: URL): URL | undefined {
  const host = url.hostname.toLowerCase();
  if (!isApex(host)) return undefined;
  const p = url.pathname;
  if (isReserved(p)) return undefined;

  // Admin paths: /admin/* -> /dashboard/admin/*
  if (p === "/admin" || p.startsWith("/admin/")) {
    const next = new URL(url);
    next.pathname = `/dashboard${p}`;
    return next;
  }

  // Dashboard child paths: /alerts -> /dashboard/alerts
  const segments = p.split("/").filter(Boolean);
  if (segments.length === 1 && DASHBOARD_CHILDREN.has(segments[0])) {
    const next = new URL(url);
    next.pathname = `/dashboard/${segments[0]}`;
    return next;
  }

  return undefined;
}

/**
 * Internal router URL -> external address-bar URL.
 *
 * Strips the /dashboard prefix from dashboard children so the address bar stays
 * clean while the internal route tree still resolves.
 */
export function rewriteOutput(url: URL): URL | undefined {
  const host = url.hostname.toLowerCase();
  if (!isApex(host)) return undefined;
  const p = url.pathname;
  if (isReserved(p)) return undefined;

  // Admin paths: /dashboard/admin/* -> /admin/*
  if (p === "/dashboard/admin" || p.startsWith("/dashboard/admin/")) {
    const next = new URL(url);
    next.pathname = "/admin" + (p === "/dashboard/admin" ? "" : p.slice("/dashboard/admin".length));
    return next;
  }


  // Dashboard child paths: /dashboard/alerts -> /alerts
  const segments = p.split("/").filter(Boolean);
  if (segments.length === 2 && segments[0] === "dashboard" && DASHBOARD_CHILDREN.has(segments[1])) {
    const next = new URL(url);
    next.pathname = `/${segments[1]}`;
    return next;
  }

  return undefined;
}
