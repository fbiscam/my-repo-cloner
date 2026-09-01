import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAutoCloseTrades } from "@/hooks/useAutoCloseTrades";
import { useGlobalNotificationToasts } from "@/hooks/useGlobalNotificationToasts";
import { verifyTrustedDevice } from "@/lib/trusted-devices.functions";

const TRUSTED_DEVICE_KEY = (uid: string) => `mfa_trusted_device:${uid}`;

// In-memory per-tab cache so navigating between dashboard pages doesn't
// re-run any async auth checks (which caused a visible page flash while
// beforeLoad awaited the network).
let verifiedUserId: string | null = null;
let trustedDeviceVerified: string | null = null;
let planCheckedUserId: string | null = null;

async function hasValidTrustedDevice(uid: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (trustedDeviceVerified === uid) return true;
  const token = window.localStorage.getItem(TRUSTED_DEVICE_KEY(uid));
  if (!token) return false;
  try {
    const res = await verifyTrustedDevice({ data: { token } });
    if (res?.valid) {
      trustedDeviceVerified = uid;
      return true;
    }
    window.localStorage.removeItem(TRUSTED_DEVICE_KEY(uid));
  } catch {
    // If the check fails, fall back to the normal MFA prompt instead of crashing.
  }
  return false;
}

function AuthenticatedLayout() {
  useAutoCloseTrades();
  useGlobalNotificationToasts();
  return <Outlet />;
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    // Fast path: session is stored in localStorage and reads synchronously —
    // no network round-trip. This eliminates the inter-page blink.
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session?.user) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
    const user = session.user;

    // Already verified this user id in this tab — skip email/MFA re-checks.
    if (verifiedUserId === user.id) return;

    const confirmedAt =
      (user as { email_confirmed_at?: string | null; confirmed_at?: string | null })
        .email_confirmed_at ??
      (user as { confirmed_at?: string | null }).confirmed_at;
    if (!confirmedAt) {
      await supabase.auth.signOut();
      throw redirect({ to: "/auth", search: { verify: "1" } as never });
    }

    // getAuthenticatorAssuranceLevel decodes the current JWT — synchronous, no network.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.currentLevel === "aal1" && aal.nextLevel === "aal2") {
      if (await hasValidTrustedDevice(user.id)) {
        verifiedUserId = user.id;
        return;
      }
      throw redirect({ to: "/auth", search: { mfa: "1", redirect: location.href } as never });
    }

    verifiedUserId = user.id;

    // Access model: signups are invite-only via founding approvals.
    // Approved founding applicants sign in BEFORE their plan is activated
    // (plan activation happens when the admin marks the account "active" /
    // funded). Blocking the dashboard on user_subscriptions.status = "active"
    // strands approved users on /pricing with no way in. Let any signed-in
    // + email-confirmed + MFA-verified user reach the dashboard; plan-gated
    // features (alerts, scans) enforce their own paid-plan checks.
    if (planCheckedUserId !== user.id) {
      planCheckedUserId = user.id;
    }
  },
  component: AuthenticatedLayout,
});
