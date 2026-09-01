import { Link } from "@tanstack/react-router";

const LINKS: { label: string; to: string }[] = [
  { label: "About Us", to: "/about" },
  { label: "Contact Us", to: "/contact" },
  { label: "Privacy Policy", to: "/privacy" },
  { label: "Broadcasts", to: "/broadcasts" },
  { label: "Help Center", to: "/help" },
];

export default function DashboardFooter(_props: { sidebarCollapsed?: boolean } = {}) {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-8 shrink-0 border-t border-zinc-200 bg-transparent py-4 sm:h-11 sm:py-0">
      <div className="mx-auto flex h-full max-w-7xl flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 text-center text-[12px] text-zinc-600 sm:gap-y-1 sm:px-6">
        {LINKS.map((l) => (
          <Link
            key={l.to}
            to={l.to}
            className="text-zinc-700 hover:text-zinc-900 hover:underline underline-offset-4"
          >
            {l.label}
          </Link>
        ))}
        <span className="text-zinc-500">© {year} Jenvu, Inc.</span>
      </div>
    </footer>
  );
}
