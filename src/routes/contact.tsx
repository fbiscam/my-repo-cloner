import * as React from "react";
import SiteNavLinks from "@/components/SiteNavLinks";
import HeaderAuthButtons from "@/components/HeaderAuthButtons";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { submitContactMessage } from "@/lib/contact.functions";
import SiteFooter from "@/components/SiteFooter";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Partner with us — Jenvu" },
      {
        name: "description",
        content:
          "Partner with Jenvu — collaborate with our desk on integrations, institutional access, media, and support.",
      },
      { property: "og:title", content: "Partner With Us — Jenvu" },
      {
        property: "og:description",
        content: "Partner with Jenvu — collaborate with our desk on integrations, institutional access, media, and support.",
      },
      { property: "og:url", content: "https://jenvu.com/contact" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Partner With Us — Jenvu" },
      { name: "twitter:description", content: "Partner with Jenvu — collaborate with our desk on integrations, access, and support." },

    ],
    links: [{ rel: "canonical", href: "https://jenvu.com/contact" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ContactPage",
          name: "Contact Jenvu",
          url: "https://jenvu.com/contact",
          mainEntity: {
            "@type": "Organization",
            name: "Jenvu AI",
            email: "support@jenvu.com",
            url: "https://jenvu.com",
          },
        }),
      },
    ],
  }),
  component: ContactPage,
});

const MONO = "font-['Google_Sans','Product_Sans','Roboto',system-ui,sans-serif] font-normal normal-case tracking-normal";
const SANS = "font-['Google_Sans','Product_Sans','Poppins',system-ui,sans-serif]";

const ClientSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(100),
  email: z.string().trim().email("Enter a valid email").max(255),
  subject: z.string().trim().min(1, "Add a subject").max(150),
  message: z.string().trim().min(5, "Message is too short").max(2000),
});

type FormState = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

const INITIAL: FormState = { name: "", email: "", subject: "", message: "" };

