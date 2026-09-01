import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { listTrustedDevices, revokeTrustedDevice } from "@/lib/trusted-devices.functions";
import { revokeCurrentTrustedDevice, TRUSTED_DEVICE_KEY } from "@/lib/trusted-devices-local";

type Device = {
  id: string;
  label: string | null;
  user_agent: string | null;
  created_at: string;
  last_used_at: string;
  expires_at: string;
};



function summarizeUA(ua: string | null): string {
  if (!ua) return "Unknown device";
  const isMobile = /Mobile|Android|iPhone|iPad/.test(ua);
  let browser = "Browser";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua) && !/Chrome/.test(ua)) browser = "Safari";
  let os = "";
  if (/Windows/.test(ua)) os = "Windows";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/iPhone|iPad|iOS/.test(ua)) os = "iOS";
  else if (/Linux/.test(ua)) os = "Linux";
  return [browser, os, isMobile ? "Mobile" : ""].filter(Boolean).join(" · ");
}

function fmt(d: string): string {
  try {
    return new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return d;
  }
}

export function TrustedDevicesSettings() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [currentUid, setCurrentUid] = useState<string | null>(null);
  const [hasCurrentTrust, setHasCurrentTrust] = useState(false);
  const [forgetting, setForgetting] = useState(false);
  const listFn = useServerFn(listTrustedDevices);
  const revokeFn = useServerFn(revokeTrustedDevice);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listFn();
      setDevices(rows as Device[]);
    } catch (e) {
      toast.error("Couldn't load devices", {
        description: e instanceof Error ? e.message : "Try again in a moment.",
      });
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }, [listFn]);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setCurrentUid(uid);
      if (uid) setHasCurrentTrust(!!window.localStorage.getItem(TRUSTED_DEVICE_KEY(uid)));
    })();
    void load();
  }, [load]);

  const forgetThisDevice = async () => {
    setForgetting(true);
    try {
      await revokeCurrentTrustedDevice();
      setHasCurrentTrust(false);
      toast.success("This device forgotten", { description: "You'll need MFA the next time you sign in here." });
      await load();
    } finally {
      setForgetting(false);
    }
  };


  const revoke = async (id: string) => {
    setRevoking(id);
    try {
      await revokeFn({ data: { id } });
      // If we can't tell which row is "this browser", still clear localStorage
      // when the last device is revoked so a stale token doesn't linger.
      if (currentUid) {
        const remaining = (devices ?? []).filter((d) => d.id !== id);
        if (remaining.length === 0) {
          window.localStorage.removeItem(TRUSTED_DEVICE_KEY(currentUid));
        }
      }
      toast.success("Device revoked", { description: "That browser will need MFA on next sign-in." });
      setDevices((prev) => (prev ?? []).filter((d) => d.id !== id));
    } catch (e) {
      toast.error("Couldn't revoke device", {
        description: e instanceof Error ? e.message : "Try again in a moment.",
      });
    } finally {
      setRevoking(null);
    }
  };

  const revokeAll = async () => {
    const all = devices ?? [];
    if (all.length === 0) return;
    if (!window.confirm(`Revoke all ${all.length} trusted device${all.length === 1 ? "" : "s"}?`)) return;
    for (const d of all) {
      try {
        await revokeFn({ data: { id: d.id } });
      } catch { /* continue */ }
    }
    if (currentUid) window.localStorage.removeItem(TRUSTED_DEVICE_KEY(currentUid));
    toast.success("All trusted devices revoked");
    setDevices([]);
  };

  return (
    <div className="mt-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="text-sm text-zinc-500 sm:max-w-2xl lg:max-w-3xl">
          Browsers where you ticked <span className="font-medium text-zinc-700">Remember this device</span> during two-factor sign-in. Revoke browser you don't recognize.
        </p>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          {hasCurrentTrust && (
            <button
              onClick={forgetThisDevice}
              disabled={forgetting}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              {forgetting ? "Forgetting…" : "Forget this device"}
            </button>
          )}
          {devices && devices.length > 0 && (
            <button
              onClick={revokeAll}
              className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Revoke all
            </button>
          )}
        </div>
      </div>


      <div className="mt-4 space-y-2">
        {loading ? (
          <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
            Loading devices…
          </div>
        ) : !devices || devices.length === 0 ? (
          <div className="rounded-lg border border-dashed border-zinc-200 px-4 py-6 text-center text-sm text-zinc-500">
            No trusted devices. You'll be asked for a code every time you sign in.
          </div>
        ) : (
          devices.map((d) => {
            const expired = new Date(d.expires_at).getTime() <= Date.now();
            return (
              <div
                key={d.id}
                className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-900">
                    {d.label || summarizeUA(d.user_agent)}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500 break-words">
                    Last used {fmt(d.last_used_at)}
                    {" · "}
                    {expired ? (
                      <span className="text-rose-600">expired</span>
                    ) : (
                      <>expires {fmt(d.expires_at)}</>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => revoke(d.id)}
                  disabled={revoking === d.id}
                  className="self-start rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 sm:shrink-0 sm:self-auto"
                >
                  {revoking === d.id ? "Revoking…" : "Revoke"}
                </button>
              </div>

            );
          })
        )}
      </div>
    </div>
  );
}
