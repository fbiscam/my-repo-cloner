import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { opsStatus, opsUnlock } from "@/lib/ops-gate.functions";

export const Route = createFileRoute("/ops-x9k2-7m4n/")({
  head: () => ({
    meta: [
      { title: "Ops Console" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: OpsLogin,
});

const MONO = "font-['Google_Sans','Product_Sans','Roboto',system-ui,sans-serif] font-normal normal-case tracking-normal";
const SANS = "font-['Google_Sans','Product_Sans','Poppins',system-ui,sans-serif]";

function OpsLogin() {
  const router = useRouter();
  const unlock = useServerFn(opsUnlock);
  const status = useServerFn(opsStatus);
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    const token = window.sessionStorage.getItem("jenvu_ops_token") ?? undefined;
    status({ data: { token } })
      .then((s) => {
        if (alive && s.unlocked) router.navigate({ to: "/ops-x9k2-7m4n/hub", replace: true });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [router, status]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const res = await unlock({ data: { id: id.trim(), password } });
      if (res.ok) {
        window.sessionStorage.setItem("jenvu_ops_token", res.token);
        await router.navigate({ to: "/ops-x9k2-7m4n/hub" });
      } else {
        setErr("Invalid credentials");
      }
    } catch {
      setErr("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`min-h-dvh w-full bg-[#FAFAFA] text-zinc-900 ${SANS} antialiased selection:bg-zinc-900 selection:text-white`}>
      <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center px-5 py-16 sm:px-6">
        <form
          onSubmit={onSubmit}
          className="w-full rounded-2xl border border-zinc-200 bg-white p-6 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.08)] sm:p-8"
        >
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-200" />
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-200" />
            <span className="h-2.5 w-2.5 rounded-full bg-zinc-200" />
            <span className={`ml-3 ${MONO} text-[10px] uppercase tracking-[0.22em] text-zinc-500`}>
              ops · restricted
            </span>
            <span className={`ml-auto flex items-center gap-1.5 ${MONO} text-[10px] uppercase tracking-[0.22em] text-emerald-600`}>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
              live
            </span>
          </div>

          <div className="mt-6 flex items-center gap-2.5">
            <img src="/favicon.png" alt="Jenvu" className="h-7 w-7 rounded-md object-contain" />
            <span
              className="text-[22px] leading-none tracking-tight"
              style={{
                color: "#3c4043",
                fontFamily: '"Google Sans", "Product Sans", "DM Sans", system-ui, sans-serif',
                fontWeight: 500,
              }}
            >
              Jenvu
            </span>
          </div>

          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-zinc-900">Sign in to continue</h1>
          <p className="mt-2 text-sm text-zinc-600">Internal tools for the Jenvu operations team.</p>

          <div className="mt-6 space-y-5">
            <div>
              <label htmlFor="ops-id" className={`${MONO} text-[10px] uppercase tracking-[0.22em] text-zinc-500`}>
                ID
              </label>
              <div className="mt-1.5">
                <input
                  id="ops-id"
                  value={id}
                  onChange={(e) => setId(e.target.value)}
                  autoComplete="username"
                  spellCheck={false}
                  className={inputCls}
                  placeholder="operator id"
                />
              </div>
            </div>

            <div>
              <label htmlFor="ops-pw" className={`${MONO} text-[10px] uppercase tracking-[0.22em] text-zinc-500`}>
                Password
              </label>
              <div className="mt-1.5">
                <input
                  id="ops-pw"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className={inputCls}
                  placeholder="••••••••"
                />
              </div>
            </div>

            {err && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>}

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Verifying…" : "Enter console"}
              {!loading && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              )}
            </button>
          </div>

          <p className={`${MONO} mt-6 text-center text-[10px] uppercase tracking-[0.22em] text-zinc-400`}>
            Authorized personnel only · all access is logged
          </p>
        </form>
      </main>
    </div>
  );
}

const inputCls = [
  "w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400",
  "border-zinc-200 outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10",
].join(" ");