import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { confirmEmailChange } from "@/lib/email-change.functions";

const searchSchema = z.object({
  token: z.string().optional(),
});

export const Route = createFileRoute("/confirm-email-change")({
  validateSearch: (search) => searchSchema.parse(search),
  component: ConfirmEmailChangePage,
  head: () => ({
    meta: [
      { title: "Confirm email change · Jenvu" },
      { name: "description", content: "Confirm your Jenvu email change." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type Status = "loading" | "success" | "error";
type ErrorKind = "expired" | "used" | "invalid" | "missing" | "generic";

function classifyError(msg: string): ErrorKind {
  const m = msg.toLowerCase();
  if (m.includes("expired")) return "expired";
  if (m.includes("already been used") || m.includes("already used")) return "used";
  if (m.includes("invalid") || m.includes("missing")) return "invalid";
  return "generic";
}

const FRIENDLY: Record<ErrorKind, { title: string; body: string }> = {
  expired: {
    title: "This link has expired",
    body: "Confirmation links are valid for 60 minutes. Head back to your dashboard and start the email change again to get a fresh link.",
  },
  used: {
    title: "This link was already used",
    body: "Looks like this confirmation link has already been clicked. If your email is still wrong, start a new email change from your dashboard.",
  },
  invalid: {
    title: "This link isn't valid",
    body: "The confirmation link is malformed or no longer recognised. Please start the email change again from your dashboard.",
  },
  missing: {
    title: "Missing confirmation token",
    body: "This page needs a confirmation token from the email we sent. Open the link from that email, or restart the email change from your dashboard.",
  },
  generic: {
    title: "Confirmation failed",
    body: "We couldn't confirm your email change. Please try starting it again from your dashboard.",
  },
};

const STORAGE_PREFIX = "jenvu:email-change-done:";

async function hashToken(token: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function readCompleted(hash: string): { newEmail: string; at: number } | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + hash) ?? localStorage.getItem(STORAGE_PREFIX + hash);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.newEmail !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCompleted(hash: string, newEmail: string) {
  const payload = JSON.stringify({ newEmail, at: Date.now() });
  try { sessionStorage.setItem(STORAGE_PREFIX + hash, payload); } catch {}
  try { localStorage.setItem(STORAGE_PREFIX + hash, payload); } catch {}
}

function ConfirmEmailChangePage() {
  const { token } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("Verifying your email change…");
  const [errorKind, setErrorKind] = useState<ErrorKind>("generic");
  const [newEmail, setNewEmail] = useState<string | null>(null);
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const ran = useRef(false);

  // Ordered teardown: cancel in-flight queries, clear cache, sign out, then
  // navigate with replace so Back can't restore an authenticated shell.
  const goToSignIn = async () => {
    try { await queryClient.cancelQueries(); } catch {}
    queryClient.clear();
    try { await supabase.auth.signOut(); } catch {}
    navigate({
      to: "/auth",
      replace: true,
      search: newEmail ? { emailChanged: "1", newEmail } : { emailChanged: "1" },
    });
  };


  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      if (!token) {
        setStatus("error");
        setErrorKind("missing");
        setMessage("Missing confirmation token.");
        return;
      }

      // Client-side guard: if we've already completed this token in this
      // browser, skip the server call entirely and show the completed view.
      const hash = await hashToken(token);
      const cached = readCompleted(hash);
      if (cached) {
        setNewEmail(cached.newEmail);
        setAlreadyDone(true);
        setStatus("success");
        setMessage("This email change has already been completed.");
        try { await supabase.auth.signOut(); } catch {}
        return;
      }

      try {
        const res = await confirmEmailChange({ data: { token } });
        if (!res.ok) {
          const err = res.error || "Could not confirm email change.";
          setStatus("error");
          setErrorKind(classifyError(err));
          setMessage(err);
          return;
        }
        setNewEmail(res.newEmail);
        writeCompleted(hash, res.newEmail);
        setStatus("success");
        setMessage("Your email has been updated. Signing you out…");
        // Teardown immediately on success so any protected queries stop.
        try { await queryClient.cancelQueries(); } catch {}
        queryClient.clear();
        try { await supabase.auth.signOut(); } catch {}
      } catch (e: any) {
        const err = e?.message || "Could not confirm email change.";
        setStatus("error");
        setErrorKind(classifyError(err));
        setMessage(err);
      }
    })();
  }, [token, queryClient]);

  useEffect(() => {
    if (status !== "success" || alreadyDone) return;
    if (countdown <= 0) {
      navigate({
        to: "/auth",
        replace: true,
        search: newEmail ? { emailChanged: "1", newEmail } : { emailChanged: "1" },
      });
      return;
    }

    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [status, alreadyDone, countdown, navigate]);

  return (
    <div className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <div className="w-full rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Email change
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-900">
          {status === "loading" && "Verifying…"}
          {status === "success" && (alreadyDone ? "Already completed" : "Email updated")}
          {status === "error" && FRIENDLY[errorKind].title}
        </h1>

        <div className="mt-6 space-y-4">
          {status === "loading" && (
            <div className="flex items-center gap-3 text-sm text-zinc-600">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900" />
              <span>{message}</span>
            </div>
          )}

          {status === "success" && (
            <>
              <p className="text-sm text-zinc-600">
                {alreadyDone
                  ? <>This confirmation link was already used. Your account email is <span className="font-medium text-zinc-900">{newEmail}</span>.</>
                  : <>Your account email is now <span className="font-medium text-zinc-900">{newEmail}</span>.</>}
              </p>
              {!alreadyDone && (
                <p className="text-sm text-zinc-600">
                  Redirecting to sign in in <span className="font-semibold">{countdown}</span>…
                </p>
              )}
              <button
                onClick={goToSignIn}
                className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800"
              >
                Go to sign in
              </button>
            </>
          )}

          {status === "error" && (
            <>
              <p className="text-sm text-zinc-700">{FRIENDLY[errorKind].body}</p>
              <details className="text-xs text-zinc-500">
                <summary className="cursor-pointer">Technical details</summary>
                <p className="mt-1 break-words">{message}</p>
              </details>
              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  onClick={() => navigate({ to: "/dashboard/profile", hash: "change-email" })}
                  className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                >
                  Restart email change
                </button>
                <button
                  onClick={goToSignIn}
                  className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium hover:bg-zinc-50"
                >
                  Back to sign in
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
