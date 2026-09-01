import { Link, useRouterState } from "@tanstack/react-router";

const TABS = [
  { to: "/dashboard", icon: "home", label: "Home" },
  { to: "/signals-live", icon: "insights", label: "Signal" },
  { to: "/signals-live", icon: "bolt", label: "Live" },
  { to: "/dashboard/notifications", icon: "notifications", label: "Alerts" },
  { to: "/dashboard/profile", icon: "person", label: "Profile" },
] as const;

export function PwaTabBar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAuthArea =
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/signals-live" ||
    pathname === "/signals-live";
  if (!isAuthArea) return null;
  return (
    <nav className="pwa-tabbar hide-in-pwa-never" aria-label="App navigation">
      {TABS.map((t) => {
        const active =
          t.to === "/dashboard"
            ? pathname === "/dashboard"
            : pathname === t.to || pathname.startsWith(t.to + "/");
        return (
          <Link key={t.to} to={t.to} data-active={active ? "true" : "false"}>
            <span className="material-symbols-rounded" aria-hidden>
              {t.icon}
            </span>
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default PwaTabBar;
