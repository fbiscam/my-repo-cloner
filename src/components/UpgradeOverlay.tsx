import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import * as React from "react";

const MONO = "font-['JetBrains_Mono',ui-monospace,monospace]";

type Props = {
  show: boolean;
  title?: string;
  description?: string;
  ctaLabel?: string;
  ctaTo?: string;
  children: React.ReactNode;
};

export default function UpgradeOverlay({
  show,
  title = "Locked on your plan",
  description = "Upgrade to Pro or Elite to unlock this feature.",
  ctaLabel = "View plans",
  ctaTo = "/pricing",
  children,
}: Props) {
  return (
    <div className="relative">
      <div className={show ? "pointer-events-none select-none blur-sm opacity-60" : ""}>{children}</div>
      {show && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
          <div className="max-w-sm rounded-2xl border border-zinc-200 bg-white/95 backdrop-blur p-6 text-center shadow-xl">
            <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-900">
              <Lock className="h-4 w-4" />
            </div>
            <div className={`${MONO} text-[10px] uppercase tracking-[0.25em] text-zinc-500`}>Premium</div>
            <h3 className="mt-1 text-lg font-semibold text-zinc-900">{title}</h3>
            <p className="mt-2 text-sm text-zinc-600">{description}</p>
            <Link
              to={ctaTo}
              className="mt-4 inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-50"
            >
              {ctaLabel}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
