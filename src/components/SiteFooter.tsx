import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const MONO = "font-mono";

function NewsletterSubscribe() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(target)) {
      toast.error("Please enter a valid email.");
      return;
    }
    setLoading(true);
    const { error } = await supabase
      .from("newsletter_subscribers")
      .insert({ email: target });
    setLoading(false);
    if (error && !/duplicate|unique/i.test(error.message)) {
      toast.error("Could not subscribe. Try again.");
      return;
    }
    setDone(true);
    setEmail("");
    toast.success("Subscribed — thank you!");
  };

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-xs flex-col gap-1.5 sm:flex-row sm:-translate-y-1">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        maxLength={255}
        className="flex-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-900 placeholder:text-zinc-500 outline-none"
      />
      <button
        type="submit"
        disabled={loading || done}
        className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-60"
      >
        {done ? "Subscribed" : loading ? "…" : "Subscribe"}
      </button>
    </form>
  );
}



const columns = [
  {
    label: "Platform",
    links: [
      { to: "/", label: "Home" },
      { to: "/app", label: "Voice Agent" },
      { to: "/signals-live", label: "Live Signals" },
      { to: "/broadcasts", label: "Broadcast" },
      { to: "/pricing", label: "Pricing" },
      { to: "/download", label: "Download App" },
    ],
  },
  {
    label: "Intelligence",
    links: [
      { to: "/insights", label: "Market Insights" },
      { to: "/killzones", label: "Killzone Times" },
      { to: "/insights", label: "Insights" },
      { to: "/ai-engine", label: "AI Engine" },
      { to: "/llm", label: "Language Model" },
      { to: "/development", label: "Development" },
    ],
  },
  {
    label: "Account",
    links: [
      { to: "/dashboard", label: "Dashboard" },
      { to: "/auth", label: "Sign In" },
      { to: "/help", label: "Help Center" },
      { to: "/leads", label: "Leads Tool" },
      { to: "/about", label: "About" },
      { to: "/contact", label: "Contact" },

    ],
  },
  {
    label: "Legal",
    links: [
      { to: "/terms", label: "Terms of Service" },
      { to: "/privacy", label: "Privacy Policy" },
      { to: "/refund", label: "Refund Policy" },
      { to: "/cancellation", label: "Cancellation" },
      { to: "/disclaimer", label: "Risk Disclaimer" },
      { to: "/scam-tool", label: "Scam Tool" },
    ],
  },


] as const;

export default function SiteFooter({ className }: { className?: string }) {
  const year = new Date().getFullYear();
  return (
    <footer className={`hide-in-pwa relative bg-[#FAFAFA] ${className || ""}`}>

      {/* Subtle divider */}
      <div className="h-px w-full bg-transparent" />


      {/* Main grid */}
      <div className="mx-auto max-w-6xl px-5 sm:px-6 py-8 sm:py-10">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-10">
          {/* Brand */}
          <div className="col-span-2 md:col-span-2 space-y-4">
            <Link to="/" className="flex items-center gap-2.5">
              <img
                src="/favicon.png"
                alt="Jenvu"
                className="h-7 w-7 rounded object-contain"
              />
              <span className="text-zinc-900 font-semibold tracking-tight text-lg">
                Jenvu AI
              </span>
            </Link>
            <p className="text-sm text-zinc-600 leading-relaxed max-w-sm whitespace-pre-line">
              Institutional grade voice intelligence for gold{"\n"}traders using ICT & SMC to make analysis.
            </p>

            <div className="flex items-center gap-2.5 pt-1">
              {[
                {
                  href: "https://x.com/jenvu",
                  label: "X (Twitter)",
                  icon: (
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                      <path d="M18.244 2H21l-6.52 7.45L22 22h-6.797l-4.77-6.24L4.8 22H2l7.03-8.03L2 2h6.914l4.31 5.71L18.244 2Zm-1.19 18h1.62L7.03 4h-1.7l11.724 16Z" />
                    </svg>
                  ),
                },
                {
                  href: "https://www.instagram.com/jenvucompany/",
                  label: "Instagram",
                  icon: (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                      <rect x="3" y="3" width="18" height="18" rx="5" />
                      <circle cx="12" cy="12" r="4" />
                      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                    </svg>
                  ),
                },
                {
                  href: "https://www.facebook.com/jenvucompany",
                  label: "Facebook",
                  icon: (
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                      <path d="M22 12a10 10 0 1 0-11.563 9.877v-6.988H7.898V12h2.539V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.889h-2.33v6.988A10.002 10.002 0 0 0 22 12Z" />
                    </svg>
                  ),
                },
                {
                  href: "https://whatsapp.com/channel/jenvuai",
                  label: "WhatsApp",
                  icon: (
                    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.296-.767.966-.94 1.164-.173.198-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.019-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.695.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347Zm-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.892 6.994c-.003 5.45-4.437 9.884-9.884 9.884Zm8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                    </svg>
                  ),
                },
              ].map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-900 transition-all hover:scale-110 hover:border-zinc-300 hover:shadow-sm"
                >
                  {s.icon}
                </a>
              ))}
            </div>
          </div>





          {/* Link columns */}
          {columns.map((col) => (
            <div key={col.label} className="space-y-3">
              <div
                className={`${MONO} text-sm font-black uppercase tracking-[0.25em] text-black`}
              >


              
                {col.label}
              </div>
              <ul className="space-y-2">
                {col.links.map((l) => (
                  <li key={l.to}>
                    <Link
                      to={l.to}
                      className="text-sm text-zinc-800 hover:text-black transition-colors whitespace-nowrap"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Divider + sub bar */}
        <div className="mt-8 pt-4 pb-4 border-t border-zinc-100 flex flex-col md:flex-row items-start justify-between gap-3 md:translate-y-2">
          <div
            className="whitespace-nowrap text-[12px] sm:text-[14px] tracking-tight"
            style={{ fontFamily: '"Urbanist", system-ui, sans-serif', fontWeight: 500, color: "#3c4043" }}
          >
            © {year} Jenvu AI. All rights reserved
          </div>




          <NewsletterSubscribe />


        </div>
      </div>
    </footer>
  );
}
