import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TwoFactorSettings } from "@/components/TwoFactorSettings";
import { TrustedDevicesSettings } from "@/components/TrustedDevicesSettings";

export const Route = createFileRoute("/_authenticated/dashboard/security")({
  component: SecurityPage,
});

function SecurityPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? "");
    })();
  }, []);

  const sendPasswordReset = async () => {
    if (!email || sending) return;
    setSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSending(false);
    if (error) toast.error(error.message);
    else toast.success("Password reset email sent");
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="pl-1 text-lg font-semibold">Security</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Manage how you sign in to Jenvu — password, two-factor authentication and trusted devices.
        </p>
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="pl-1 text-base font-semibold">&nbsp;Password</h2>
        <p className="mt-1 text-sm text-zinc-500">
          We'll email a secure single-use link to {email || "your account email"} so you can set a new password.
        </p>
        <button
          onClick={sendPasswordReset}
          disabled={sending || !email}
          className="mt-4 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
        >
          {sending ? "Sending…" : "Send password reset"}
        </button>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="pl-1 text-base font-semibold">&nbsp;Two-factor authentication</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Require a six-digit code from your authenticator app every time you sign in.
        </p>
        <div className="mt-4">
          <TwoFactorSettings />
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="pl-1 text-base font-semibold">&nbsp;Trusted devices</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Browsers you've marked as trusted skip the 2FA step on sign-in.&nbsp;
        </p>
        <div className="mt-4">
          <TrustedDevicesSettings />
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="pl-1 text-base font-semibold">&nbsp;Session</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Signing out clears your local session on this browser.&nbsp;
          <br />
          Trusted-device status stays until you revoke it above.
        </p>

        <button
          onClick={async () => {
            await supabase.auth.signOut();
            window.location.href = "/auth";
          }}
          className="mt-4 rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium hover:bg-zinc-50"
        >
          Sign out of this browser
        </button>
      </section>
    </div>
  );
}
