import * as React from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Lock, Loader2, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset your password — Jenvu" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "description", content: "Choose a new password for your Jenvu account." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = React.useState(false);
  const [hasSession, setHasSession] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);


  // Wait for Supabase to pick up the recovery token from the URL fragment / query
  // and either establish a recovery session or leave us signed out.
  React.useEffect(() => {
    let mounted = true;

    const sub = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || (session && event === "SIGNED_IN")) {
        setHasSession(true);
        setReady(true);
      }
    });

    (async () => {
      // Give the client a tick to process the URL, then fall back to getSession().
      await new Promise((r) => setTimeout(r, 250));
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setHasSession(Boolean(data.session));
      setReady(true);
    })();

    return () => {
      mounted = false;
      sub.data.subscription.unsubscribe();
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setSaving(true);
    const { error: upErr } = await supabase.auth.updateUser({ password });
    if (upErr) {
      setSaving(false);
      setError(upErr.message);
      return;
    }
    // Fire the "You're in — plan activates in 4 hours" email for founding users.
    // Best-effort: don't block the flow on failure.
    try {
      const { notifyFoundingPasswordSet } = await import("@/lib/founding.functions");
      await notifyFoundingPasswordSet();
    } catch {}
    // Sign out from every device (including this one) so the user re-logs in with
    // the new password everywhere.
    await supabase.auth.signOut({ scope: "global" }).catch(() => {});
    setSaving(false);
    setDone(true);
    toast.success("Password updated. Please sign in with your new password.");
    setTimeout(() => navigate({ to: "/auth" }), 1200);
  };

  return (
    <main className="min-h-screen bg-zinc-50 flex items-center justify-center px-4 py-12" style={{ fontFamily: '"Google Sans", "Google Sans Text", system-ui, -apple-system, sans-serif' }}>
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-zinc-900">Reset your password</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Choose a new password for your Jenvu account.
        </p>

        {!ready ? (
          <div className="mt-8 flex items-center justify-center py-8 text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : done ? (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4" />
              <div>
                <p className="font-medium">Password updated.</p>
                <p className="mt-1 text-[10px] sm:text-xs text-emerald-700 whitespace-nowrap">
                  You've been signed out of all devices. Redirecting to sign-in…
                </p>
              </div>
            </div>
          </div>
        ) : !hasSession ? (
          <div className="mt-6 space-y-4">
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              This reset link is invalid or has expired. Please request a new one from the
              sign-in screen.
            </div>
            <Link
              to="/auth"
              className="inline-flex w-full items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block text-xs font-medium text-zinc-600">
              New password
              <div className="mt-1 flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2">
                <Lock className="h-4 w-4 text-zinc-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-transparent text-sm outline-none"
                  placeholder="At least 8 characters"
                  required
                />
                <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"} className="text-zinc-400 hover:text-zinc-700">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

            </label>
            <label className="block text-xs font-medium text-zinc-600">
              Confirm new password
              <div className="mt-1 flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2">
                <Lock className="h-4 w-4 text-zinc-400" />
                <input
                  type={showConfirm ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full bg-transparent text-sm outline-none"
                  placeholder="Retype the new password"
                  required
                />
                <button type="button" onClick={() => setShowConfirm((v) => !v)} aria-label={showConfirm ? "Hide password" : "Show password"} className="text-zinc-400 hover:text-zinc-700">
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

            </label>
            {error && (() => {
              const idx = error.toLowerCase().indexOf("please");
              const first = idx > 0 ? error.slice(0, idx).trim() : error;
              const second = idx > 0 ? error.slice(idx).trim() : "";
              return (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] sm:text-xs text-rose-700 text-center leading-snug">
                  <span className="block">{first}</span>
                  {second && <span className="block">{second}</span>}
                </p>
              );
            })()}
            <button
              type="submit"
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {saving ? "Updating…" : "Update password"}
            </button>
            <p className="text-center text-[10px] sm:text-xs text-zinc-500 whitespace-nowrap">
              After updating, you'll be signed out everywhere and asked to sign in again.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
