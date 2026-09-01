import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  LayoutGrid,
  MapPin,
  Users,
  Globe,
  Upload,
  ListChecks,
  Activity,
  Shield,
} from "lucide-react";
import type { Me } from "@/lib/leadgen/shared";

/**
 * Jenvu design language (matches jenvu.com):
 *  - surface #FAFAFA, cards white with zinc-200 hairlines
 *  - ink zinc-900 / zinc-700 / zinc-500, no coloured brand accent
 *  - Google Sans for UI, JetBrains Mono for micro-labels and numerics
 */
export const JENVU_SANS =
  '"Google Sans", "Product Sans", "Poppins", system-ui, sans-serif';
export const MONO = "font-['JetBrains_Mono',ui-monospace,monospace]";

const NAV = [
  { to: "/leads", label: "Overview", icon: LayoutGrid, exact: true },
  { to: "/leads/maps", label: "Maps search", icon: MapPin },
  { to: "/leads/people", label: "People search", icon: Users },
  { to: "/leads/enrich", label: "Enrich", icon: Globe },
  { to: "/leads/import", label: "Import", icon: Upload },
  { to: "/leads/lists", label: "Lists", icon: ListChecks },
  { to: "/leads/activity", label: "Activity", icon: Activity },
];

export function LeadsShell({ me, children }: { me: Me | null; children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (to: string, exact?: boolean) =>
    exact ? pathname === to || pathname === `${to}/` : pathname.startsWith(to);

  const pct = me && me.credits.monthly_limit > 0
    ? Math.min(100, (me.credits.used / me.credits.monthly_limit) * 100)
    : 0;

  return (
    <div
      className="lg-console leads-shell-zoom flex min-h-dvh w-full bg-[#FAFAFA] text-zinc-900 antialiased selection:bg-zinc-900 selection:text-white"
      style={{ fontFamily: JENVU_SANS }}
    >
      <aside
        className="leads-sidebar-root fixed left-0 top-0 z-20 hidden h-dvh w-[200px] flex-col overflow-hidden border-r border-zinc-200 bg-white md:flex"
        style={{ fontFamily: JENVU_SANS, fontWeight: 400 }}
      >
        {/* Brand */}
        <div className="flex h-11 shrink-0 items-center gap-2.5 px-4">
          <img src="/favicon.png" alt="Jenvu" className="h-7 w-7 shrink-0 rounded-md object-contain" />
          <span
            className="truncate text-[22px] leading-none tracking-tight"
            style={{ color: "#3c4043", fontWeight: 500 }}
          >
            Jenvu
          </span>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 py-2">
          <div className="flex flex-col gap-1.5">
            {NAV.map((item) => {
              const active = isActive(item.to, item.exact);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`group relative flex items-center gap-3 rounded-full px-2.5 py-1.5 text-[13.5px] font-medium transition ${
                    active
                      ? "bg-zinc-100 font-semibold text-zinc-900"
                      : "text-[#5E5E5E] hover:bg-zinc-50 hover:text-zinc-900"
                  }`}
                >
                  <item.icon
                    className="h-[19px] w-[19px] shrink-0"
                    strokeWidth={active ? 2.1 : 1.7}
                    style={{ color: active ? "#18181b" : "#5E5E5E" }}
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>

          {me?.is_admin && (
            <div className="mt-2 border-t border-zinc-200 pt-3">
              <div className="mb-1.5 px-2.5 text-[10px] font-normal tracking-wider text-[#9B9C9B]">
                ADMIN
              </div>
              <Link
                to="/leads/admin/users"
                className={`flex items-center gap-3 rounded-full px-2.5 py-1.5 text-[13.5px] font-medium transition ${
                  isActive("/leads/admin")
                    ? "bg-zinc-100 font-semibold text-zinc-900"
                    : "text-[#5E5E5E] hover:bg-zinc-50 hover:text-zinc-900"
                }`}
              >
                <Shield className="h-[19px] w-[19px] shrink-0" strokeWidth={1.7} />
                <span className="truncate">Users</span>
              </Link>
            </div>
          )}
        </nav>
      </aside>



      <div className="flex min-w-0 flex-1 flex-col md:ml-[200px]">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-100 bg-white/85 px-4 backdrop-blur-md md:px-6">
          <div className="flex items-center gap-2.5 md:hidden">
            <img src="/favicon.png" alt="" className="h-7 w-7 rounded-md object-contain" />
            <span className="text-[17px] tracking-tight text-[#3c4043]" style={{ fontWeight: 500 }}>
              Jenvu <span className="text-zinc-400">Leads</span>
            </span>
          </div>
          <div className="hidden md:block" />
          <div className="flex items-center gap-3">
            {me && (
              <span className="hidden text-[12px] text-zinc-500 sm:block">
                {me.email}
                {me.is_admin && (
                  <span className={`ml-2 rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] text-white ${MONO}`}>
                    ADMIN
                  </span>
                )}
              </span>
            )}
            <Link
              to="/leads/account"
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-[12px] font-medium text-zinc-900 hover:bg-zinc-50"
            >
              Account
            </Link>
          </div>
        </header>

        <nav className="flex gap-1 overflow-x-auto border-b border-zinc-100 bg-white px-2 md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`whitespace-nowrap px-3 py-2.5 text-[12px] ${
                isActive(item.to, item.exact)
                  ? "border-b-2 border-zinc-900 font-medium text-zinc-900"
                  : "text-zinc-500"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <main className="min-w-0 flex-1 overflow-x-hidden p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-zinc-900">{title}</h1>
        {description && <p className="mt-1 text-[13px] text-zinc-600">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-zinc-200 bg-white shadow-[0_8px_24px_-12px_rgba(0,0,0,0.06)] ${className}`}
    >
      {children}
    </div>
  );
}

export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-[13px] font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50";
export const btnGhost =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-[13px] font-medium text-zinc-900 transition hover:bg-zinc-50 disabled:opacity-50";
export const inputCls =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px] text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10";
export const labelCls = "mb-1.5 block text-[12px] font-medium text-zinc-600";
