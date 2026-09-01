import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Mail, MailOpen, Reply, Archive, Search, Inbox } from "lucide-react";
import {
  isAdmin,
  listContactMessages,
  updateContactMessageStatus,
  type ContactMessage,
} from "@/lib/admin-messages.functions";

export const Route = createFileRoute("/_authenticated/dashboard/admin/messages")({
  head: () => ({
    meta: [
      { title: "Contact Inbox — Jenvu Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminMessagesPage,
});

type Filter = "all" | "new" | "read" | "replied" | "archived";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "read", label: "Read" },
  { key: "replied", label: "Replied" },
  { key: "archived", label: "Archived" },
];

function AdminMessagesPage() {
  const checkAdmin = useServerFn(isAdmin);
  const fetchList = useServerFn(listContactMessages);
  const updateStatus = useServerFn(updateContactMessageStatus);

  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<ContactMessage | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { admin } = await checkAdmin();
      setAllowed(admin);
      if (admin) {
        const list = await fetchList();
        setMessages(list);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const counts = useMemo(() => ({
    all: messages.length,
    new: messages.filter((m) => m.status === "new").length,
    read: messages.filter((m) => m.status === "read").length,
    replied: messages.filter((m) => m.status === "replied").length,
    archived: messages.filter((m) => m.status === "archived").length,
  }), [messages]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return messages.filter((m) => {
      if (filter !== "all" && m.status !== filter) return false;
      if (!qq) return true;
      return (
        m.name.toLowerCase().includes(qq) ||
        m.email.toLowerCase().includes(qq) ||
        m.subject.toLowerCase().includes(qq) ||
        m.message.toLowerCase().includes(qq)
      );
    });
  }, [messages, filter, q]);

  const setStatus = async (id: string, status: "new" | "read" | "replied" | "archived") => {
    try {
      await updateStatus({ data: { id, status } });
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, status } : m)));
      if (selected?.id === id) setSelected({ ...selected, status });
      toast.success(`Marked as ${status}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  const openMessage = (m: ContactMessage) => {
    setSelected(m);
    if (m.status === "new") void setStatus(m.id, "read");
  };

  if (loading) {
    return <div className="px-6 py-16 text-center text-sm text-zinc-500">Loading…</div>;
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-md px-6 py-24 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
          <Inbox className="h-5 w-5 text-zinc-500" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-zinc-900">Admin access required</h1>
        <p className="mt-1 text-sm text-zinc-500">You don't have permission to view the contact inbox.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div>
        <h1 className="pl-1 text-2xl font-semibold text-zinc-900 tracking-tight">Contact Inbox</h1>
        <p className="mt-1 text-sm text-zinc-500">Messages submitted from your website contact form.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1">
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition ${
                  active
                    ? "border border-zinc-900 bg-white text-zinc-900"
                    : "border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                }`}
              >
                {f.label}
                <span className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums ${active ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600"}`}>
                  {counts[f.key]}
                </span>
              </button>
            );
          })}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, email, subject…"
            className="w-full rounded-lg border border-zinc-200 bg-white pl-8 pr-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
          />
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-6 py-16 text-center text-sm text-zinc-500">
            {messages.length === 0 ? "No messages yet." : "No messages match this filter."}
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {filtered.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => openMessage(m)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-zinc-50"
                >
                  <div className="mt-0.5">
                    {m.status === "new" ? (
                      <Mail className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <MailOpen className="h-4 w-4 text-zinc-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className={`truncate text-sm ${m.status === "new" ? "font-semibold text-zinc-900" : "text-zinc-800"}`}>
                        {m.name} <span className="font-normal text-zinc-500">&lt;{m.email}&gt;</span>
                      </div>
                      <div className="shrink-0 text-[11px] text-zinc-400">
                        {new Date(m.created_at).toLocaleDateString()} · {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                    <div className={`mt-0.5 truncate text-sm ${m.status === "new" ? "font-medium text-zinc-900" : "text-zinc-700"}`}>
                      {m.subject}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-zinc-500">{m.message}</div>
                  </div>
                  <StatusBadge status={m.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="relative w-full max-w-2xl rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-6 py-4">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                  {new Date(selected.created_at).toLocaleString()}
                </div>
                <h2 className="pl-1 mt-1 text-lg font-semibold text-zinc-900">{selected.subject}</h2>
                <div className="mt-1 text-sm text-zinc-600">
                  From <span className="font-medium text-zinc-900">{selected.name}</span>{" "}
                  <a href={`mailto:${selected.email}`} className="text-emerald-700 underline">
                    &lt;{selected.email}&gt;
                  </a>
                </div>
              </div>
              <StatusBadge status={selected.status} />
            </div>
            <div className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap px-6 py-5 text-sm leading-relaxed text-zinc-800">
              {selected.message}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 bg-zinc-50 px-6 py-3">
              <div className="flex flex-wrap gap-2">
                <a
                  href={`mailto:${selected.email}?subject=Re: ${encodeURIComponent(selected.subject)}`}
                  onClick={() => void setStatus(selected.id, "replied")}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800"
                >
                  <Reply className="h-3.5 w-3.5" /> Reply by email
                </a>
                <button
                  type="button"
                  onClick={() => void setStatus(selected.id, "archived")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  <Archive className="h-3.5 w-3.5" /> Archive
                </button>
                {selected.status !== "new" && (
                  <button
                    type="button"
                    onClick={() => void setStatus(selected.id, "new")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Mark unread
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-900"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "new"
      ? "bg-emerald-100 text-emerald-700"
      : status === "replied"
      ? "bg-sky-100 text-sky-700"
      : status === "archived"
      ? "bg-zinc-100 text-zinc-500"
      : "bg-amber-100 text-amber-700";
  return (
    <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${cls}`}>
      {status}
    </span>
  );
}
