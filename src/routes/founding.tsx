import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Users, DollarSign, Shield, Sparkles, ArrowRight } from "lucide-react";
import SiteFooter from "@/components/SiteFooter";
import HeaderAuthButtons from "@/components/HeaderAuthButtons";
import { submitFoundingApplication, foundingStats } from "@/lib/founding.functions";

export const Route = createFileRoute("/founding")({
  head: () => ({
    meta: [
      { title: "Founding Trader Program — Jenvu" },
      {
        name: "description",
        content:
          "50 traders per month get free Elite access. Pay only after your first $100 profit. Institutional-grade XAU intelligence, aligned incentives.",
      },
      { property: "og:title", content: "Founding Trader Program" },
      {
        property: "og:description",
        content: "Free Elite plan for 30 days. Pay only after you profit $100.",
      },
      { property: "og:url", content: "https://jenvu.com/founding" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://jenvu.com/founding" }],
  }),
  component: FoundingPage,
});

function FoundingPage() {
  const submit = useServerFn(submitFoundingApplication);
  const stats = useServerFn(foundingStats);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [seats, setSeats] = React.useState<{ filled: number; total: number }>({ filled: 0, total: 50 });

  React.useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      stats()
        .then((s) => { if (!cancelled) setSeats({ filled: s.seatsFilled, total: s.seatsTotal }); })
        .catch(() => {});
    };
    refresh();
    const interval = window.setInterval(refresh, 10000);
    const onFocus = () => refresh();
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const remaining = Math.max(0, seats.total - seats.filled);
  const pct = Math.min(100, Math.round((seats.filled / seats.total) * 100));

  const [plan, setPlan] = React.useState<"pro" | "elite" | "ultra">("elite");
  const [refEmail, setRefEmail] = React.useState<string>("");

  React.useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const r = p.get("ref") || p.get("referrer") || "";
      if (r) setRefEmail(r);
    } catch {}
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setSubmitting(true);
    try {
      const res = await submit({
        data: {
          full_name: String(fd.get("full_name") || ""),
          email: String(fd.get("email") || ""),
          whatsapp_number: String(fd.get("whatsapp_number") || ""),
          country: String(fd.get("country") || ""),
          broker: String(fd.get("broker") || ""),
          experience_years: fd.get("experience_years") ? Number(fd.get("experience_years")) : undefined,
          monthly_volume_usd: fd.get("monthly_volume_usd") ? Number(fd.get("monthly_volume_usd")) : undefined,
          referrer_email: String(fd.get("referrer_email") || ""),
          why_joining: String(fd.get("why_joining") || ""),
          myfxbook_url: String(fd.get("myfxbook_url") || ""),
          requested_plan: plan,
        } as any,
      });
      if (res.ok) {
        setSubmitted(true);
        toast.success("Application received. We'll be in touch.");
      } else {
        toast.error(res.error);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900 founding-zoom" style={{ fontFamily: "'Google Sans', 'Urbanist', system-ui, sans-serif" }}>
      <header className="sticky top-0 z-30 border-b border-zinc-100 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <Link to="/" className="inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight">
            <img src="/favicon.png" alt="Jenvu" className="h-7 w-7 shrink-0 rounded-md object-contain" />
            Jenvu
          </Link>
          <HeaderAuthButtons signInOnly />
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-5 pt-10 pb-8 text-center sm:pt-14 sm:pb-10">
        <h1 className="mt-2 text-[28px] leading-tight font-semibold tracking-tight sm:mt-5 sm:text-5xl">
          Founding Trader Program
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-[14px] leading-relaxed text-zinc-600 sm:text-[15px]">
          Get <span className="font-semibold text-zinc-900">Elite free for 30 days</span> — pay only after your <span className="font-semibold text-zinc-900">first $100 in verified profit</span>. No profit, no payment. Built for traders who want institutional grade signals without upfront risk commitment.
        </p>



        <div className="mx-auto mt-8 max-w-md rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center justify-between text-xs text-zinc-500">
            <span>Seats claimed this month</span>
            <span className="font-medium text-zinc-900">{seats.filled} / {seats.total}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100">
            <div
              className="relative h-full rounded-full transition-all duration-700 ease-out overflow-hidden bg-gradient-to-r from-[#60a5fa] via-[#2563eb] to-[#1d4ed8] bg-[length:200%_100%] animate-[flow_2.4s_linear_infinite] shadow-[0_0_10px_rgba(37,99,235,0.55)]"
              style={{ width: `${pct}%` }}
            >
              <div className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent animate-[shimmer_1.8s_linear_infinite]" />
            </div>
          </div>
          <div className="mt-2 text-[11px] text-zinc-500">{remaining} spots remaining</div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-14">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { icon: Users, title: "Curated cohort", body: "Only 50 traders each month. Serious applicants, real capital, no tire-kickers." },
            { icon: DollarSign, title: "Pay after profit", body: "First month Elite is free. Billing activates only after $100 verified profit." },
            { icon: Shield, title: "Aligned incentives", body: "We win when you win. Our job is to make you stable, not to milk subscriptions." },
          ].map((b) => (
            <div key={b.title} className="rounded-2xl border border-zinc-200 bg-white p-5">
              <b.icon className="h-5 w-5 text-zinc-700" />
              <div className="mt-3 text-sm font-semibold">{b.title}</div>
              <div className="mt-1.5 text-[13px] leading-relaxed text-zinc-600">{b.body}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 pb-10 sm:pb-14">
        <div className="rounded-3xl border border-zinc-200 bg-white p-5 sm:p-7">

          <h2 className="text-xl font-semibold">How it works</h2>
          <ol className="mt-5 space-y-4 text-[14px]">
            {[
              ["Apply", "Fill the short form below. We review every application manually."],
              ["Get approved", "If accepted, we activate your Elite plan free for 30 days — full access to signals, alerts, killzones and voice analysis."],
              ["Reach $100 in 30 days", "You have 30 days to hit $100 in verified profit. After that, billing activates on your account and you pay per scan."],
              ["Verify & pay to continue scanning", "Once 30 days end, a 'Submit documents' notification appears on your account. Click it, upload your broker statement / MyFxBook, and we verify. After verification, billing goes live — pay, and credits are added to your account so you can keep scanning."],

            ].map(([t, d], i, arr) => (
              <li key={t} className="flex gap-4">
                <div className="flex flex-col items-center shrink-0">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold bg-[#2563eb] text-white">{i + 1}</div>
                  {i < arr.length - 1 && (
                    <div className="mt-1 w-px flex-1 bg-[#2563eb]/30" />
                  )}
                </div>
                <div className="pb-2">
                  <div className="font-semibold text-zinc-900">{t}</div>
                  <div className="mt-0.5 text-[13px] text-zinc-600">{d}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="apply" className="mx-auto max-w-2xl px-5 pb-16 sm:pb-24">
        <div className="rounded-3xl border border-zinc-200 bg-white p-5 sm:p-7">

          <h2 className="text-xl font-semibold">Apply for a founding seat</h2>
          <p className="mt-1.5 text-[13px] text-zinc-500">
            Applications reviewed within 48 hours. Only serious traders — please be honest.
          </p>




          {submitted ? (
            <>
              <div
                className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm px-5 animate-in fade-in duration-200"
                role="dialog"
                aria-modal="true"
              >
                <div className="relative w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-2xl animate-in zoom-in-95 duration-300">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
                    <Check className="h-7 w-7 text-emerald-600" />
                  </div>
                  <h3 className="mt-5 text-2xl font-semibold tracking-tight text-zinc-900">
                    Application received
                  </h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-zinc-600">
                    Thank you — we've got your application. Our team will personally review it and email you a decision within <strong className="text-zinc-900">48 hours</strong>.
                  </p>
                  <p className="mt-2 text-[13px] text-zinc-500">
                    Please keep an eye on your inbox (and spam folder).
                  </p>
                  <Link
                    to="/"
                    className="mt-6 inline-flex items-center justify-center rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
                  >
                    Back to home
                  </Link>
                </div>
              </div>
              <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
                <Check className="mx-auto h-8 w-8 text-emerald-600" />
                <div className="mt-3 text-base font-semibold text-emerald-900">Application received</div>
                <p className="mt-1 text-sm text-emerald-800">
                  We'll email you within 48 hours.
                </p>
              </div>
            </>
          ) : (
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <Field name="full_name" label="Full name" required placeholder="Your full name" />
              <Field name="email" label="Email" type="email" required placeholder="you@example.com" />
              <Field
                name="whatsapp_number"
                label="WhatsApp number"
                type="tel"
                required
                placeholder="+92 300 1234567"
              />


              <div>
                <label className="text-[13px] font-medium text-zinc-800">
                  Which plan do you want? <span className="text-rose-500">*</span>
                </label>
                <div className="mt-2 grid grid-cols-3 gap-1.5 sm:gap-2">
                  {([
                    { id: "pro", label: "Pro", desc: "$15 wallet" },
                    { id: "elite", label: "Elite", desc: "$50 wallet" },
                    { id: "ultra", label: "Ultra", desc: "$100 wallet" },
                  ] as const).map((p) => {
                    const active = plan === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPlan(p.id)}
                        className={`rounded-xl border px-3 py-2.5 text-left transition ${
                          active
                            ? "border-zinc-900 bg-white text-zinc-900 shadow-sm"
                            : "border-zinc-200 bg-white text-zinc-900 hover:border-zinc-400"
                        }`}
                      >
                        <div className="text-[13px] font-semibold">{p.label}</div>
                        <div className={`text-[11px] ${active ? "text-zinc-600" : "text-zinc-500"}`}>{p.desc}</div>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-[11px] text-zinc-500">Approved applicants get this plan free for 30 days.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field name="country" label="Country" placeholder="Pakistan" />
                <Field name="broker" label="Broker" placeholder="IC Markets, Exness…" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field name="experience_years" label="Experience (years)" type="number" placeholder="3" />
                <Field
                  key={`ref-${refEmail}`}
                  name="referrer_email"
                  label="Referred by (optional)"
                  type="email"
                  placeholder="friend@email.com"
                  defaultValue={refEmail}
                />
              </div>
              <Field
                name="myfxbook_url"
                label="MyFxBook / verified track record (optional)"
                placeholder="https://myfxbook.com/…"
              />
              <div>
                <label className="text-[13px] font-medium text-zinc-800">
                  Why do you want in? <span className="text-rose-500">*</span>
                </label>
                <textarea
                  name="why_joining"
                  required
                  minLength={10}
                  maxLength={1500}
                  rows={4}
                  placeholder="Tell us about your trading journey and what stability would mean for you…"
                  className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-[14px] outline-none placeholder:text-zinc-400 focus:border-zinc-900"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || remaining === 0}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-black px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:opacity-60"
              >
                {submitting ? "Submitting…" : remaining === 0 ? "This month is full — join waitlist" : "Submit application"}
                <ArrowRight className="h-4 w-4" />
              </button>

              <p className="text-[11px] leading-relaxed text-zinc-500">
                By applying you agree to our <Link to="/terms" className="underline">Terms</Link> and <Link to="/disclaimer" className="underline">Risk Disclaimer</Link>. Future trading involves significant risk.
              </p>

            </form>
          )}
        </div>
      </section>

      <SiteFooter className="bg-white" />
    </div>
  );
}

function Field(props: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <div>
      <label className="text-[13px] font-medium text-zinc-800">
        {props.label}
        {props.required && <span className="text-rose-500"> *</span>}
      </label>
      <input
        name={props.name}
        type={props.type ?? "text"}
        required={props.required}
        placeholder={props.placeholder}
        defaultValue={props.defaultValue}
        className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-[14px] outline-none placeholder:text-zinc-400 focus:border-zinc-900"
      />
    </div>
  );
}
