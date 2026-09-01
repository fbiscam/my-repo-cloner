import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useCurrentPlan() {
  const [plan, setPlan] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        return;
      }
      const { data } = await supabase
        .from("user_subscriptions")
        .select("plan_id, status")
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (!mounted) return;
      if (data && data.status === "active") setPlan(data.plan_id);
      else setPlan(null);
    };
    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return plan;
}
