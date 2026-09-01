import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

async function checkMfaPending(): Promise<boolean> {
  try {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    return !!(data && data.currentLevel === "aal1" && data.nextLevel === "aal2");
  } catch {
    return false;
  }
}

export function useAuthUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfaPending, setMfaPending] = useState(false);

  useEffect(() => {
    let alive = true;

    async function refresh(session: { user: User } | null) {
      if (!alive) return;
      if (!session?.user) {
        setUser(null);
        setMfaPending(false);
        setLoading(false);
        return;
      }
      const pending = await checkMfaPending();
      if (!alive) return;
      setMfaPending(pending);
      setUser(session.user);
      setLoading(false);
    }

    supabase.auth.getSession().then(({ data }) => {
      refresh(data.session as any);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((evt, session) => {
      if (evt === "SIGNED_OUT") {
        if (!alive) return;
        setUser(null);
        setMfaPending(false);
        setLoading(false);
        return;
      }
      if (
        evt !== "SIGNED_IN" &&
        evt !== "USER_UPDATED" &&
        evt !== "INITIAL_SESSION" &&
        evt !== "TOKEN_REFRESHED" &&
        evt !== "MFA_CHALLENGE_VERIFIED"
      )
        return;
      refresh(session as any);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Treat MFA-pending sessions as signed-out for UI purposes: the user
  // hasn't completed the 2FA step yet, so header should not show Dashboard/Launch.
  const effectiveUser = mfaPending ? null : user;
  return { user: effectiveUser, loading, mfaPending, rawUser: user };
}
