import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { listUsers, createUser, updateUser, resetUserPassword } from "@/lib/leadgen/admin.functions";
import { Card, PageHeader, btnGhost, btnPrimary, inputCls, labelCls } from "@/components/leadgen/LeadsShell";

export const Route = createFileRoute("/leads/admin/users")({
  head: () => ({
    meta: [
      { title: "Users — Jenvu Leads Admin" },
      { name: "description", content: "Create accounts, set roles and monthly credit limits." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminUsers,
});

function AdminUsers() {
  const qc = useQueryClient();
  const fetchUsers = useServerFn(listUsers);
  const addUser = useServerFn(createUser);
  const patchUser = useServerFn(updateUser);
  const resetPw = useServerFn(resetUserPassword);

  const { data: users, error } = useQuery({ queryKey: ["lg-users"], queryFn: () => fetchUsers(), retry: false });
  const [form, setForm] = useState({ email: "", fullName: "", password: "", role: "member" as "member" | "admin", limit: 150 });
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);

  if (error) return <Card className="p-6 text-[13px]">Not authorized.</Card>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await addUser({ data: form });
      setIssued({ email: res.email, password: res.password });
      setForm({ email: "", fullName: "", password: "", role: "member", limit: 150 });
      qc.invalidateQueries({ queryKey: ["lg-users"] });
      toast.success("Account created.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the account.");
    } finally {
      setBusy(false);
    }
  }

  async function patch(userId: string, patchData: Record<string, unknown>) {
    try {
      await patchUser({ data: { userId, ...patchData } as never });
      qc.invalidateQueries({ queryKey: ["lg-users"] });
      toast.success("Saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    }
  }

  return (
    <>
      <PageHeader title="Users" description="Invite-only: accounts are created here, never by self-signup." />

      <Card className="mb-5 p-6">
        <h2 className="text-[15px] font-medium">Create account</h2>
        <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div>
            <label className={labelCls} htmlFor="u-email">Email</label>
            <input id="u-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="u-name">Full name</label>
            <input id="u-name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="u-pw">Initial password</label>
            <input id="u-pw" value={form.password} placeholder="auto-generate" onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls} htmlFor="u-role">Role</label>
            <select id="u-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as "member" | "admin" })} className={inputCls}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="u-limit">Monthly credits</label>
            <input id="u-limit" type="number" min={0} step={10} value={form.limit} onChange={(e) => setForm({ ...form, limit: Number(e.target.value) })} className={inputCls} />
          </div>
          <div className="sm:col-span-2 xl:col-span-5">
            <button type="submit" disabled={busy} className={btnPrimary}>{busy ? "Creating…" : "Create account"}</button>
          </div>
        </form>

        {issued && (
          <div className="mt-4 rounded border border-[#CEEAD6] bg-[#E6F4EA] px-4 py-3 text-[12px] text-[#137333]">
            Account ready — copy this password now, it is shown only once.
            <div className="mt-1 font-mono text-[13px] text-[#0D652D]">{issued.email} · {issued.password}</div>
          </div>
        )}
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead className="border-b border-[#E8EAED] bg-[#F8F9FA] text-left text-[12px] text-[#5F6368]">
              <tr>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Used</th>
                <th className="px-4 py-2.5 font-medium">Monthly limit</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E8EAED]">
              {(users ?? []).map((u) => (
                <tr key={u.user_id} className="hover:bg-[#F8F9FA]">
                  <td className="px-4 py-2.5">{u.email}</td>
                  <td className="px-4 py-2.5 text-[#5F6368]">{u.full_name ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <select value={u.role} onChange={(e) => patch(u.user_id, { role: e.target.value })} className="rounded border border-[#DADCE0] px-2 py-1 text-[12px]">
                      <option value="member">member</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-2.5">{u.used.toFixed(2)}</td>
                  <td className="px-4 py-2.5">
                    <input
                      type="number"
                      defaultValue={u.monthly_credit_limit}
                      min={0}
                      step={10}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== u.monthly_credit_limit) patch(u.user_id, { limit: v });
                      }}
                      className="w-24 rounded border border-[#DADCE0] px-2 py-1 text-[12px]"
                    />
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={u.is_disabled ? "text-[#C5221F]" : "text-[#137333]"}>
                      {u.is_disabled ? "Disabled" : "Active"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-2">
                      <button className={`${btnGhost} !px-2 !py-1 !text-[12px]`} onClick={() => patch(u.user_id, { disabled: !u.is_disabled })}>
                        {u.is_disabled ? "Enable" : "Disable"}
                      </button>
                      <button
                        className={`${btnGhost} !px-2 !py-1 !text-[12px]`}
                        onClick={async () => {
                          try {
                            const r = await resetPw({ data: { userId: u.user_id } });
                            setIssued({ email: u.email, password: r.password });
                          } catch (e) {
                            toast.error(e instanceof Error ? e.message : "Failed.");
                          }
                        }}
                      >
                        Reset password
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {(users ?? []).length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-[#80868B]">No accounts yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
