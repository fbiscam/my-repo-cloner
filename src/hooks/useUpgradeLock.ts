import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Founding-program trial lock.
 * While a user is in the 30-day founding trial (or documents aren't verified),
 * cross-plan "Upgrade" CTAs are disabled. After 30 days AND documents verified,
 * upgrades unlock.
 */
export type UpgradeLock = {
  loading: boolean;
  locked: boolean;
  reason: "trial_active" | "docs_pending" | null;
  unlocksAt: string | null; // ISO date when 30-day trial ends
  daysLeft: number | null;
  documentStatus: string | null;
};

const DEFAULT: UpgradeLock = {
  loading: true,
  locked: false,
  reason: null,
  unlocksAt: null,
  daysLeft: null,
  documentStatus: null,
};

export function useUpgradeLock(): UpgradeLock {
  const [state, setState] = useState<UpgradeLock>(DEFAULT);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user?.email) {
        if (mounted) setState({ ...DEFAULT, loading: false });
        return;
      }
      const { data } = await supabase
        .from("founding_applications")
        .select("status, document_status, approved_at, created_at")
        .ilike("email", u.user.email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!mounted) return;
      if (!data) {
        setState({ ...DEFAULT, loading: false });
        return;
      }

      const docStatus = (data.document_status as string | null) ?? "not_submitted";
      const approvedAt = (data.approved_at as string | null) ?? null;
      const trialStart = approvedAt ? new Date(approvedAt) : null;
      const trialEnd = trialStart
        ? new Date(trialStart.getTime() + 30 * 24 * 60 * 60 * 1000)
        : null;
      const now = new Date();
      const trialActive = !!trialEnd && now < trialEnd;
      const docsVerified = docStatus === "verified";

      // Unlocks as soon as identity documents are verified — no need to wait
      // for the full 30-day trial to elapse.
      const locked = !docsVerified;
      const reason: UpgradeLock["reason"] = !docsVerified ? "docs_pending" : null;

      const daysLeft = trialEnd
        ? Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / 86_400_000))
        : null;

      setState({
        loading: false,
        locked,
        reason: locked ? reason : null,
        unlocksAt: trialEnd ? trialEnd.toISOString() : null,
        daysLeft,
        documentStatus: docStatus,
      });
    };
    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
