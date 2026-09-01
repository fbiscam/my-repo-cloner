import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { btnPrimary, inputCls, labelCls, JENVU_SANS } from "@/components/leadgen/LeadsShell";

export const Route = createFileRoute("/leads-signin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Jenvu Leads" },
      { name: "description", content: "Sign in to the invite-only Jenvu Leads generation desk." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: SignIn,
});

function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) router.navigate({ to: "/leads", replace: true });
    });
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setLoading(false);
    if (error) {
      setErr(error.message);
      return;
    }
    router.navigate({ to: "/leads", replace: true });
  }

  return (
    <div
        style={{ fontFamily: JENVU_SANS }}
        className="lg-console flex min-h-dvh items-center justify-center bg-[#FAFAFA] px-5 py-16 text-zinc-900 antialiased"
      >
      <form
        onSubmit={onSubmit}
        className="w-full max-w-[420px] rounded-xl border border-zinc-200 bg-white p-8 shadow-[0_4px_20px_-8px_rgba(24,24,27,0.08)]"
      >
        <div className="flex flex-col items-center text-center">
          <img src="/favicon.png" alt="Jenvu" className="h-10 w-10 rounded-md object-contain" />
          <h1 className="mt-4 text-[24px] font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1.5 text-[13px] text-zinc-600">Continue to Jenvu Leads</p>
        </div>

        <div className="mt-7 space-y-4">
          <div>
            <label htmlFor="email" className={labelCls}>
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              className={inputCls}
              required
            />
          </div>
          <div>
            <label htmlFor="password" className={labelCls}>
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className={inputCls}
              required
            />
          </div>

          {err && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
              {err}
            </div>
          )}

          <button type="submit" disabled={loading} className={`${btnPrimary} w-full`}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </div>

        <p className="mt-6 text-center text-[12px] text-zinc-500">
          New here?{" "}
          <Link to="/leads-signup" className="font-medium text-zinc-900 underline underline-offset-2 hover:text-zinc-700">
            Create a free account
          </Link>{" "}
          and get 50 credits.
        </p>

      </form>
    </div>
  );
}
