import { useEffect, useState } from "react";
import { useCredits } from "@/hooks/useCredits";

export type TrialView = {
  active: boolean;
  endsAt: Date | null;
  /** Whole days remaining, recomputed on a ticking clock (never stale). */
  daysLeft: number;
  hoursLeft: number;
  /** e.g. "27 August 2026, 18:40" */
  endsAtLabel: string | null;
  /** e.g. "27 Aug 2026" */
  endsAtShort: string | null;
};

export function formatTrialDate(d: Date) {
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

export function formatTrialDateTime(d: Date) {
  return `${formatTrialDate(d)}, ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

function derive(endsAtIso: string | null | undefined, activeFlag: boolean, now: number): TrialView {
  const endsAt = endsAtIso ? new Date(endsAtIso) : null;
  if (!endsAt || Number.isNaN(endsAt.getTime())) {
    return { active: false, endsAt: null, daysLeft: 0, hoursLeft: 0, endsAtLabel: null, endsAtShort: null };
  }
  const ms = endsAt.getTime() - now;
  return {
    active: activeFlag && ms > 0,
    endsAt,
    daysLeft: Math.max(0, Math.ceil(ms / 86_400_000)),
    hoursLeft: Math.max(0, Math.ceil(ms / 3_600_000)),
    endsAtLabel: formatTrialDateTime(endsAt),
    endsAtShort: endsAt.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }),
  };
}

/**
 * Trial state that stays correct without a refetch: the server supplies the
 * end date, the countdown is recomputed locally every minute.
 */
export function useTrial(): TrialView {
  const { state } = useCredits();
  const trial = state?.trial;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    const onFocus = () => setNow(Date.now());
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  return derive(trial?.endsAt ?? null, !!trial?.active, now);
}
