import { Link } from "@tanstack/react-router";

/** Canonical top-navigation links, shared by every public page. */
export const SITE_NAV_LINKS = [
  { to: "/signal", label: "Signal Engine" },
  { to: "/signals-live", label: "Signals Live" },
  { to: "/pricing", label: "Pricing" },
  { to: "/insights", label: "Insights" },
  { to: "/contact", label: "Contact" },
] as const;

export default function SiteNavLinks({ active }: { active?: string }) {
  return (
    <nav className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-7 text-sm text-zinc-900">
      {SITE_NAV_LINKS.map((l) => (
        <Link
          key={l.to}
          to={l.to}
          className={
            active === l.to
              ? "font-medium text-zinc-900"
              : "text-zinc-600 hover:text-zinc-900"
          }
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
