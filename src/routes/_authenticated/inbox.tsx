import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Inbox as InboxIcon,
  Mail,
  MailOpen,
  Reply,
  Archive,
  Search,
  Send,
  FileText,
  Trash2,
  Star,
  RefreshCcw,
  ArrowLeft,
} from "lucide-react";
import {
  isAdmin,
  listContactMessages,
  updateContactMessageStatus,
  type ContactMessage,
} from "@/lib/admin-messages.functions";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({
    meta: [
      { title: "Inbox" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: InboxPage,
});

type Folder = "inbox" | "unread" | "replied" | "archived" | "sent" | "drafts" | "trash";

const FOLDERS: { key: Folder; label: string; icon: typeof InboxIcon }[] = [
  { key: "inbox", label: "Inbox", icon: InboxIcon },
  { key: "unread", label: "Unread", icon: Mail },
  { key: "replied", label: "Replied", icon: Reply },
  { key: "archived", label: "Archived", icon: Archive },
  { key: "sent", label: "Sent", icon: Send },
  { key: "drafts", label: "Drafts", icon: FileText },
  { key: "trash", label: "Trash", icon: Trash2 },
];

function InboxPage() {
  const checkAdmin = useServerFn(isAdmin);
  const fetchList = useServerFn(listContactMessages);
  const updateStatus = useServerFn(updateContactMessageStatus);

  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [folder, setFolder] = useState<Folder>("inbox");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
    inbox: messages.filter((m) => m.status !== "archived").length,
    unread: messages.filter((m) => m.status === "new").length,
    replied: messages.filter((m) => m.status === "replied").length,
    archived: messages.filter((m) => m.status === "archived").length,
    sent: 0,
    drafts: 0,
    trash: 0,
  }), [messages]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return messages.filter((m) => {
      if (folder === "inbox" && m.status === "archived") return false;
      if (folder === "unread" && m.status !== "new") return false;
      if (folder === "replied" && m.status !== "replied") return false;
      if (folder === "archived" && m.status !== "archived") return false;
      if (folder === "sent" || folder === "drafts" || folder === "trash") return false;
      if (!qq) return true;
      return (
        m.name.toLowerCase().includes(qq) ||
        m.email.toLowerCase().includes(qq) ||
        m.subject.toLowerCase().includes(qq) ||
        m.message.toLowerCase().includes(qq)
      );
    });
  }, [messages, folder, q]);

  const selected = useMemo(() => messages.find((m) => m.id === selectedId) ?? null, [messages, selectedId]);

  const setStatus = async (id: string, status: "new" | "read" | "replied" | "archived") => {
    try {
      await updateStatus({ data: { id, status } });
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, status } : m)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    }
  };

  const openMessage = (m: ContactMessage) => {
    setSelectedId(m.id);
    if (m.status === "new") void setStatus(m.id, "read");
  };

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-sm text-zinc-500">Loading inbox…</div>;
  }

  if (!allowed) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="max-w-md text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
            <InboxIcon className="h-5 w-5 text-zinc-500" />
          </div>
          <h1 className="mt-4 text-lg font-semibold text-zinc-900">Access required</h1>
          <p className="mt-1 text-sm text-zinc-500">You don't have permission to view this inbox.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full flex-col bg-zinc-50 text-zinc-900">
      {/* Top bar */}
      <header className="flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-2">
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900">
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </Link>
        <div className="text-sm font-semibold text-zinc-900">Contact Inbox</div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search mail"
              className="w-full rounded-md border border-zinc-200 bg-white pl-8 pr-3 py-1.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-sky-500/30"
            />
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            title="Refresh"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* 3-pane layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Folder sidebar */}
        <aside className="hidden w-56 shrink-0 flex-col border-r border-zinc-200 bg-white sm:flex">
          <div className="p-3">
            <button
              type="button"
              disabled
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-sky-600 px-3 py-2 text-xs font-semibold text-white opacity-60"
              title="Reply-only inbox"
            >
              <Mail className="h-3.5 w-3.5" /> New message
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-2 pb-3">
            {FOLDERS.map((f) => {
              const active = folder === f.key;
              const Icon = f.icon;
              const c = counts[f.key];
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => { setFolder(f.key); setSelectedId(null); }}
                  className={`mb-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition ${
                    active
                      ? "bg-sky-50 font-semibold text-sky-900"
                      : "text-zinc-700 hover:bg-zinc-100"
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${active ? "text-sky-700" : "text-zinc-500"}`} />
                  <span className="flex-1 truncate">{f.label}</span>
                  {c > 0 && (
                    <span className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums ${active ? "bg-sky-600 text-white" : "bg-zinc-200 text-zinc-700"}`}>
                      {c}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Message list */}
        <section className="flex w-full max-w-md flex-col border-r border-zinc-200 bg-white sm:w-96">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-2">
            <div className="text-sm font-semibold text-zinc-900 capitalize">{folder}</div>
            <div className="text-[11px] text-zinc-500">{filtered.length} items</div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-6 py-16 text-center text-sm text-zinc-500">
                Nothing here.
              </div>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {filtered.map((m) => {
                  const active = selectedId === m.id;
                  const unread = m.status === "new";
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => openMessage(m)}
                        className={`flex w-full items-start gap-2 px-4 py-3 text-left transition ${
                          active ? "bg-sky-50" : "hover:bg-zinc-50"
                        }`}
                      >
                        <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${unread ? "bg-sky-500" : "bg-transparent"}`} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className={`truncate text-[13px] ${unread ? "font-semibold text-zinc-900" : "text-zinc-800"}`}>
                              {m.name}
                            </div>
                            <div className="shrink-0 text-[10px] text-zinc-400">
                              {formatWhen(m.created_at)}
                            </div>
                          </div>
                          <div className={`mt-0.5 truncate text-[13px] ${unread ? "font-medium text-zinc-900" : "text-zinc-700"}`}>
                            {m.subject}
                          </div>
                          <div className="mt-0.5 truncate text-[12px] text-zinc-500">{m.message}</div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Reading pane */}
        <section className="flex flex-1 flex-col bg-white">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-center">
              <div>
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100">
                  <InboxIcon className="h-6 w-6 text-zinc-400" />
                </div>
                <p className="mt-3 text-sm text-zinc-500">Select a message to read.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-6 py-4">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-zinc-900">{selected.subject}</h2>
                  <div className="mt-2 flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[13px] font-semibold text-sky-700">
                      {selected.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-zinc-900">{selected.name}</div>
                      <a href={`mailto:${selected.email}`} className="truncate text-xs text-sky-700 hover:underline">
                        &lt;{selected.email}&gt;
                      </a>
                    </div>
                    <div className="ml-auto text-[11px] text-zinc-500">
                      {new Date(selected.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1 border-b border-zinc-100 px-4 py-2">
                <a
                  href={`mailto:${selected.email}?subject=Re: ${encodeURIComponent(selected.subject)}`}
                  onClick={() => void setStatus(selected.id, "replied")}
                  className="inline-flex items-center gap-1.5 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700"
                >
                  <Reply className="h-3.5 w-3.5" /> Reply
                </a>
                <button
                  type="button"
                  onClick={() => void setStatus(selected.id, "archived")}
                  className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  <Archive className="h-3.5 w-3.5" /> Archive
                </button>
                {selected.status !== "new" ? (
                  <button
                    type="button"
                    onClick={() => void setStatus(selected.id, "new")}
                    className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    <Mail className="h-3.5 w-3.5" /> Mark unread
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void setStatus(selected.id, "read")}
                    className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    <MailOpen className="h-3.5 w-3.5" /> Mark read
                  </button>
                )}
                <button
                  type="button"
                  disabled
                  className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-xs font-medium text-zinc-400"
                  title="Not available"
                >
                  <Star className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto whitespace-pre-wrap px-6 py-6 text-[14px] leading-relaxed text-zinc-800">
                {selected.message}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
