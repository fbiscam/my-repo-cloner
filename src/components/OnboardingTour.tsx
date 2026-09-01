import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { X, ArrowRight, LayoutDashboard, Radar, Scale } from "lucide-react";

const STORAGE_KEY = "jenvu.onboarding.v1.dismissed";

type Step = {
  title: string;
  body: string;
  icon: typeof LayoutDashboard;
  cta: { to: string; label: string };
};

const STEPS: Step[] = [
  {
    title: "Your desk, at a glance",
    body: "Account Overview shows saved signals, alerts, trade journal stats and open positions — everything in one white surface.",
    icon: LayoutDashboard,
    cta: { to: "/dashboard", label: "Explore dashboard" },
  },
  {
    title: "Institutional signal engine",
    body: "Signal Desk runs ICT/SMC scans across XAU/USD, EUR, GBP, JPY, AUD, CHF with 64% confidence gate and killzone timing.",
    icon: Radar,
    cta: { to: "/signal", label: "Open Signal Desk" },
  },
  {
    title: "Risk sized to your balance",
    body: "Risk Manager tunes lot size, SL and TP to your live wallet balance so every alert respects your account.",
    icon: Scale,
    cta: { to: "/dashboard/risk", label: "Set up Risk" },
  },
];

/**
 * Lightweight welcome tour shown once for new dashboard visits.
 * Dismissal is stored in localStorage so it never re-appears for that browser.
 */
export function OnboardingTour() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "1") return;
      // small delay so it doesn't fight page render
      const t = setTimeout(() => setOpen(true), 700);
      return () => clearTimeout(t);
    } catch { /* ignore */ }
  }, []);

  function dismiss() {
    try { window.localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    setOpen(false);
  }

  if (!open) return null;
  const s = STEPS[step];
  const Icon = s.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-[100] flex items-end justify-center bg-zinc-900/30 p-4 backdrop-blur-sm sm:items-center animate-fade-in"
      onClick={dismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-[0_24px_60px_-20px_rgba(24,24,27,0.25)] animate-scale-in"
      >
        <div className="mb-4 flex items-start justify-between">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-900">
            <Icon className="h-5 w-5" />
          </div>
          <button
            onClick={dismiss}
            className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
            aria-label="Dismiss tour"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-500">
          Welcome
          <span className="text-zinc-300">·</span>
          <span className="text-zinc-500">{step + 1} / {STEPS.length}</span>
        </div>
        <h2 id="onboarding-title" className="text-xl font-semibold tracking-tight text-zinc-900">
          {s.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">{s.body}</p>

        {/* progress dots */}
        <div className="mt-5 flex items-center gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-6 bg-zinc-900" : "w-1.5 bg-zinc-300"
              }`}
            />
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            onClick={dismiss}
            className="text-sm text-zinc-500 hover:text-zinc-900"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            <Link
              to={s.cta.to as "/dashboard"}
              onClick={dismiss}
              className="hover-glow inline-flex items-center justify-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900"
            >
              {s.cta.label}
            </Link>
            <button
              onClick={() => (isLast ? dismiss() : setStep((s) => s + 1))}
              className="hover-lift inline-flex items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              {isLast ? "Get started" : "Next"}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default OnboardingTour;
