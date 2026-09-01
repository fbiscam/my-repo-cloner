import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "jenvu:cookie-consent";

type Choice = "accepted" | "rejected";

async function persist(choice: Choice) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ choice, ts: Date.now() }));
  } catch {}
  try {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      await supabase.from("cookie_consents").upsert({
        user_id: data.user.id,
        choice,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        updated_at: new Date().toISOString(),
      });
    }
  } catch {}
}

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) setVisible(true);
    } catch {
      setVisible(true);
    }
    const handler = () => setVisible(true);
    window.addEventListener("jenvu:open-cookie-preferences", handler);
    return () => window.removeEventListener("jenvu:open-cookie-preferences", handler);
  }, []);

  if (!visible) return null;

  const decide = async (choice: Choice) => {
    setVisible(false);
    await persist(choice);
  };

  return (
    <div
      role="dialog"
      aria-label="Cookie preferences"
      className="fixed bottom-4 left-1/2 z-[9999] w-[min(92vw,720px)] -translate-x-1/2 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg sm:p-5"
      style={{ fontFamily: "'Google Sans', 'Urbanist', system-ui, sans-serif" }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-[480px] text-[13px] leading-snug text-zinc-900 line-clamp-2">
          We use cookies to keep you signed in, understand how the desk is used, and to improve your overall trading experience.{" "}
          <a href="/privacy" className="underline underline-offset-2 font-medium hover:text-black">Read our privacy policy</a>.
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => decide("rejected")}
            className="rounded-md border border-zinc-200 bg-white px-3.5 py-2 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Reject all
          </button>
          <button
            onClick={() => decide("accepted")}
            className="rounded-md bg-zinc-900 px-3.5 py-2 text-[13px] font-medium text-white hover:bg-zinc-800"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
