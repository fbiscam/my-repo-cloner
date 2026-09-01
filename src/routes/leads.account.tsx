import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getMe } from "@/lib/leadgen/core.functions";
import { changeOwnPassword } from "@/lib/leadgen/admin.functions";
import { Card, PageHeader, btnGhost, btnPrimary, inputCls, labelCls } from "@/components/leadgen/LeadsShell";

export const Route = createFileRoute("/leads/account")({
  head: () => ({
    meta: [
      { title: "Account — Jenvu Leads" },
      { name: "description", content: "Manage your Jenvu Leads password and session." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: Account,
});

function Account() {
  const router = useRouter();
  const fetchMe = useServerFn(getMe);
  const setPassword = useServerFn(changeOwnPassword);
  const { data: me } = useQuery({ queryKey: ["lg-me"], queryFn: () => fetchMe() });
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== pw2) return toast.error("Passwords do not match.");
    setBusy(true);
    try {
      await setPassword({ data: { password: pw } });
      setPw("");
      setPw2("");
      toast.success("Password updated.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Account" description="Your profile, password and session." />

      <div className="grid max-w-3xl gap-4">
        <Card className="p-6">
          <h2 className="text-[15px] font-medium">Profile</h2>
          <dl className="mt-4 grid gap-3 text-[13px] sm:grid-cols-2">
            <div>
              <dt className="text-[12px] text-[#5F6368]">Email</dt>
              <dd className="mt-0.5">{me?.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-[#5F6368]">Role</dt>
              <dd className="mt-0.5">{me?.is_admin ? "Admin" : "Member"}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-[#5F6368]">Monthly credit limit</dt>
              <dd className="mt-0.5">{(me?.credits.monthly_limit ?? 0).toFixed(2)}</dd>
            </div>
            <div>
              <dt className="text-[12px] text-[#5F6368]">Remaining this month</dt>
              <dd className="mt-0.5">{(me?.credits.remaining ?? 0).toFixed(2)}</dd>
            </div>
          </dl>
        </Card>

        <Card className="p-6">
          <h2 className="text-[15px] font-medium">Change password</h2>
          <form onSubmit={save} className="mt-4 grid max-w-sm gap-3">
            <div>
              <label htmlFor="np" className={labelCls}>
                New password
              </label>
              <input
                id="np"
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                className={inputCls}
                minLength={10}
                required
              />
            </div>
            <div>
              <label htmlFor="np2" className={labelCls}>
                Confirm password
              </label>
              <input
                id="np2"
                type="password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
                className={inputCls}
                minLength={10}
                required
              />
            </div>
            <button type="submit" disabled={busy} className={`${btnPrimary} w-fit`}>
              {busy ? "Saving…" : "Update password"}
            </button>
          </form>
        </Card>

        <Card className="p-6">
          <h2 className="text-[15px] font-medium">Session</h2>
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              router.navigate({ to: "/leads-signin", replace: true });
            }}
            className={`${btnGhost} mt-4`}
          >
            Sign out
          </button>
        </Card>
      </div>
    </>
  );
}
