import * as React from "react";
import { createFileRoute, useNavigate, Link, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Mail, Lock, ArrowRight, User, Loader2, Eye, EyeOff } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { CloudOrb } from "@/components/CloudOrb";
import {
  confirmRecoveryOtp,
  confirmSignupOtp,
  requestRecoveryOtp,
  requestSignupOtp,
} from "@/lib/custom-auth.functions";
import { applyReferralCode } from "@/lib/referrals.functions";
import { registerTrustedDevice, verifyTrustedDevice } from "@/lib/trusted-devices.functions";
import { sendTransactionalEmail } from "@/lib/email/send";
import { createUserNotification } from "@/lib/notifications.functions";

const TRUSTED_DEVICE_KEY = (uid: string) => `mfa_trusted_device:${uid}`;

async function waitForMfaElevation(): Promise<boolean> {
  for (let i = 0; i < 10; i += 1) {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) return false;
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!aal || aal.currentLevel === "aal2" || aal.nextLevel !== "aal2") return true;
    await new Promise((resolve) => window.setTimeout(resolve, 150));
  }
  return false;
}


type AuthSearch = { redirect?: string; emailChanged?: "1"; newEmail?: string; mfa?: "1"; mode?: "signup" };

export function sanitizeRedirect(r?: string): string {
  if (!r || typeof r !== "string") return "/dashboard";
  if (!r.startsWith("/") || r.startsWith("//")) return "/dashboard";
  // Strip query/hash — TanStack's navigate({ to }) expects a route path only.
  // Lovable preview appends cache-buster params (__lovable_sha, __lovable_load_id)
  // that break route matching and cause sign-in to silently stall on /auth.
  const path = r.split("?")[0].split("#")[0];
  return path || "/dashboard";
}

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): AuthSearch => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
    emailChanged: search.emailChanged === "1" ? "1" : undefined,
    newEmail: typeof search.newEmail === "string" ? search.newEmail : undefined,
    mfa: search.mfa === "1" ? "1" : undefined,
    mode: search.mode === "signup" ? "signup" : undefined,
  }),
  beforeLoad: async ({ search }) => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash || "";
      if (hash.includes("type=recovery") || hash.includes("error")) return;
      if (search.emailChanged === "1") return;
      if (search.mfa === "1") return;
    }

    const { data } = await supabase.auth.getUser();
    if (data.user) {
      // If MFA elevation is required but not yet completed, stay on /auth so
      // the user can enter their 6-digit code — do NOT redirect to /dashboard,
      // which would just bounce back here (redirect loop).
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal && aal.currentLevel === "aal1" && aal.nextLevel === "aal2") return;
      throw redirect({ to: sanitizeRedirect(search.redirect) as "/dashboard" });
    }
  },
  head: () => ({
    meta: [
      { title: "Sign in to your Desk — Jenvu" },
      {
        name: "description",
        content:
          "Sign in to your Jenvu account to access the voice-native institutional gold trading terminal — live ICT/SMC analysis for every XAU cross-pair.",
      },
      { name: "robots", content: "noindex, follow" },
      { property: "og:title", content: "Sign in to your Desk" },
      { property: "og:description", content: "Access your voice-native institutional trading terminal." },
      { property: "og:url", content: "https://jenvu.com/auth" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Sign in to your Desk" },
      { name: "twitter:description", content: "Access your voice-native institutional trading terminal." },
    ],
    links: [{ rel: "canonical", href: "https://jenvu.com/auth" }],
  }),
  component: AuthPage,
});


const MONO = "font-['JetBrains_Mono',ui-monospace,monospace]";
const SANS = "font-['Google_Sans','Product_Sans','Poppins',system-ui,sans-serif]";

/* ---------- live ticker ---------- */
import { useLiveTicker } from "@/hooks/useLiveTicker";

