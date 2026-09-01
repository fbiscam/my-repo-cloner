import { createServerFn } from "@tanstack/react-start";

export type PublicSignalRow = {
  pair: string;
  direction: "long" | "short" | string;
  grade: string | null;
  confidence: number | null;
  rr: number | null;
  session: string | null;
  killzone: string | null;
  fired_at: string;
};

/**
 * Public read of the most recent alert-worthy signals for marketing surfaces
 * (homepage ticker, trust widgets). Returns sanitized DTOs only — never user
 * IDs, entries, SL/TP, or rationale text.
 */
export const getPublicRecentSignals = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicSignalRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("signal_alerts")
      .select("pair,direction,grade,confidence,rr,session,killzone,fired_at")
      .gte("fired_at", since)
      .order("fired_at", { ascending: false })
      .limit(20);
    if (error) return [];
    return (data ?? []) as PublicSignalRow[];
  },
);
