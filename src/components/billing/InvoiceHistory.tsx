import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listMyOrders } from "@/lib/payments.functions";
import { networkMeta, type PaymentOrder } from "@/lib/payments/shared";
import { supabase } from "@/integrations/supabase/client";

const MONO = "font-['JetBrains_Mono',ui-monospace,monospace]";

function invoiceNo(o: PaymentOrder) {
  return `JV-${new Date(o.created_at).getFullYear()}-${o.id.slice(0, 8).toUpperCase()}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateLong(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

async function loadLogo(): Promise<string | null> {
  try {
    const res = await fetch("/favicon.png");
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

type JsPDF = import("jspdf").jsPDF;

async function loadFontBase64(path: string): Promise<string | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => {
        const dataUrl = String(fr.result);
        const base64 = dataUrl.split(",")[1];
        resolve(base64 ?? null);
      };
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function embedGoogleSans(doc: JsPDF) {
  const [normal, medium, semibold, bold] = await Promise.all([
    loadFontBase64("/fonts/googlesans-400.ttf"),
    loadFontBase64("/fonts/googlesans-500.ttf"),
    loadFontBase64("/fonts/googlesans-600.ttf"),
    loadFontBase64("/fonts/googlesans-700.ttf"),
  ]);

  if (normal) {
    doc.addFileToVFS("GoogleSansNormal.ttf", normal);
    doc.addFont("GoogleSansNormal.ttf", "GoogleSans", "normal");
  }
  if (medium) {
    doc.addFileToVFS("GoogleSansMedium.ttf", medium);
    doc.addFont("GoogleSansMedium.ttf", "GoogleSans", "medium");
  }
  if (semibold) {
    doc.addFileToVFS("GoogleSansSemiBold.ttf", semibold);
    doc.addFont("GoogleSansSemiBold.ttf", "GoogleSans", "semibold");
  }
  if (bold) {
    doc.addFileToVFS("GoogleSansBold.ttf", bold);
    doc.addFont("GoogleSansBold.ttf", "GoogleSans", "bold");
  }

  return { hasFont: Boolean(normal) };
}

export default function InvoiceHistory() {
  const listFn = useServerFn(listMyOrders);
  const [email, setEmail] = useState<string>("");
  const [fullName, setFullName] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      setEmail(data.user?.email ?? "");
      if (!data.user) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", data.user.id)
        .maybeSingle();
      setFullName(prof?.full_name ?? "");
    });
  }, []);

  const { data } = useQuery({
    queryKey: ["my-payment-orders"],
    queryFn: () => listFn({} as never),
    refetchInterval: 30_000,
  });

  const invoices = useMemo(
    () => (data ?? []).filter((o) => o.status === "approved"),
    [data],
  );

  async function download(o: PaymentOrder) {
    setBusy(o.id);
    try {
      const [{ jsPDF }, logo] = await Promise.all([import("jspdf"), loadLogo()]);
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const W = doc.internal.pageSize.getWidth();
      const L = 48;
      const R = W - L;
      const net = networkMeta(o.network);
      const { hasFont } = await embedGoogleSans(doc);
      const F = hasFont ? "GoogleSans" : "helvetica";

      const date = fmtDateLong(o.decided_at ?? o.created_at);
      const paid = Number(o.pay_amount_usd);
      const bonus = Number(o.bonus_usd);
      const credit = Number(o.credit_usd);

      // ── Header: big INVOICE title left, company block + logo right ──────
      if (logo) {
        try {
          doc.addImage(logo, "PNG", R - 34, 30, 34, 34);
        } catch {
          /* ignore */
        }
      }

      doc.setFont(F, "bold");
      doc.setFontSize(30);
      doc.setTextColor(17, 17, 17);
      doc.text("INVOICE", L, 108);

      doc.setFont(F, "normal");
      doc.setFontSize(13);
      doc.setTextColor(17, 17, 17);
      doc.text("Jenvu", R, 96, { align: "right" });
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      doc.text("jenvu.com · support@jenvu.net", R, 116, { align: "right" });
      doc.text("Florida, United States", R, 131, { align: "right" });

      // ── Grey band: invoice for (left) / meta (right) ─────────────────────
      const bandY = 172;
      const bandH = 152;
      doc.setFillColor(226, 232, 238);
      doc.rect(0, bandY, W, bandH, "F");

      doc.setFont(F, "normal");
      doc.setFontSize(10);
      doc.setTextColor(40, 40, 40);
      doc.text("Invoice for", L, bandY + 34);

      doc.setFontSize(16);
      doc.setTextColor(17, 17, 17);
      doc.text(fullName || email || "Account holder", L, bandY + 72);

      doc.setFontSize(10);
      doc.setTextColor(50, 50, 50);
      doc.text(email || "—", L, bandY + 100);
      doc.text("Jenvu account credit top-up", L, bandY + 116);

      const metaLabelX = R - 250;
      const metaValueX = R - 230;
      const metaRows: [string, string][] = [
        ["Invoice number", invoiceNo(o)],
        ["Invoice date", date],
        ["Payment method", `${net.asset} on ${net.chain}`],
      ];
      if (o.tx_hash) {
        metaRows.push([
          "Transaction",
          `${o.tx_hash.slice(0, 18)}${o.tx_hash.length > 18 ? "…" : ""}`,
        ]);
      }
      let my = bandY + 52;
      metaRows.forEach(([label, value]) => {
        doc.setFontSize(10);
        doc.setTextColor(60, 60, 60);
        doc.text(label, metaLabelX, my, { align: "right" });
        doc.setTextColor(17, 17, 17);
        doc.text(value, metaValueX, my);
        my += 22;
      });

      // ── Line item table ─────────────────────────────────────────────────
      let y = bandY + bandH + 48;
      doc.setFont(F, "bold");
      doc.setFontSize(11);
      doc.setTextColor(17, 17, 17);
      doc.text("Date", L, y);
      doc.text("Description", L + 250, y);
      doc.text("Total amount in (USD $)", R, y, { align: "right" });

      y += 14;
      doc.setDrawColor(30, 30, 30);
      doc.setLineWidth(1);
      doc.line(L, y, R, y);

      doc.setFont(F, "normal");
      doc.setFontSize(11);
      y += 30;
      doc.text(date, L, y);
      doc.text("Account credit top-up", L + 250, y);
      doc.text(`$${paid.toFixed(2)}`, R, y, { align: "right" });

      if (bonus > 0) {
        y += 26;
        doc.text(date, L, y);
        doc.text(`Bonus credit${o.promo_code ? ` (${o.promo_code})` : ""}`, L + 250, y);
        doc.text(`$${bonus.toFixed(2)}`, R, y, { align: "right" });
      }

      y += 24;
      doc.line(L, y, R, y);

      // ── Total ───────────────────────────────────────────────────────────
      y += 34;
      doc.setFont(F, "normal");
      doc.setFontSize(12);
      doc.setTextColor(17, 17, 17);
      doc.text("Total", R - 160, y, { align: "right" });
      doc.text(`$${paid.toFixed(2)}`, R, y, { align: "right" });

      y += 26;
      doc.setFontSize(10);
      doc.setTextColor(80, 80, 80);
      doc.text("Credited to balance", R - 160, y, { align: "right" });
      doc.text(`$${credit.toFixed(2)}`, R, y, { align: "right" });

      // ── Footer ──────────────────────────────────────────────────────────
      const H = doc.internal.pageSize.getHeight();
      doc.setFontSize(9);
      doc.setTextColor(140, 140, 140);
      doc.text(
        "Paid in full. Credits are applied to your Jenvu account balance immediately after approval.",
        L,
        H - 64,
      );
      doc.text(
        "support@jenvu.net · This invoice was generated electronically and is valid without signature.",
        L,
        H - 48,
      );

      doc.save(`${invoiceNo(o)}.pdf`);
    } finally {
      setBusy(null);
    }
  }


  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">&nbsp; Invoices</h2>
          <p className="mt-0.5 text-xs text-zinc-500">Successful payments with downloadable PDF receipts.</p>
        </div>
      </div>

      {invoices.length === 0 ? (
        <p className="mt-5 text-xs text-zinc-500">No successful payments yet. Approved top-ups will appear here.</p>
      ) : (
        <div className="mt-4 divide-y divide-zinc-100">
          {invoices.map((o) => {
            const net = networkMeta(o.network);
            return (
              <div key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className={`${MONO} text-[11px] tracking-wider text-zinc-900`}>{invoiceNo(o)}</div>
                  <div className="mt-0.5 text-[11px] text-zinc-500">
                    {fmtDate(o.decided_at ?? o.created_at)} · {net.label}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className={`${MONO} text-[12px] font-semibold text-zinc-900`}>
                      ${Number(o.pay_amount_usd).toFixed(2)}
                    </div>
                    <div className="text-[10px] text-emerald-600">
                      +${Number(o.credit_usd).toFixed(2)} credited
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => download(o)}
                    disabled={busy === o.id}
                    className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-[11px] font-medium text-black transition hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {busy === o.id ? "Preparing…" : "Download PDF"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