function AuthPage() {
  const tickerRows = useLiveTicker();
  const navigate = useNavigate();
  const sendSignupOtp = useServerFn(requestSignupOtp);
  const verifySignupCode = useServerFn(confirmSignupOtp);
  const sendRecoveryOtp = useServerFn(requestRecoveryOtp);
  const verifyRecoveryCode = useServerFn(confirmRecoveryOtp);
  const search = Route.useSearch();
  const redirectTo = sanitizeRedirect(search.redirect);
  // Public sign-up is closed — access is granted through the Founding Trader
  // Program only. `?mode=signup` no longer opens a sign-up form.
  const [mode, setMode] = React.useState<"signin" | "signup" | "forgot">("signin");

  // Exact date the 14-day Pro trial would end for someone signing up now.
  // Computed after mount so SSR and client markup match.
  const [trialEndsLabel, setTrialEndsLabel] = React.useState("in 14 days");
  React.useEffect(() => {
    const end = new Date(Date.now() + 14 * 86_400_000);
    setTrialEndsLabel(
      end.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }),
    );
  }, []);

  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [emailChangedBanner, setEmailChangedBanner] = React.useState<string | null>(null);

  // Show a banner + toast when redirected here after a successful email change.
  React.useEffect(() => {
    if (search.emailChanged !== "1") return;
    const ne = search.newEmail || "";
    if (ne) setEmail(ne);
    setEmailChangedBanner(ne || "your new email");
    // Strip the params from the URL so a refresh doesn't re-fire the toast.
    navigate({
      to: "/auth",
      search: (prev: AuthSearch) => ({ ...prev, emailChanged: undefined, newEmail: undefined }),
      replace: true,
    });
  }, []);

  const [otpStep, setOtpStep] = React.useState(false);
  const [otpCode, setOtpCode] = React.useState("");
  const [otpError, setOtpError] = React.useState<string | null>(null);
  const [otpShake, setOtpShake] = React.useState(false);
  const [resending, setResending] = React.useState(false);
  const [forgotStep, setForgotStep] = React.useState<"email" | "code" | "reset">("email");
  const [newPassword, setNewPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [showNewPassword, setShowNewPassword] = React.useState(false);

  const recoveryModeRef = React.useRef(false);
  const lastSubmittedOtpRef = React.useRef<string>("");
  const otpInputRef = React.useRef<HTMLInputElement | null>(null);
  const recoveryOtpInputRef = React.useRef<HTMLInputElement | null>(null);
  const [resendCooldown, setResendCooldown] = React.useState(0);

  // --- MFA (TOTP) challenge state ---
  const [mfaChallenge, setMfaChallenge] = React.useState<null | {
    factorId: string;
    challengeId: string;
    userId: string;
  }>(null);
  const [mfaCode, setMfaCode] = React.useState("");
  const [mfaError, setMfaError] = React.useState<string | null>(null);
  const [mfaShake, setMfaShake] = React.useState(false);
  const [mfaResendCooldown, setMfaResendCooldown] = React.useState(0);
  const [mfaResending, setMfaResending] = React.useState(false);
  const [rememberDevice, setRememberDevice] = React.useState(true);
  const mfaInputRef = React.useRef<HTMLInputElement | null>(null);
  const verifyTrustedDeviceFn = useServerFn(verifyTrustedDevice);
  const registerTrustedDeviceFn = useServerFn(registerTrustedDevice);

  // Terminal-header flash: shows a blinking notification inside the auth-session
  // strip for a few seconds, then reverts to the default label.
  const [flashMsg, setFlashMsg] = React.useState<string | null>(null);
  const [flashTarget, setFlashTarget] = React.useState<"email" | "password">("email");
  const flashTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashInfo = React.useCallback((msg: string, target: "email" | "password" = "email") => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    setFlashTarget(target);
    setFlashMsg(msg);
    flashTimerRef.current = setTimeout(() => setFlashMsg(null), 3000);
  }, []);
  React.useEffect(() => () => {
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
  }, []);

  const flashInline = (target: "email" | "password") =>
    flashMsg && flashTarget === target ? (
      <div key={flashMsg} className={`mt-2 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700 ${MONO} animate-terminal-blink`}>
        <span className="mt-[2px] inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
        <span className="leading-snug">{flashMsg}</span>
      </div>
    ) : null;

  React.useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  React.useEffect(() => {
    if (mfaResendCooldown <= 0) return;
    const t = setInterval(() => setMfaResendCooldown((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [mfaResendCooldown]);



  // Capture ?ref=CODE and stash it for post-signup application.
  React.useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const ref = url.searchParams.get("ref");
      if (ref && ref.trim()) {
        window.sessionStorage.setItem("pending_ref_code", ref.trim().toUpperCase());
      }
    } catch { /* ignore */ }
  }, []);

  const applyRefFn = useServerFn(applyReferralCode);
  const applyPendingReferral = React.useCallback(async () => {
    if (typeof window === "undefined") return;
    const code = window.sessionStorage.getItem("pending_ref_code");
    if (!code) return;
    window.sessionStorage.removeItem("pending_ref_code");
    try {
      const res = await applyRefFn({ data: { code } });
      if (res?.ok) {
        toast.success("Referral applied — 50 credits unlock when you upgrade");
      }
    } catch { /* silent */ }
  }, [applyRefFn]);

  // Shared: open the TOTP challenge for a user who's already signed in
  // but stuck at AAL1 (needs to complete MFA). Also handles trusted-device
  // fast path.
  const openMfaChallengeIfNeeded = React.useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    const session = sess.session;
    if (!session) return false;
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!aal || aal.currentLevel !== "aal1" || aal.nextLevel !== "aal2") return false;
    const { data: fac } = await supabase.auth.mfa.listFactors();
    const totp = fac?.totp?.find((f) => f.status === "verified");
    if (!totp) return false;
    try {
      const uid = session.user.id;
      const savedToken = window.localStorage.getItem(TRUSTED_DEVICE_KEY(uid));
      if (savedToken) {
        const res = await verifyTrustedDeviceFn({ data: { token: savedToken } });
        if (res?.valid) {
          await applyPendingReferral();
          navigate({ to: redirectTo as "/dashboard", replace: true });
          return true;
        }
        window.localStorage.removeItem(TRUSTED_DEVICE_KEY(uid));
      }
    } catch { /* fall through */ }
    const { data: chal, error } = await supabase.auth.mfa.challenge({ factorId: totp.id });
    if (error || !chal) {
      const msg = error?.message || "Could not start MFA challenge";
      setErrorMsg(msg);
      toast.error("Two-factor step failed", { description: msg });
      return true;
    }
    setMfaChallenge({ factorId: totp.id, challengeId: chal.id, userId: session.user.id });
    setMfaCode("");
    setMfaError(null);
    setMfaResendCooldown(30);
    return true;
  }, [navigate, redirectTo, applyPendingReferral, verifyTrustedDeviceFn]);

  // On mount / when arriving with ?mfa=1, if the session is already at AAL1
  // needing AAL2, open the challenge — no SIGNED_IN event fires on plain page
  // loads, so this is required to avoid a redirect loop with the dashboard.
  React.useEffect(() => {
    void openMfaChallengeIfNeeded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((evt, session) => {
      if (evt === "PASSWORD_RECOVERY") {
        recoveryModeRef.current = true;
        setMode("forgot");
        setForgotStep("reset");
        setErrorMsg(null);
        return;
      }
      if (evt === "SIGNED_IN" && session && !recoveryModeRef.current && !mfaChallenge) {
        // Check if MFA elevation is required before navigating to dashboard
        void (async () => {
          const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
          if (data && data.currentLevel === "aal1" && data.nextLevel === "aal2") {
            const { data: fac } = await supabase.auth.mfa.listFactors();
            const totp = fac?.totp?.find((f) => f.status === "verified");
            if (totp) {
              // Try trusted-device fast path first.
              try {
                const uid = session.user.id;
                const savedToken = window.localStorage.getItem(TRUSTED_DEVICE_KEY(uid));
                if (savedToken) {
                  const res = await verifyTrustedDeviceFn({ data: { token: savedToken } });
                  if (res?.valid) {
                    await applyPendingReferral();
                    navigate({ to: redirectTo as "/dashboard", replace: true });
                    return;
                  }
                  // Stale/expired — clear it so we don't retry every login.
                  window.localStorage.removeItem(TRUSTED_DEVICE_KEY(uid));
                }
              } catch { /* fall through to MFA prompt */ }

              const { data: chal, error } = await supabase.auth.mfa.challenge({ factorId: totp.id });
              if (error || !chal) {
                const msg = error?.message || "Could not start MFA challenge";
                setErrorMsg(msg);
                toast.error("Two-factor step failed", { description: msg });
                return;
              }
              setMfaChallenge({ factorId: totp.id, challengeId: chal.id, userId: session.user.id });
              setMfaCode("");
              setMfaError(null);
              setMfaResendCooldown(30);
              return;
            }
          }
          await applyPendingReferral();
          navigate({ to: redirectTo as "/dashboard", replace: true });
        })();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate, redirectTo, applyPendingReferral, mfaChallenge, verifyTrustedDeviceFn]);

  // Reset submitted-otp tracker when leaving OTP screens or clearing the code
  React.useEffect(() => {
    if (otpCode.length === 0) lastSubmittedOtpRef.current = "";
  }, [otpCode]);

  // Autofocus OTP inputs when the step opens
  React.useEffect(() => {
    if (mode === "signup" && otpStep) {
      otpInputRef.current?.focus();
    } else if (mode === "forgot" && forgotStep === "code") {
      recoveryOtpInputRef.current?.focus();
    }
  }, [mode, otpStep, forgotStep]);

  // Auto-submit OTP — only when a full 6 digits are present, no error is showing,
  // no verify is already in flight, and the code matches the CURRENT OTP step.
  React.useEffect(() => {
    // Hard length guard — never fire on partial input / partial paste
    if (otpCode.length !== 6) return;
    if (!/^\d{6}$/.test(otpCode)) return;
    if (loading) return;
    if (otpError) return; // don't retry while an error is being shown
    if (lastSubmittedOtpRef.current === otpCode) return;

    const isSignupOtp = mode === "signup" && otpStep;
    const isRecoveryOtp = mode === "forgot" && forgotStep === "code";
    // Exactly one flow must be active for auto-submit
    if (isSignupOtp === isRecoveryOtp) return;

    lastSubmittedOtpRef.current = otpCode;
    const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
    if (isSignupOtp) {
      void verifyOtp(fakeEvent);
    } else {
      void verifyRecoveryOtp(fakeEvent);
    }
  }, [otpCode, loading, mode, otpStep, forgotStep, otpError]);

  const signInSchema = z.object({
    email: z.string().trim().email("Enter a valid email").max(255),
    password: z.string().min(1, "Password is required"),
  });
  const signUpSchema = z.object({
    fullName: z.string().trim().min(1, "Name is required").max(100),
    email: z.string().trim().email("Enter a valid email").max(255),
    password: z.string().min(8, "Password must be at least 8 characters").max(72),
  });

  const btnLoading = (label: string) => (
    <>
      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </>
  );

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      setErrorMsg(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    setLoading(false);
    if (error) {
      const msg = error.message || "";
      const notConfirmed =
        /confirm/i.test(msg) || /verify/i.test(msg) || /not.*confirmed/i.test(msg);
      if (notConfirmed) {
        // User exists but hasn't verified — do NOT auto-resend a code.
        // Treat as invalid until they complete signup properly.
        setErrorMsg("Invalid credentials. Please sign up.");
        return;
      }
      if (/invalid.*(login|credential)/i.test(msg)) {
        setErrorMsg("Invalid credentials. Please sign up.");
        return;
      }
      setErrorMsg(msg);
      return;
    }
    // Do NOT navigate here — the onAuthStateChange listener above will
    // check MFA level and either open the MFA challenge or navigate.
  };

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const parsed = signUpSchema.safeParse({ fullName, email, password });
    if (!parsed.success) {
      setErrorMsg(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setLoading(true);
    const { getDeviceFingerprint } = await import("@/lib/device-fingerprint");
    const fingerprint = await getDeviceFingerprint();
    const result = await sendSignupOtp({
      data: { ...parsed.data, siteUrl: window.location.origin, fingerprint },
    });
    setLoading(false);
    if (!result.ok) {
      setErrorMsg(result.error || "Could not send verification code");
      return;
    }
    toast.success("6-digit verification code sent to your email"); flashInfo("6-digit verification code sent to your email");
    setOtpStep(true);
    setOtpCode("");
    setResendCooldown(60);
  };

  const verifyMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setMfaError(null);
    if (!mfaChallenge) return;
    if (!/^\d{6}$/.test(mfaCode)) {
      const msg = "Enter the 6-digit code from your authenticator app.";
      setMfaError(msg);
      toast.error("Invalid code format", { description: msg });
      setMfaShake(true);
      setTimeout(() => setMfaShake(false), 500);
      mfaInputRef.current?.focus();
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.mfa.verify({
      factorId: mfaChallenge.factorId,
      challengeId: mfaChallenge.challengeId,
      code: mfaCode,
    });
    if (error) {
      setLoading(false);
      const raw = error.message || "";
      const lower = raw.toLowerCase();
      const friendly = lower.includes("expired")
        ? "That code expired. Generate a fresh one in your authenticator app."
        : lower.includes("invalid") || lower.includes("incorrect") || lower.includes("mismatch")
          ? "That code doesn't match. Try again."
          : raw || "That code doesn't match. Try again.";

      setMfaError(friendly);
      toast.error("Verification failed", { description: friendly });
      setMfaCode("");
      setMfaShake(true);
      setTimeout(() => setMfaShake(false), 500);
      setTimeout(() => mfaInputRef.current?.focus(), 30);
      return;
    }
    const elevated = await waitForMfaElevation();
    if (!elevated) {
      setLoading(false);
      const msg = "Two-factor session is still updating. Please try again.";
      setMfaError(msg);
      toast.error("Verification delayed", { description: msg });
      setMfaCode("");
      setTimeout(() => mfaInputRef.current?.focus(), 30);
      return;
    }
    const rememberedUid = mfaChallenge.userId;
    setMfaChallenge(null);
    setMfaCode("");
    // Optionally persist this device so MFA is skipped for 30 days (silent — no toast).
    if (rememberDevice && rememberedUid) {
      try {
        const ua = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 400) : undefined;
        const res = await registerTrustedDeviceFn({ data: { userAgent: ua } });
        if (res?.token) {
          try {
            window.localStorage.setItem(TRUSTED_DEVICE_KEY(rememberedUid), res.token);
          } catch {
            // storage blocked — fail silently
          }
        }
      } catch {
        // fail silently — user is signed in either way
      }
    }

    setLoading(false);
    navigate({ to: redirectTo as "/dashboard", replace: true });
  };

  const cancelMfa = async () => {
    setMfaChallenge(null);
    setMfaCode("");
    setMfaError(null);
    await supabase.auth.signOut();
  };

  const resendMfaChallenge = async () => {
    if (!mfaChallenge || mfaResendCooldown > 0 || mfaResending) return;
    setMfaResending(true);
    setMfaError(null);
    try {
      const { data: chal, error } = await supabase.auth.mfa.challenge({ factorId: mfaChallenge.factorId });
      if (error || !chal) {
        const msg = error?.message || "Could not request a new code";
        setMfaError(msg);
        toast.error("Couldn't refresh code", { description: msg });
        return;
      }
      setMfaChallenge({ factorId: mfaChallenge.factorId, challengeId: chal.id, userId: mfaChallenge.userId });
      setMfaCode("");
      setMfaResendCooldown(30);
      toast.success("New challenge ready", { description: "Enter the current 6-digit code from your authenticator app." });
      setTimeout(() => mfaInputRef.current?.focus(), 30);
    } finally {
      setMfaResending(false);
    }
  };

  // Auto-focus + auto-submit for MFA input
  React.useEffect(() => {
    if (mfaChallenge) mfaInputRef.current?.focus();
  }, [mfaChallenge]);
  React.useEffect(() => {
    if (mfaChallenge && mfaCode.length === 6 && !loading && !mfaError) {
      void verifyMfa({ preventDefault: () => {} } as React.FormEvent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mfaCode, mfaChallenge]);

  const humanizeOtpError = (msg: string): string => {
    const m = msg.toLowerCase();
    if (m.includes("expired")) return "Code expired. Tap Resend.";
    if (m.includes("invalid") || m.includes("token") || m.includes("otp"))
      return "Invalid code. Try again.";
    if (m.includes("rate") || m.includes("too many"))
      return "Too many attempts. Please wait a moment before trying again.";
    return msg || "Verification failed. Try again.";
  };

  const triggerOtpError = (msg: string, isRecovery = false) => {
    setOtpError(humanizeOtpError(msg));
    setOtpShake(true);
    setOtpCode("");
    lastSubmittedOtpRef.current = "";
    window.setTimeout(() => setOtpShake(false), 500);
    window.setTimeout(() => {
      const el = isRecovery ? recoveryOtpInputRef.current : otpInputRef.current;
      el?.focus();
      el?.select?.();
    }, 30);
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const raw = e.clipboardData.getData("text") || "";
    const digits = raw.replace(/\D/g, "");
    const isRecovery = e.currentTarget === recoveryOtpInputRef.current;

    if (digits.length === 0) {
      triggerOtpError("Clipboard doesn't contain a numeric code.", isRecovery);
      return;
    }
    if (digits.length < 6) {
      setOtpCode(digits); // let user see what came through
      triggerOtpError(
        `Pasted only ${digits.length} digit${digits.length === 1 ? "" : "s"} — the code is 6 digits.`,
        isRecovery,
      );
      // Refocus AFTER the trigger's clear so user can retype
      window.setTimeout(() => {
        setOtpCode(digits);
      }, 0);
      return;
    }
    if (digits.length > 6) {
      triggerOtpError(
        `Pasted ${digits.length} digits — the code is 6 digits. Check your email again.`,
        isRecovery,
      );
      return;
    }
    // Exactly 6 — good; auto-submit effect will pick it up.
    setOtpError(null);
    setOtpCode(digits);
  };




  const verifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setOtpError(null);
    if (!/^\d{6}$/.test(otpCode)) {
      triggerOtpError("Enter the 6-digit code from your email");
      return;
    }
    setLoading(true);
    const { getDeviceFingerprint } = await import("@/lib/device-fingerprint");
    const fingerprint = await getDeviceFingerprint();
    const result = await verifySignupCode({ data: { email, code: otpCode, password, fingerprint } });
    if (!result.ok || !result.session) {
      setLoading(false);
      triggerOtpError(result.error || "Verification failed. Try again.");
      return;
    }
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token,
    });
    setLoading(false);
    if (sessionError) {
      setErrorMsg(sessionError.message);
      return;
    }
    toast.success("Email verified — welcome to Jenvu"); flashInfo("Email verified — welcome to Jenvu");
    // Fire-and-forget welcome email
    void sendTransactionalEmail({
      templateName: "welcome",
      recipientEmail: email,
      idempotencyKey: `welcome-${email.toLowerCase()}`,
      templateData: { fullName, siteUrl: window.location.origin },
    });
    // Mirror the welcome email as an in-app notification
    void createUserNotification({
      data: {
        type: "welcome",
        title: `Welcome to Jenvu${fullName ? ", " + fullName.split(" ")[0] : ""} 👋`,
        body: "Your account is ready. Explore signals, dashboard, and referrals.",
        dedupeKey: `welcome-${email.toLowerCase()}`,
      },
    });
    // Deliver welcome message to the user's internal @jenvu.email inbox from support@
    void import("@/lib/system-mail.functions").then((m) =>
      m.sendWelcomeSystemMail({ data: { fullName } }).catch(() => {}),
    );
  };


  const resendCode = async () => {
    if (resendCooldown > 0) return;
    setErrorMsg(null);
    setResending(true);
    const { getDeviceFingerprint } = await import("@/lib/device-fingerprint");
    const fingerprint = await getDeviceFingerprint();
    const result = await sendSignupOtp({
      data: { email, password, fullName, siteUrl: window.location.origin, fingerprint },
    });
    setResending(false);
    if (!result.ok) {
      setErrorMsg(result.error || "Could not send code");
      return;
    }
    toast.success("New 6-digit code sent"); flashInfo("New 6-digit code sent");
    setResendCooldown(60);
  };

  const forgotEmailSchema = z.object({
    email: z.string().trim().email("Enter a valid email").max(255),
  });

  const sendResetLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const parsed = forgotEmailSchema.safeParse({ email });
    if (!parsed.success) {
      setErrorMsg(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setLoading(true);
    const result = await sendRecoveryOtp({
      data: { email: parsed.data.email, siteUrl: window.location.origin },
    });
    setLoading(false);
    if (!result.ok) {
      setErrorMsg(result.error || "Could not send reset code");
      return;
    }
    toast.success("6-digit reset code sent to your email"); flashInfo("6-digit reset code sent to your email");
    setForgotStep("code");
    setOtpCode("");
    setResendCooldown(60);
  };

  const verifyRecoveryOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setOtpError(null);
    if (!/^\d{6}$/.test(otpCode)) {
      triggerOtpError("Enter the 6-digit code from your email", true);
      return;
    }
    setLoading(true);
    recoveryModeRef.current = true;
    const result = await verifyRecoveryCode({
      data: { email, code: otpCode, siteUrl: window.location.origin },
    });
    if (!result.ok || !result.session) {
      setLoading(false);
      triggerOtpError(result.error || "Verification failed. Try again.", true);
      return;
    }
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token,
    });
    setLoading(false);
    if (sessionError) {
      triggerOtpError(sessionError.message, true);
      return;
    }
    setForgotStep("reset");
  };


  const resendResetCode = async () => {
    if (resendCooldown > 0) return;
    setErrorMsg(null);
    setResending(true);
    const result = await sendRecoveryOtp({
      data: { email, siteUrl: window.location.origin },
    });
    setResending(false);
    if (!result.ok) {
      setErrorMsg(result.error || "Could not send code");
      return;
    }
    toast.success("New 6-digit code sent"); flashInfo("New 6-digit code sent");
    setResendCooldown(60);
  };


  const updatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (newPassword.length < 8 || newPassword.length > 72) {
      setErrorMsg("Password must be 8-72 characters");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    toast.success("Password updated"); flashInfo("Password updated", "password");
    recoveryModeRef.current = false;
    setNewPassword("");
    navigate({ to: redirectTo as "/dashboard", replace: true });
  };




  return (
    <>
    <div className={`jenvu-auth-zoom h-dvh w-full overflow-hidden bg-white text-zinc-900 ${SANS} antialiased selection:bg-zinc-900 selection:text-white flex flex-col`}>


      {/* NAV */}
      <header className="sticky top-0 z-50 border-b border-zinc-100 bg-white/85 backdrop-blur-md">
        <div className="relative mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3 sm:px-6 sm:py-4 md:flex md:justify-between">
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <img src="/favicon.png" alt="Jenvu" className="h-7 w-7 shrink-0 rounded-md object-contain" />
            <span className="truncate text-[22px] tracking-tight leading-none" style={{ color: "#3c4043", fontFamily: "\"Google Sans\", \"Product Sans\", \"DM Sans\", system-ui, sans-serif", fontWeight: 500 }}>Jenvu</span>
          </Link>

          <div className="flex shrink-0 items-center gap-2">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-100 bg-white ${MONO} text-[10px] tracking-wider uppercase text-zinc-900`}>
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inset-0 rounded-full bg-emerald-500 animate-pulse" />
                <span className="relative rounded-full bg-emerald-500 h-1.5 w-1.5" />
              </span>
              AUTH_TERMINAL // ONLINE
            </div>
          </div>
        </div>
        {/* ticker strip */}
        <div className="border-t border-zinc-100 overflow-hidden">
          <div className={`flex w-max gap-8 py-2 ${MONO} text-[11px] text-zinc-900 whitespace-nowrap animate-ticker`}>
            {[...tickerRows, ...tickerRows].map(([s, p, d], i) => (
              <span key={i} className="flex items-center gap-2">
                <span className="text-zinc-900 font-medium">{s}</span>
                <span>{p}</span>
                <span className={d.startsWith("-") ? "text-red-500" : "text-emerald-600"}>{d}</span>
                <span className="text-zinc-200">•</span>
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex-1 min-h-0 overflow-hidden flex flex-col items-center justify-center p-2 sm:p-3">
        <div className="w-full max-w-6xl max-h-full overflow-hidden">
          <div className="rounded-2xl border border-zinc-200 bg-white shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)] overflow-hidden max-h-[calc(100dvh-9rem)] flex flex-col">

            {/* terminal header */}
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2 border-b border-zinc-100 bg-white sm:flex sm:justify-between sm:px-6 sm:py-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex gap-1.5 shrink-0">
                  <div className={`w-2.5 h-2.5 rounded-full ${flashMsg ? "bg-emerald-500 animate-pulse" : "bg-zinc-200"}`} />
                  <div className={`w-2.5 h-2.5 rounded-full ${flashMsg ? "bg-emerald-500 animate-pulse" : "bg-zinc-200"}`} />
                  <div className={`w-2.5 h-2.5 rounded-full ${flashMsg ? "bg-emerald-500 animate-pulse" : "bg-zinc-200"}`} />
                </div>
                {flashMsg ? (
                  <span
                    key={flashMsg}
                    className={`ml-2 sm:ml-4 text-[10px] sm:text-[11px] ${MONO} tracking-widest uppercase text-emerald-700 truncate animate-terminal-blink`}
                  >
                    ▸ {flashMsg}
                  </span>
                ) : (
                  <span className={`hidden sm:inline ml-2 sm:ml-4 text-[10px] sm:text-[11px] ${MONO} tracking-widest text-zinc-900 uppercase truncate`}>
                    Jenvu // AUTH_SESSION
                  </span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <span className={`text-[11px] ${MONO} ${flashMsg ? "text-emerald-600 animate-terminal-blink" : "text-zinc-400"}`}>
                  {flashMsg ? "TRANSMITTING…" : "ENCRYPTION · AES-256"}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-px bg-zinc-100 flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">
              {/* LEFT — FORM */}
              <div className="lg:col-span-7 bg-white p-4 sm:p-5 lg:p-6 lg:overflow-y-auto">

                <div className="max-w-lg lg:mx-0">

                  <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl lg:text-4xl">
                    Sign in to your desk.
                  </h1>
                  <p className="mt-2 text-sm text-zinc-600 leading-relaxed sm:text-base">
                    Voice-native institutional intelligence, on call.
                  </p>

                  {emailChangedBanner && (
                    <div
                      role="status"
                      className="mt-4 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
                    >
                      <Mail className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="leading-snug">
                        <div className="font-medium">Email change complete</div>
                        <div className="text-emerald-800">
                          Please sign in again with{" "}
                          <span className="font-semibold">{emailChangedBanner}</span>.
                        </div>
                      </div>
                    </div>
                  )}




                  {/* Sign-up is closed — access via Founding Trader Program */}
                  {!mfaChallenge && (
                    <div className="mt-4 rounded-lg border border-yellow-300 bg-white px-4 py-3 text-[13px] text-yellow-900">
                      Public sign-up is closed. Access is granted through the{" "}
                      <Link to="/founding" className="font-medium text-zinc-900 underline-offset-2 hover:underline">
                        {"\n"}Founding Trader Program
                      </Link>
                      {" "}— apply and we'll email you once your seat is approved.
                    </div>
                  )}


                  {mfaChallenge ? (
                    <form onSubmit={verifyMfa} className="mt-4 space-y-3">
                      <div className={`rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-[13px] text-zinc-700 ${MONO}`}>
                        <p className="leading-relaxed">
                          Two-factor authentication is enabled. Enter the 6-digit code from your authenticator app to continue.
                        </p>
                      </div>
                      <div>
                        <label className={`block text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-1 ${MONO}`}>
                          Authenticator Code
                        </label>
                        <input
                          ref={mfaInputRef}
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          required
                          disabled={loading}
                          aria-invalid={mfaError ? true : undefined}
                          value={mfaCode}
                          onChange={(e) => { setMfaError(null); setMfaCode(e.target.value.replace(/\D/g, "").slice(0, 6)); }}
                          className={`w-full rounded-xl border bg-white px-4 py-3 text-center text-2xl tracking-[0.6em] outline-none transition placeholder:text-zinc-300 ${MONO} ${mfaError ? "border-red-400 text-red-600 focus:border-red-500" : "border-zinc-200 text-zinc-900 focus:border-zinc-900"} ${mfaShake ? "animate-otp-shake" : ""}`}
                          placeholder="••••••"
                        />
                        {mfaError && (
                          <p className={`mt-2 text-[12px] text-red-600 md:whitespace-nowrap ${MONO}`} role="alert" aria-live="polite">
                            {mfaError}
                          </p>
                        )}

                      </div>

                      <label className={`flex items-center gap-2 text-xs text-zinc-600 select-none cursor-pointer ${MONO}`}>
                        <input
                          type="checkbox"
                          checked={rememberDevice}
                          onChange={(e) => setRememberDevice(e.target.checked)}
                          disabled={loading}
                          className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                        />
                        <span>Remember this device for 30 days</span>
                      </label>


                      <button
                        type="submit"
                        disabled={loading || mfaCode.length !== 6}
                        className="group w-full rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-800 transition inline-flex items-center justify-center gap-2 disabled:opacity-60"
                      >
                        {loading ? btnLoading("Verifying...") : (<>Verify <ArrowRight className={`w-4 h-4 group-hover:translate-x-0.5 transition ${MONO}`} /></>)}
                      </button>

                      <div className="flex items-center justify-between pt-2 gap-3">
                        <button
                          type="button"
                          onClick={cancelMfa}
                          disabled={loading}
                          className="text-xs text-zinc-500 hover:text-zinc-900 transition disabled:opacity-40"
                        >
                          ← Sign in with a different account
                        </button>
                        <button
                          type="button"
                          onClick={resendMfaChallenge}
                          disabled={loading || mfaResending || mfaResendCooldown > 0}
                          className={`text-xs text-zinc-500 hover:text-zinc-900 transition disabled:opacity-40 ${MONO}`}
                          aria-live="polite"
                        >
                          {mfaResending
                            ? "Requesting…"
                            : mfaResendCooldown > 0
                              ? `Resend in ${mfaResendCooldown}s`
                              : "Resend code"}
                        </button>
                      </div>
                    </form>
                  ) : mode === "signup" ? (
                    otpStep ? (
                      <form onSubmit={verifyOtp} className="mt-4 space-y-3">
                        <div className={`rounded-xl border border-zinc-200 bg-zinc-50 px-3 sm:px-4 py-3 text-[10.5px] sm:text-[11.5px] text-zinc-700 ${MONO}`}>
                          <p className="leading-relaxed sm:whitespace-nowrap sm:overflow-hidden sm:text-ellipsis">
                            <span className="sm:hidden">Code sent to <span className="font-semibold text-zinc-900 break-all">{email}</span>.<br />Enter it to continue.</span>
                            <span className="hidden sm:inline">We sent a 6-digit code to <span className="font-semibold text-zinc-900">{email}</span>. Enter it below to activate your desk.</span>
                          </p>
                        </div>
                        <div>
                          <label className={`block text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-1 ${MONO}`}>
                            Verification Code
                          </label>
                          <input
                            ref={otpInputRef}
                            onPaste={handleOtpPaste}
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            required
                            disabled={loading}
                            aria-invalid={otpError ? true : undefined}
                            aria-describedby={otpError ? "otp-error" : undefined}
                            value={otpCode}
                            onChange={(e) => { setOtpError(null); setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6)); }}
                            className={`w-full rounded-xl border bg-white px-4 py-3 text-center text-2xl tracking-[0.6em] outline-none transition placeholder:text-zinc-300 ${MONO} ${otpError ? "border-red-400 text-red-600 focus:border-red-500" : "border-zinc-200 text-zinc-900 focus:border-zinc-900"} ${otpShake ? "animate-otp-shake" : ""}`}
                            placeholder="••••••"
                          />
                          {otpError && (
                            <p id="otp-error" className={`mt-2 text-[12px] text-red-600 ${MONO}`} role="alert" aria-live="polite">
                              {otpError}
                            </p>
                          )}
                        </div>


                        <button
                          type="submit"
                          disabled={loading}
                          className="group w-full rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-800 transition inline-flex items-center justify-center gap-2 disabled:opacity-60"
                        >
                          {loading ? btnLoading("Verifying...") : (<>Verify & Continue <ArrowRight className={`w-4 h-4 group-hover:translate-x-0.5 transition ${MONO}`} /></>)}
                        </button>

                        <div className="flex items-center justify-between pt-2 text-xs text-zinc-500">
                          <button
                            type="button"
                            onClick={() => { setOtpStep(false); setErrorMsg(null); setOtpError(null); }}
                            disabled={loading}
                            className="hover:text-zinc-900 transition disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            ← Change email
                          </button>
                          <button
                            type="button"
                            onClick={resendCode}
                            disabled={loading || resending || resendCooldown > 0}
                            className="font-medium text-zinc-900 underline-offset-2 hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                          >
                            {resending ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                                Sending...
                              </>
                            ) : resendCooldown > 0 ? (
                              `Resend in ${resendCooldown}s`
                            ) : (
                              "Resend code"
                            )}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <form onSubmit={signUp} className="mt-4 space-y-3">


                        <div>
                          <label className={`block text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-1 ${MONO}`}>
                            Full Name
                          </label>
                          <div className="relative">
                            <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                            <input
                              type="text"
                              required
                              maxLength={100}
                              autoComplete="name"
                              value={fullName}
                              onChange={(e) => setFullName(e.target.value)}
                              className="w-full rounded-xl border border-zinc-200 bg-white pl-11 pr-4 py-2.5 text-sm text-zinc-900 outline-none focus:border-zinc-900 transition placeholder:text-zinc-300"
                              placeholder="Your name..."
                            />
                          </div>
                        </div>

                        <div>
                          <label className={`block text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-1 ${MONO}`}>
                            Email
                          </label>
                          <div className="relative">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                            <input
                              type="email"
                              required
                              maxLength={255}
                              autoComplete="username"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              className="w-full rounded-xl border border-zinc-200 bg-white pl-11 pr-4 py-2.5 text-sm text-zinc-900 outline-none focus:border-zinc-900 transition placeholder:text-zinc-300"
                              placeholder="Institutional email..."
                            />
                          </div>
                          {flashInline("email")}
                        </div>

                        <div>
                          <label className={`block text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-1 ${MONO}`}>
                            Password
                          </label>
                          <div className="relative">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                            <input
                              type={showPassword ? "text" : "password"}
                              required
                              minLength={8}
                              autoComplete="new-password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              className="w-full rounded-xl border border-zinc-200 bg-white pl-11 pr-11 py-2.5 text-sm text-zinc-900 outline-none focus:border-zinc-900 transition placeholder:text-zinc-300"
                              placeholder="Min 8 characters..."
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword((v) => !v)}
                              aria-label={showPassword ? "Hide password" : "Show password"}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700"
                            >
                              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                          {flashInline("password")}
                        </div>

                        {errorMsg && (
                          <div className={`flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 ${MONO}`}>
                            <span className="mt-[2px] inline-block h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                            <span className="leading-snug">{errorMsg}</span>
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={loading}
                          className="group w-full rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-800 transition inline-flex items-center justify-center gap-2 disabled:opacity-60"
                        >
                          {loading ? btnLoading("Creating account...") : (<>Start 14-day Pro trial <ArrowRight className={`w-4 h-4 group-hover:translate-x-0.5 transition ${MONO}`} /></>)}
                        </button>

                        <p className="pt-1 text-center text-[11.5px] text-zinc-500">
                          Trial ends automatically after 14 days — no charge, no card.
                        </p>
                      </form>
                    )

                  ) : mode === "forgot" ? (
                    forgotStep === "email" ? (
                      <form onSubmit={sendResetLink} className="mt-4 space-y-3">
                        <div className={`rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-[13px] text-zinc-700 ${MONO}`}>
                          <p className="leading-relaxed">
                            Enter your email. We'll send a 6-digit reset code.
                          </p>
                        </div>
                        <div>
                          <label className={`block text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-1 ${MONO}`}>
                            Email
                          </label>
                          <div className="relative">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                            <input
                              type="email"
                              required
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              className="w-full rounded-xl border border-zinc-200 bg-white pl-11 pr-4 py-2.5 text-sm text-zinc-900 outline-none focus:border-zinc-900 transition placeholder:text-zinc-300"
                              placeholder="Institutional email..."
                            />
                          </div>
                          {flashInline("email")}
                        </div>

                        {errorMsg && (
                          <div className={`flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 ${MONO}`}>
                            <span className="mt-[2px] inline-block h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                            <span className="leading-snug">{errorMsg}</span>
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={loading}
                          className="group w-full rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-800 transition inline-flex items-center justify-center gap-2 disabled:opacity-60"
                        >
                          {loading ? btnLoading("Sending...") : (<>Send Reset <ArrowRight className={`w-4 h-4 group-hover:translate-x-0.5 transition ${MONO}`} /></>)}
                        </button>

                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={() => { setMode("signin"); setErrorMsg(null); }}
                            className="text-xs text-zinc-500 hover:text-zinc-900 transition"
                          >
                            ← Back to Sign in
                          </button>
                        </div>
                      </form>
                    ) : forgotStep === "code" ? (
                      <form onSubmit={verifyRecoveryOtp} className="mt-4 space-y-3">
                        <div className={`rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-[13px] text-zinc-700 ${MONO}`}>
                          <p className="leading-relaxed">
                            Check <span className="font-semibold text-zinc-900">{email}</span>. Enter the 6-digit code below.
                          </p>
                        </div>
                        <div>
                          <label className={`block text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-1 ${MONO}`}>
                            Verification Code
                          </label>
                          <input
                            ref={recoveryOtpInputRef}
                            onPaste={handleOtpPaste}
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            required
                            disabled={loading}
                            aria-invalid={otpError ? true : undefined}
                            aria-describedby={otpError ? "otp-error-recovery" : undefined}
                            value={otpCode}
                            onChange={(e) => { setOtpError(null); setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6)); }}
                            className={`w-full rounded-xl border bg-white px-4 py-3 text-center text-2xl tracking-[0.6em] outline-none transition placeholder:text-zinc-300 ${MONO} ${otpError ? "border-red-400 text-red-600 focus:border-red-500" : "border-zinc-200 text-zinc-900 focus:border-zinc-900"} ${otpShake ? "animate-otp-shake" : ""}`}
                            placeholder="••••••"
                          />
                          {otpError && (
                            <p id="otp-error-recovery" className={`mt-2 text-[12px] text-red-600 ${MONO}`} role="alert" aria-live="polite">
                              {otpError}
                            </p>
                          )}
                        </div>


                        <button
                          type="submit"
                          disabled={loading}
                          className="group w-full rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-800 transition inline-flex items-center justify-center gap-2 disabled:opacity-60"
                        >
                          {loading ? btnLoading("Verifying...") : (<>Verify Code <ArrowRight className={`w-4 h-4 group-hover:translate-x-0.5 transition ${MONO}`} /></>)}
                        </button>

                        <div className="flex items-center justify-between pt-2 text-xs text-zinc-500">
                          <button
                            type="button"
                            onClick={() => { setForgotStep("email"); setErrorMsg(null); setOtpError(null); }}
                            disabled={loading}
                            className="hover:text-zinc-900 transition disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            ← Change email
                          </button>
                          <button
                            type="button"
                            onClick={resendResetCode}
                            disabled={loading || resending || resendCooldown > 0}
                            className="font-medium text-zinc-900 underline-offset-2 hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                          >
                            {resending ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                                Sending...
                              </>
                            ) : resendCooldown > 0 ? (
                              `Resend in ${resendCooldown}s`
                            ) : (
                              "Resend code"
                            )}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <form onSubmit={updatePassword} className="mt-4 space-y-3">
                        <div className={`rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-900 ${MONO}`}>
                          <p className="leading-relaxed">
                            Verified. Set a new password to continue.
                          </p>
                        </div>
                        <div>
                          <label className={`block text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-1 ${MONO}`}>
                            New Password
                          </label>
                          <div className="relative">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                            <input
                              type={showNewPassword ? "text" : "password"}
                              required
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              className="w-full rounded-xl border border-zinc-200 bg-white pl-11 pr-11 py-2.5 text-sm text-zinc-900 outline-none focus:border-zinc-900 transition placeholder:text-zinc-300"
                              placeholder="Min 8 characters..."
                            />
                            <button type="button" onClick={() => setShowNewPassword((v) => !v)} aria-label={showNewPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700">
                              {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                          {flashInline("password")}
                        </div>


                        {errorMsg && (
                          <div className={`flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 ${MONO}`}>
                            <span className="mt-[2px] inline-block h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                            <span className="leading-snug">{errorMsg}</span>
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={loading}
                          className="group w-full rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-800 transition inline-flex items-center justify-center gap-2 disabled:opacity-60"
                        >
                          {loading ? btnLoading("Updating...") : (<>Update Password <ArrowRight className={`w-4 h-4 group-hover:translate-x-0.5 transition ${MONO}`} /></>)}
                        </button>
                      </form>
                    )
                  ) : (
                    <>
                      <form onSubmit={signIn} className="mt-4 space-y-3">
                        <div>
                          <label className={`block text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-1 ${MONO}`}>
                            User Identification
                          </label>
                          <div className="relative">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                            <input
                              type="email"
                              required
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              className="w-full rounded-xl border border-zinc-200 bg-white pl-11 pr-4 py-2.5 text-sm text-zinc-900 outline-none focus:border-zinc-900 transition placeholder:text-zinc-300"
                              placeholder="Institutional email..."
                            />
                          </div>
                          {flashInline("email")}
                        </div>

                        <div>
                          <label className={`block text-[11px] font-bold uppercase tracking-widest text-zinc-500 mb-1 ${MONO}`}>
                            Access Key
                          </label>
                          <div className="relative">
                            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                            <input
                              type={showPassword ? "text" : "password"}
                              required
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              className="w-full rounded-xl border border-zinc-200 bg-white pl-11 pr-11 py-2.5 text-sm text-zinc-900 outline-none focus:border-zinc-900 transition placeholder:text-zinc-300"
                              placeholder="Enter password..."
                            />
                            <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700">
                              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                          {flashInline("password")}
                        </div>

                        <div className="flex justify-end -mt-1">
                          <button
                            type="button"
                            onClick={() => { setMode("forgot"); setForgotStep("email"); setErrorMsg(null); setOtpCode(""); }}
                            className={`text-[11px] uppercase tracking-widest text-zinc-500 hover:text-zinc-900 transition ${MONO}`}
                          >
                            Forgot password?
                          </button>
                        </div>


                        {errorMsg && (
                          <div className={`flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 ${MONO}`}>
                            <span className="mt-[2px] inline-block h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                            <span className="leading-snug">{errorMsg}</span>
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={loading}
                          className="group w-full rounded-lg bg-zinc-900 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-800 transition inline-flex items-center justify-center gap-2 disabled:opacity-60"
                        >
                          {loading
                            ? btnLoading("Authenticating...")
                            : (<>Authenticate <ArrowRight className={`w-4 h-4 group-hover:translate-x-0.5 transition ${MONO}`} /></>)}
                        </button>
                      </form>

                      <div className="mt-4 pt-3 border-t border-zinc-100">
                        <p className="text-sm text-zinc-500 leading-relaxed">
                          New here?{" "}
                          <Link
                            to="/founding"
                            className="font-medium text-zinc-900 underline-offset-2 hover:underline"
                          >
                            Apply to the Founding Trader Program →
                          </Link>

                        </p>
                      </div>

                    </>
                  )}



                </div>
              </div>


              {/* RIGHT — VISUAL */}
              <div className="hidden lg:flex lg:col-span-5 bg-white flex-col p-5 lg:p-6 border-t lg:border-t-0 lg:border-l border-zinc-100">
                <div className="flex-1 flex flex-col items-center justify-center relative min-h-[200px]">
                  <div
                    className="absolute inset-0 opacity-[0.04] pointer-events-none"
                    style={{
                      backgroundImage: "radial-gradient(#000 0.6px, transparent 0.6px)",
                      backgroundSize: "24px 24px",
                    }}
                  />
                  <div className="relative z-10 flex flex-col items-center">
                    <div className="relative h-32 w-32 lg:h-36 lg:w-36">
                      <div className="absolute inset-0 rounded-full border border-zinc-100 animate-[spin_18s_linear_infinite]" />
                      <div className="absolute inset-4 rounded-full border border-zinc-200/60 animate-[spin_24s_linear_infinite_reverse]" />
                      <div className="absolute inset-7">
                        <CloudOrb status="speaking" pulse={1} />
                      </div>
                    </div>

                    
                    <div className="mt-4 text-center space-y-2">
                      <div className={`flex items-center justify-center gap-2 ${MONO} text-[10px] tracking-[0.2em] text-zinc-400 uppercase`}>
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/40" />
                        LIVE_NARRATION
                      </div>
                      <div className={`h-10 flex items-center justify-center ${MONO} text-[11px] text-zinc-900 text-center max-w-[200px] leading-relaxed`}>
                        <RotatingStatus />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-auto grid grid-cols-2 gap-px bg-zinc-100 rounded-xl overflow-hidden border border-zinc-100">
                  {[
                    ["Markets", "XAU"],
                    ["Latency", "14ms"],
                  ].map(([k, v]) => (
                    <div key={k} className="bg-white p-4 text-center">
                      <div className={`${MONO} text-[9px] uppercase tracking-widest text-zinc-400`}>{k}</div>
                      <div className="mt-1 text-sm font-semibold text-zinc-900">{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* FOOTER */}
    </div>
    </>
  );
}


function RotatingStatus() {
  const [idx, setIdx] = React.useState(0);
  const phrases = [
    "Mapping liquidity on XAU/USD...",
    "FVG detected on XAU/JPY 15m...",
    "Monitoring London fix killzone...",
    "Analyzing institutional bullion bias...",
    "Scanning DXY-XAU divergence..."
  ];
  
  React.useEffect(() => {
    const itv = setInterval(() => setIdx((i: number) => (i + 1) % phrases.length), 3000);
    return () => clearInterval(itv);
  }, [phrases.length]);

  return <span className="animate-pulse">{phrases[idx]}</span>;
}