function ContactPage() {
  const submit = useServerFn(submitContactMessage);
  const [form, setForm] = React.useState<FormState>(INITIAL);
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormState, string>>>({});
  const [busy, setBusy] = React.useState(false);
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [doneEmail, setDoneEmail] = React.useState<string | null>(null);

  const onChange = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((s) => ({ ...s, [k]: e.target.value }));
    if (errors[k]) setErrors((es) => ({ ...es, [k]: undefined }));
    if (serverError) setServerError(null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);
    const parsed = ClientSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof FormState, string>> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path[0] as keyof FormState | undefined;
        if (path && !fieldErrors[path]) fieldErrors[path] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setBusy(true);
    try {
      const res = await submit({ data: parsed.data });
      if (res.ok) {
        setDoneEmail(parsed.data.email);
        setForm(INITIAL);
      } else {
        setServerError(res.error);
      }
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className={`jenvu-zoom min-h-dvh w-full bg-[#FAFAFA] text-zinc-900 ${SANS} antialiased selection:bg-zinc-900 selection:text-white`}>
        {/* NAV */}
        <header className="sticky top-0 z-50 border-b border-zinc-100 bg-white/85 backdrop-blur-md">
          <div className="relative mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 sm:px-6 sm:py-4 md:flex md:justify-between">
            <Link to="/" className="flex min-w-0 items-center gap-2.5">
              <img src="/favicon.png" alt="Jenvu" className="h-7 w-7 shrink-0 rounded-md object-contain" />
              <span className="truncate text-[22px] tracking-tight leading-none" style={{ color: "#3c4043", fontFamily: "\"Google Sans\", \"Product Sans\", \"DM Sans\", system-ui, sans-serif", fontWeight: 500 }}>Jenvu</span>
            </Link>
            <SiteNavLinks active="/contact" />
            <HeaderAuthButtons />
          </div>
        </header>

        {/* HERO */}
        <section className="border-b border-zinc-100">
          <div className="mx-auto max-w-6xl px-5 sm:px-6 py-12 sm:py-16">
            <h1 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
              Talk to the desk.
            </h1>
            <p className="mt-4 max-w-2xl text-base text-zinc-600 leading-relaxed sm:text-lg">
              Partnerships, support, press, or feedback — drop a note&nbsp;
            </p>
          </div>
        </section>

        {/* BODY */}
        <main className="mx-auto max-w-6xl px-5 sm:px-6 py-12 sm:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-6 lg:gap-8">
            {/* LEFT — info */}
            <aside className="space-y-6">
              <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.08)]">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-zinc-200" />
                  <span className="h-2.5 w-2.5 rounded-full bg-zinc-200" />
                  <span className="h-2.5 w-2.5 rounded-full bg-zinc-200" />
                  <span className={`ml-3 ${MONO} text-[10px] uppercase tracking-[0.22em] text-zinc-500`}>
                    desk · channels
                  </span>
                </div>
                <div className="mt-5 space-y-5">
                  <InfoRow label="Email" value="support@jenvu.com" href="mailto:support@jenvu.com" />
                  <InfoRow label="Response time" value="Within 1 business day" />
                  <InfoRow label="Hours" value="Mon – Fri · 09:00 – 18:00 GMT" />
                  <InfoRow label="Security" value="End-to-end TLS. No data sold." />
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6">
                <div className={`${MONO} text-[10px] uppercase tracking-[0.22em] text-zinc-500`}>
                  what to expect
                </div>
                <ul className="mt-4 space-y-3 text-sm text-zinc-700">
                  {[
                    "We read every message personally — no ticket farm.",
                    "Partnership requests routed to the founding team.",
                    "Bug reports trigger a same-day triage on the engine.",
                    "Press & media inquiries answered within 24h.",
                  ].map((t) => (
                    <li key={t} className="flex gap-2.5">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-900" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </aside>

            {/* RIGHT — form */}
            <section className="rounded-2xl border border-zinc-200 bg-white p-6 sm:p-8 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.08)]">
              <div className="flex items-center justify-between">
                <div className={`${MONO} text-[10px] uppercase tracking-[0.22em] text-zinc-500`}>
                  new transmission
                </div>
                <div className={`${MONO} text-[10px] uppercase tracking-[0.22em] text-emerald-600 flex items-center gap-1.5`}>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  live
                </div>
              </div>

              {doneEmail ? (
                <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-6">
                  <div className={`${MONO} text-[10px] uppercase tracking-[0.22em] text-emerald-700`}>
                    received · ack 200
                  </div>
                  <h2 className="mt-3 text-xl font-semibold tracking-tight text-zinc-900">
                    Message received.
                  </h2>
                  <p className="mt-2 text-sm text-zinc-700">
                    Thanks — we got it. We'll reply to <span className="font-medium">{doneEmail}</span> within one business day.
                  </p>
                  <button
                    type="button"
                    onClick={() => setDoneEmail(null)}
                    className="mt-5 inline-flex items-center rounded-lg border border-zinc-300 bg-white px-3.5 py-2 text-xs font-medium text-zinc-900 hover:bg-zinc-50"
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <form onSubmit={onSubmit} className="mt-6 space-y-5" noValidate>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field
                      label="Name"
                      htmlFor="c-name"
                      error={errors.name}
                    >
                      <input
                        id="c-name"
                        type="text"
                        autoComplete="name"
                        maxLength={100}
                        value={form.name}
                        onChange={onChange("name")}
                        className={inputClass(!!errors.name)}
                        placeholder="Your full name"
                      />
                    </Field>
                    <Field
                      label="Email"
                      htmlFor="c-email"
                      error={errors.email}
                    >
                      <input
                        id="c-email"
                        type="email"
                        autoComplete="email"
                        maxLength={255}
                        value={form.email}
                        onChange={onChange("email")}
                        className={inputClass(!!errors.email)}
                        placeholder="you@domain.com"
                      />
                    </Field>
                  </div>

                  <Field label="Subject" htmlFor="c-subject" error={errors.subject}>
                    <input
                      id="c-subject"
                      type="text"
                      maxLength={150}
                      value={form.subject}
                      onChange={onChange("subject")}
                      className={inputClass(!!errors.subject)}
                      placeholder="What's this about?"
                    />
                  </Field>

                  <Field
                    label="Message"
                    htmlFor="c-message"
                    error={errors.message}
                    hint={`${form.message.length}/2000`}
                  >
                    <textarea
                      id="c-message"
                      rows={6}
                      maxLength={2000}
                      value={form.message}
                      onChange={onChange("message")}
                      className={`${inputClass(!!errors.message)} resize-y min-h-[140px]`}
                      placeholder="Tell us what you need — context, links, and any timelines help."
                    />
                  </Field>

                  {serverError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {serverError}
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <button
                      type="submit"
                      disabled={busy}
                      className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {busy ? "Sending…" : "Send message"}
                      {!busy && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="5" y1="12" x2="19" y2="12" />
                          <polyline points="12 5 19 12 12 19" />
                        </svg>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </section>
          </div>
        </main>

        <SiteFooter />
      </div>
    </>
  );
}

/* ---------- bits ---------- */

function InfoRow({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div>
      <div className={`${MONO} text-[10px] uppercase tracking-[0.22em] text-zinc-500`}>{label}</div>
      {href ? (
        <a href={href} className="mt-1 block text-sm font-medium text-zinc-900 hover:underline underline-offset-4">
          {value}
        </a>
      ) : (
        <div className="mt-1 text-sm text-zinc-900">{value}</div>
      )}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label htmlFor={htmlFor} className={`${MONO} text-[10px] uppercase tracking-[0.22em] text-zinc-500`}>
          {label}
        </label>
        {hint && <span className={`${MONO} text-[10px] text-zinc-400`}>{hint}</span>}
      </div>
      <div className="mt-1.5">{children}</div>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function inputClass(hasError: boolean) {
  return [
    "w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400",
    "outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10",
    hasError ? "border-red-300 focus:border-red-500 focus:ring-red-500/10" : "border-zinc-200",
  ].join(" ");
}
