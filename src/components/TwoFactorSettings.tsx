import * as React from "react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Shield, ShieldCheck, ShieldOff, Copy, Check } from "lucide-react";

type Factor = {
  id: string;
  status: "verified" | "unverified";
  friendly_name?: string | null;
  factor_type: string;
  created_at?: string;
};

type EnrollData = {
  factorId: string;
  qr: string;
  secret: string;
  uri: string;
};

export function TwoFactorSettings() {
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [factors, setFactors] = React.useState<Factor[]>([]);
  const [enroll, setEnroll] = React.useState<EnrollData | null>(null);
  const [code, setCode] = React.useState("");
  const [codeError, setCodeError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const verified = factors.find((f) => f.status === "verified" && f.factor_type === "totp");

  const refresh = React.useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const all: Factor[] = [
      ...(data?.totp || []).map((f) => ({ ...f, factor_type: "totp" as const })),
    ];
    setFactors(all);
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const startEnroll = async () => {
    setCodeError(null);
    setBusy(true);
    // Clean up any previous unverified factors so we don't accumulate them
    const existingUnverified = factors.filter((f) => f.status === "unverified");
    for (const f of existingUnverified) {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
    const { data: userData } = await supabase.auth.getUser();
    const userEmail = userData.user?.email || "account";
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Jenvu · ${new Date().toISOString().slice(0, 10)}`,
      issuer: "Jenvu.com",
    });
    setBusy(false);
    if (error || !data) {
      toast.error(error?.message || "Could not start 2FA setup");
      return;
    }
    // Rewrite the otpauth URI + QR so the authenticator app shows
    // "Jenvu.com" as issuer and the user's email as account label,
    // instead of the default project URL.
    const rebuiltUri = `otpauth://totp/${encodeURIComponent("Jenvu.com")}:${encodeURIComponent(userEmail)}?secret=${data.totp.secret}&issuer=${encodeURIComponent("Jenvu.com")}&algorithm=SHA1&digits=6&period=30`;
    const qrSrc = await QRCode.toDataURL(rebuiltUri, { margin: 1, width: 240 });
    setEnroll({
      factorId: data.id,
      qr: qrSrc,
      secret: data.totp.secret,
      uri: rebuiltUri,
    });
    setCode("");
  };


  const cancelEnroll = async () => {
    if (!enroll) return;
    setBusy(true);
    await supabase.auth.mfa.unenroll({ factorId: enroll.factorId });
    setBusy(false);
    setEnroll(null);
    setCode("");
    setCodeError(null);
    void refresh();
  };

  const verifyEnroll = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!enroll) return;
    if (!/^\d{6}$/.test(code)) {
      setCodeError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setCodeError(null);
    setBusy(true);
    const { data: chal, error: chalErr } = await supabase.auth.mfa.challenge({
      factorId: enroll.factorId,
    });
    if (chalErr || !chal) {
      setBusy(false);
      setCodeError(chalErr?.message || "Could not create challenge");
      return;
    }
    const { error: verErr } = await supabase.auth.mfa.verify({
      factorId: enroll.factorId,
      challengeId: chal.id,
      code,
    });
    setBusy(false);
    if (verErr) {
      setCodeError(verErr.message || "Invalid code. Try again.");
      setCode("");
      return;
    }
    
    setEnroll(null);
    setCode("");
    void refresh();
  };

  const disable = async () => {
    if (!verified) return;
    if (!window.confirm("Disable two-factor authentication? You'll no longer need a code at sign-in.")) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: verified.id });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Two-factor authentication disabled");
    void refresh();
  };

  const copySecret = async () => {
    if (!enroll) return;
    try {
      await navigator.clipboard.writeText(enroll.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  if (loading) {
    return (
      <div className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading 2FA status…
      </div>
    );
  }

  // Enrollment in progress
  if (enroll) {
    return (
      <form onSubmit={verifyEnroll} className="mt-5 space-y-4 rounded-xl border border-zinc-200 bg-zinc-50/60 p-5">
        <div className="flex items-start gap-3">
          <Shield className="mt-0.5 h-5 w-5 shrink-0 text-zinc-700" />
          <div>
            <p className="text-sm font-medium text-zinc-900">Set up your authenticator</p>
            <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
              Scan the QR code with Google Authenticator, 1Password, Authy, or any TOTP app.
              Then enter the 6-digit code the app shows.
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
          <div className="rounded-lg border border-zinc-200 bg-white p-3">
            {/* Supabase returns an SVG data URL */}
            <img src={enroll.qr} alt="Scan this QR code with your authenticator app" className="h-40 w-40" />
          </div>
          <div className="flex-1 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Or enter manually</p>
            <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 font-mono text-xs text-zinc-800 break-all">
              <span className="flex-1">{enroll.secret}</span>
              <button
                type="button"
                onClick={copySecret}
                className="shrink-0 rounded-md border border-zinc-200 bg-white p-1.5 text-zinc-600 hover:bg-zinc-50"
                aria-label="Copy secret"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
            <p className="text-[11px] text-zinc-500">Keep this secret private. It grants access to your account.</p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-600">Verification code</label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => { setCodeError(null); setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); }}
            className={`mt-1 block w-full rounded-lg border px-4 py-3 text-center text-2xl tracking-[0.5em] font-mono outline-none transition ${
              codeError ? "border-red-400 text-red-600" : "border-zinc-200 text-zinc-900 focus:border-zinc-900"
            }`}
            placeholder="••••••"
          />
          {codeError && <p className="mt-2 text-xs text-red-600">{codeError}</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={busy || code.length !== 6}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Verify & enable
          </button>
          <button
            type="button"
            onClick={cancelEnroll}
            disabled={busy}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  // Enabled state
  if (verified) {
    return (
      <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-emerald-900 whitespace-nowrap">Two-factor authentication is ON</p>
            <p className="mt-1 text-xs text-emerald-800/80">
              Every sign-in requires a 6-digit code from your authenticator app.
            </p>
          </div>
          <button
            onClick={disable}
            disabled={busy}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 self-start rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldOff className="h-3.5 w-3.5" />}
            Disable
          </button>
        </div>
      </div>
    );
  }

  // Disabled state — offer to enable
  return (
    <div className="mt-5 rounded-xl border border-zinc-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-900">Two-factor authentication</p>
          <p className="mt-1 text-xs text-zinc-500">Require a 6-digit code from an authenticator app on every sign-in.</p>
        </div>
        <button
          onClick={startEnroll}
          disabled={busy}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 self-start rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
          Enable
        </button>
      </div>
    </div>
  );
}

