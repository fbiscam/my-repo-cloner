import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Loader2, PenSquare } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type ChatMsg = {
  id: string;
  sender: "guest" | "admin";
  content: string;
  created_at: string;
};

const STORAGE_KEY = "jenvu_chat_token_v1";
const NAME_KEY = "jenvu_chat_name_v1";
const POLL_MS = 2500;

export function LiveChatWidget() {
  const [pathname, setPathname] = useState<string>("");
  useEffect(() => {
    if (typeof window !== "undefined") setPathname(window.location.pathname);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", update);
    const push = history.pushState;
    const replace = history.replaceState;
    history.pushState = function (...args) {
      const r = push.apply(this, args as any);
      update();
      return r;
    };
    history.replaceState = function (...args) {
      const r = replace.apply(this, args as any);
      update();
      return r;
    };
    return () => {
      window.removeEventListener("popstate", update);
      history.pushState = push;
      history.replaceState = replace;
    };
  }, []);
  const nativeAllowed = pathname === "/contact" || pathname.startsWith("/help");
  const [forceShow, setForceShow] = useState(false);
  const allowed = nativeAllowed || forceShow;

  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      setForceShow(true);
      setOpen(true);
    };
    window.addEventListener("jenvu:open-live-chat", handler as EventListener);
    return () => window.removeEventListener("jenvu:open-live-chat", handler as EventListener);
  }, []);
  const [token, setToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(false);
  const [status, setStatus] = useState<string>("open");
  const [unread, setUnread] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastCountRef = useRef(0);

  // Load token from storage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = localStorage.getItem(STORAGE_KEY);
    const n = localStorage.getItem(NAME_KEY);
    if (t) setToken(t);
    if (n) setName(n);
  }, []);

  const errorCountRef = useRef(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchMessages = useCallback(async (t: string) => {
    try {
      const { data, error } = await supabase.rpc("get_guest_messages", { _token: t });
      if (error) throw error;
      errorCountRef.current = 0;
      setLoadError(null);
      const rows = (data ?? []) as (ChatMsg & { session_status: string })[];
      setMessages(rows.map((r) => ({ id: r.id, sender: r.sender, content: r.content, created_at: r.created_at })));
      if (rows.length > 0) setStatus(rows[0].session_status);
      // Unread badge when closed
      if (!open) {
        const admins = rows.filter((r) => r.sender === "admin").length;
        if (admins > lastCountRef.current) setUnread((u) => u + (admins - lastCountRef.current));
        lastCountRef.current = admins;
      } else {
        lastCountRef.current = rows.filter((r) => r.sender === "admin").length;
        setUnread(0);
      }
    } catch (err: any) {
      console.error("chat fetch error", err);
      errorCountRef.current += 1;
      // Show inline banner after 3 consecutive failures; toast once
      if (errorCountRef.current === 3) {
        setLoadError("Can't reach chat right now. We'll keep trying…");
        toast.error("Chat connection lost", { description: "Retrying in the background." });
      }
      // If session token is invalid, clear it so user can start fresh
      if (typeof err?.message === "string" && /invalid session/i.test(err.message)) {
        localStorage.removeItem(STORAGE_KEY);
        setToken(null);
        setMessages([]);
        setLoadError(null);
        errorCountRef.current = 0;
      }
    }
  }, [open]);

  // Poll while token exists
  useEffect(() => {
    if (!token) return;
    fetchMessages(token);
    const id = setInterval(() => fetchMessages(token), POLL_MS);
    return () => clearInterval(id);
  }, [token, fetchMessages]);

  // Autoscroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, open]);

  // Focus input on open
  useEffect(() => {
    if (open && token) setTimeout(() => inputRef.current?.focus(), 50);
    if (open) setUnread(0);
  }, [open, token]);

  const startChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (starting) return;
    setStarting(true);
    try {
      const { data, error } = await supabase.rpc("create_chat_session", {
        _name: name || "",
        _email: email || "",
        _user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 500) : "",
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const newToken = row?.session_token as string;
      if (!newToken) throw new Error("no token returned");
      localStorage.setItem(STORAGE_KEY, newToken);
      if (name) localStorage.setItem(NAME_KEY, name);
      setToken(newToken);
    } catch (err) {
      console.error("start chat error", err);
      toast.error("Couldn't start chat", { description: "Please check your connection and try again." });
    } finally {
      setStarting(false);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = input.trim();
    if (!content || !token || sending) return;
    setSending(true);
    // Optimistic
    const tempId = `tmp-${Date.now()}`;
    setMessages((m) => [...m, { id: tempId, sender: "guest", content, created_at: new Date().toISOString() }]);
    setInput("");
    try {
      const { error } = await supabase.rpc("post_guest_message", { _token: token, _content: content });
      if (error) throw error;
      await fetchMessages(token);
    } catch (err) {
      console.error("send error", err);
      setMessages((m) => m.filter((x) => x.id !== tempId));
      setInput(content);
      toast.error("Message failed to send", { description: "Please try again." });
    } finally {
      setSending(false);
    }
  };

  const resetChat = () => {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setMessages([]);
    setStatus("open");
    lastCountRef.current = 0;
  };

  if (!allowed) return null;
  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => {
          if (open) {
            setOpen(false);
            if (!nativeAllowed) setForceShow(false);
          } else {
            setOpen(true);
          }
        }}
        aria-label={open ? "Close chat" : "Open support chat"}
        className="fixed bottom-5 right-5 z-[9999] flex h-14 w-14 items-center justify-center rounded-full bg-white text-black shadow-[0_10px_30px_-8px_rgba(0,0,0,0.25)] ring-1 ring-black/10 transition hover:scale-[1.03] hover:shadow-[0_14px_38px_-10px_rgba(0,0,0,0.35)] active:scale-95"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-[22px] w-[22px]" />}
        {!open && (
          <span className="absolute bottom-1 right-1 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />

        )}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white shadow">
            {unread}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-24 right-5 z-[9999] flex h-[560px] w-[calc(100vw-2.5rem)] max-w-sm flex-col overflow-hidden rounded-3xl border border-black/5 bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.35)] sm:right-5">
          {/* Header */}
          <div className="relative flex items-center justify-between border-b border-black/5 bg-white px-4 py-4 text-black">
            <div className="flex items-center gap-3">
              <div className="relative grid h-10 w-10 place-items-center rounded-full bg-zinc-100 ring-1 ring-black/5">
                <img src="/favicon.png" alt="Jenvu" className="h-7 w-7 rounded-md object-contain" />
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white" />
              </div>
              <div>
                <div className="text-[15px] font-semibold leading-tight">Jenvu Support</div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-600">
                  
                  {token ? (status === "closed" ? "Chat closed" : "Online · replies in minutes") : "We're online now"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {token && (
                <button
                  onClick={() => {
                    
                    localStorage.removeItem(STORAGE_KEY);
                    setToken(null);
                    setMessages([]);
                    setInput("");
                    setStatus("open");
                    setUnread(0);
                    lastCountRef.current = 0;
                  }}
                  aria-label="New chat"
                  title="New chat"
                  className="rounded-full p-1.5 text-zinc-600 transition hover:bg-zinc-100 hover:text-black"
                >
                  <PenSquare className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => {
                  setOpen(false);
                  if (!nativeAllowed) setForceShow(false);
                }}
                aria-label="Close"
                className="rounded-full p-1.5 text-zinc-600 transition hover:bg-zinc-100 hover:text-black"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

          </div>


          {/* Body */}
          {!token ? (
            <form onSubmit={startChat} className="flex flex-1 flex-col gap-3 bg-[#fafaf7] p-5">
              <div className="rounded-2xl bg-white p-4 text-sm text-zinc-800 shadow-sm ring-1 ring-black/5">
                <div className="mb-1 text-[13px] font-semibold text-black">Hi there 👋</div>
                Ask us anything — no signup needed. A real human will reply here.
              </div>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name (optional)"
                maxLength={80}
                className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-black focus:ring-2 focus:ring-black/5"
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email (optional, for follow-up)"
                maxLength={200}
                className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-black focus:ring-2 focus:ring-black/5"
              />
              <button
                type="submit"
                disabled={starting}
                className="mt-auto rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-60"
              >
                {starting ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Start chat"}
              </button>
              <p className="text-center text-[10.5px] text-zinc-500">
                We'll only use your email to reply to this conversation.
              </p>
            </form>
          ) : (
            <>
              <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-[#fafaf7] px-3 py-4">
                {loadError && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                    {loadError}
                  </div>
                )}
                {messages.length === 0 && (
                  <div className="mt-10 px-4 text-center text-xs text-zinc-500">
                    Send us your first message — we'll get back to you here.
                  </div>
                )}
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex ${m.sender === "guest" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed shadow-[0_1px_1px_rgba(0,0,0,0.06)] ${
                        m.sender === "guest"
                          ? "bg-[#d9fdd3] text-zinc-900 rounded-br-md"
                          : "bg-white text-zinc-900 ring-1 ring-black/5 rounded-bl-md"
                      }`}
                    >
                      {m.content}
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={sendMessage} className="border-t border-black/5 bg-white p-2.5">
                {status === "closed" ? (
                  <div className="flex items-center justify-between px-2 py-1 text-xs text-zinc-500">
                    <span>This chat is closed.</span>
                    <button type="button" onClick={resetChat} className="font-medium text-black underline">
                      Start a new one
                    </button>
                  </div>
                ) : (
                  <div className="flex items-end gap-2">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage(e as unknown as React.FormEvent);
                        }
                      }}
                      placeholder="Type a message…"
                      rows={1}
                      maxLength={4000}
                      className="max-h-32 flex-1 resize-none rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm text-zinc-900 outline-none transition focus:border-black focus:ring-2 focus:ring-black/5"
                    />
                    <button
                      type="submit"
                      disabled={sending || !input.trim()}
                      aria-label="Send"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-black text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-50"
                    >
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                  </div>
                )}
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
}

