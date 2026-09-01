import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import SiteFooter from "@/components/SiteFooter";
import HeaderAuthButtons from "@/components/HeaderAuthButtons";

const MONO = "font-['JetBrains_Mono',ui-monospace,monospace]";
const SANS = "font-['Google_Sans','Product_Sans','Poppins',system-ui,sans-serif]";


export function PageShell({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  intro?: string;
  children: ReactNode;
}) {
  return (
    <>
      <div className={`jenvu-zoom min-h-dvh w-full bg-[#FAFAFA] text-zinc-900 ${SANS} antialiased selection:bg-zinc-900 selection:text-white`}>
        {/* NAV — matches homepage */}
        <header className="hide-in-pwa sticky top-0 z-50 border-b border-zinc-100 bg-white/85 backdrop-blur-md">
          <div className="relative mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 sm:px-6 sm:py-4 md:flex md:justify-between">
            <Link to="/" className="flex min-w-0 items-center gap-2.5">
              <img src="/favicon.png" alt="Jenvu Logo" className="h-7 w-7 shrink-0 rounded-md object-contain" />
              <span className="truncate text-[22px] tracking-tight leading-none" style={{ color: "#3c4043", fontFamily: "\"Google Sans\", \"Product Sans\", \"DM Sans\", system-ui, sans-serif", fontWeight: 500 }}>Jenvu</span>
            </Link>
            <nav className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-7 text-sm text-zinc-900">
            <Link to="/signal" className="hover:text-zinc-900">Signal Engine</Link>
            <Link to="/signals-live" className="hover:text-zinc-900">Signals Live</Link>
            <Link to="/pricing" className="hover:text-zinc-900">Pricing</Link>
            <Link to="/founder" className="hover:text-zinc-900">Founder</Link>
            <Link to="/contact" className="hover:text-zinc-900">Contact</Link>

            </nav>
            <HeaderAuthButtons />

          </div>
        </header>

        {/* HERO */}
        <section className="border-b border-zinc-100">
          <div className="mx-auto max-w-6xl px-5 sm:px-6 py-14 sm:py-20">
            <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl whitespace-pre-line">
              {title}
            </h1>
            {intro && (
              <p className="mt-5 max-w-2xl text-base text-zinc-600 leading-relaxed sm:text-lg">
                {intro}
              </p>
            )}
          </div>
        </section>

        {/* BODY */}
        <main className="mx-auto max-w-6xl px-5 sm:px-6 py-14 sm:py-20">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-10 md:p-14 space-y-10 leading-relaxed shadow-[0_24px_60px_-24px_rgba(0,0,0,0.08)]">
            {children}
          </div>
          <p className={`mt-8 text-center ${MONO} text-[10px] uppercase tracking-[0.22em] text-zinc-500`}>
            Last updated · {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </p>
        </main>

        <div className="hide-in-pwa"><SiteFooter /></div>
      </div>
    </>
  );
}

export function H2({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-900 pt-2 border-t border-zinc-100 first:border-t-0 first:pt-0">
      {children}
    </h2>
  );
}

export function P({ children }: { children: ReactNode }) {
  return <p className="text-zinc-700 leading-relaxed">{children}</p>;
}

export function UL({ children }: { children: ReactNode }) {
  return (
    <ul className="space-y-2 text-zinc-700 list-disc pl-5 marker:text-zinc-400">
      {children}
    </ul>
  );
}
