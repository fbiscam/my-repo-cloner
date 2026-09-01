import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Users, Globe, Upload, Wallet, Activity, ListChecks } from "lucide-react";
import { getOverview } from "@/lib/leadgen/core.functions";
import { Card } from "@/components/leadgen/LeadsShell";
import { LeadsLanding } from "@/components/leadgen/LeadsLanding";

export const Route = createFileRoute("/leads/")({
  head: () => ({
    meta: [
      { title: "Jenvu Leads — Free B2B lead generation desk" },
      {
        name: "description",
        content:
          "Google Maps search, people search and website enrichment in one desk. Create a free account and get 50 credits — 100 saved leads, no card required.",
      },
      { property: "og:title", content: "Jenvu Leads — Free B2B lead generation desk" },
      {
        property: "og:description",
        content:
          "Search Maps, find decision makers, enrich websites and export leads. 50 free credits on sign-up.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Overview,
});

const SHORTCUTS = [
  { to: "/leads/maps", label: "Maps search", desc: "Find local businesses", icon: MapPin },
  { to: "/leads/people", label: "People search", desc: "Find decision makers", icon: Users },
  { to: "/leads/enrich", label: "Enrich", desc: "Crawl a website for contacts", icon: Globe },
  { to: "/leads/import", label: "Import CSV", desc: "Bring your own list", icon: Upload },
];

function Stat({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: typeof MapPin;
}) {
  return (
    <Card className="p-5 transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_14px_36px_-18px_rgba(0,0,0,0.18)]">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500">{label}</div>
        {Icon && (
          <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-600">
            <Icon className="h-4 w-4" strokeWidth={1.8} />
          </span>
        )}
      </div>
      <div className="mt-3 text-[30px] font-semibold leading-none tracking-tight text-zinc-900 tabular-nums">
        {value}
      </div>
      {sub && <div className="mt-2 text-[12px] text-zinc-500">{sub}</div>}
    </Card>
  );
}

function Overview() {
  const { signedIn } = Route.useRouteContext();
  const fetchOverview = useServerFn(getOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["lg-overview"],
    queryFn: () => fetchOverview(),
    enabled: signedIn,
  });

  // Guests see the public marketing page (this is leads.jenvu.com's front door).
  if (!signedIn) return <LeadsLanding />;


  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          icon={Wallet}
          label="Credits remaining"
          value={isLoading ? "—" : (data?.credits.remaining ?? 0).toFixed(2)}
          sub={`Limit ${(data?.credits.monthly_limit ?? 0).toFixed(0)} / month`}
        />
        <Stat
          icon={Activity}
          label="Credits used"
          value={isLoading ? "—" : (data?.credits.used ?? 0).toFixed(2)}
          sub="Resets on the 1st"
        />
        <Stat icon={Users} label="Saved leads" value={isLoading ? "—" : String(data?.leads ?? 0)} />
        <Stat icon={ListChecks} label="Lists" value={isLoading ? "—" : String(data?.lists ?? 0)} />
      </div>

      <h2 className="mb-3 mt-8 text-[13px] font-semibold uppercase tracking-[0.08em] text-zinc-500">Shortcuts</h2>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {SHORTCUTS.map((s) => (
          <Link key={s.to} to={s.to}>
            <Card className="group h-full p-5 transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-[0_14px_36px_-18px_rgba(0,0,0,0.18)]">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-700 transition group-hover:bg-zinc-900 group-hover:text-white">
                <s.icon className="h-4.5 w-4.5" strokeWidth={1.8} />
              </span>
              <div className="mt-3 text-[14px] font-semibold text-zinc-900">{s.label}</div>
              <div className="mt-1 text-[12px] text-zinc-500">{s.desc}</div>
            </Card>
          </Link>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-[13px] font-semibold uppercase tracking-[0.08em] text-zinc-500">Recent lists</h2>
      <Card>
        {(data?.recentLists ?? []).length === 0 ? (
          <div className="p-6 text-[13px] text-[#5F6368]">
            No lists yet.{" "}
            <Link to="/leads/lists" className="text-[#1A73E8] hover:underline">
              Create your first list
            </Link>
            .
          </div>
        ) : (
          <ul className="divide-y divide-[#E8EAED]">
            {(data?.recentLists ?? []).map((l) => (
              <li key={l.id} className="flex items-center justify-between px-5 py-3">
                <Link to="/leads/lists" className="text-[13px] text-[#1A73E8] hover:underline">
                  {l.name}
                </Link>
                <span className="text-[12px] text-[#80868B]">
                  {new Date(l.created_at).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
