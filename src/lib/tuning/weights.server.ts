// Server-only helpers for loading & caching the active signal-weight config.
// Not imported from client code — anything that touches this file is server-scoped.
import type { FactorWeightsByAsset } from "@/lib/analysis/engine";
import { DEFAULT_FACTOR_WEIGHTS } from "@/lib/analysis/engine";

type Cached = {
  configId: string | null;
  version: number | null;
  weights: FactorWeightsByAsset;
  fetchedAt: number;
};

let CACHE: Cached | null = null;
const TTL_MS = 60_000;

export function invalidateActiveWeightsCache() {
  CACHE = null;
}

/**
 * Returns the currently-active weight set. Falls back to the hard-coded
 * defaults if the DB is unreachable or no row is marked active. Cached for
 * 60s so a busy scan burst doesn't re-query the row every tick.
 */
export async function getActiveWeights(): Promise<{
  weights: FactorWeightsByAsset;
  version: number | null;
  configId: string | null;
}> {
  const now = Date.now();
  if (CACHE && now - CACHE.fetchedAt < TTL_MS) {
    return { weights: CACHE.weights, version: CACHE.version, configId: CACHE.configId };
  }
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("signal_weight_configs")
      .select("id, version, weights")
      .eq("status", "active")
      .maybeSingle();
    if (error) throw error;
    if (data?.weights && typeof data.weights === "object") {
      CACHE = {
        configId: data.id as string,
        version: Number(data.version),
        weights: data.weights as unknown as FactorWeightsByAsset,
        fetchedAt: now,
      };
      return { weights: CACHE.weights, version: CACHE.version, configId: CACHE.configId };
    }
  } catch {
    // fall through to defaults
  }
  CACHE = { configId: null, version: null, weights: DEFAULT_FACTOR_WEIGHTS, fetchedAt: now };
  return { weights: DEFAULT_FACTOR_WEIGHTS, version: null, configId: null };
}
