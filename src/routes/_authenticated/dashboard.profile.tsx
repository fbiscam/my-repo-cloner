import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { deleteMyAccount } from "@/lib/delete-account.functions";
import { requestEmailChange } from "@/lib/email-change.functions";
import { getMyMailAddress } from "@/lib/mail.functions";
import AvatarAdjuster from "@/components/AvatarAdjuster";
import { writeCachedAvatar, AVATAR_TTL_SECONDS } from "@/lib/avatar-cache";
import { useVerification } from "@/hooks/useVerification";


export const Route = createFileRoute("/_authenticated/dashboard/profile")({
  component: Profile,
});


function Profile() {
  const navigate = useNavigate();
  const { verified } = useVerification();
  const nameLocked = verified;
  const [userId, setUserId] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [changingEmail, setChangingEmail] = useState(false);
  const [emailPending, setEmailPending] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [mailAddress, setMailAddress] = useState<string | null>(null);

  const refreshAvatarUrl = async (path: string | null) => {
    if (!path) { setAvatarUrl(null); writeCachedAvatar(null); return; }
    const { data } = await supabase.storage.from("avatars").createSignedUrl(path, AVATAR_TTL_SECONDS);
    setAvatarUrl(data?.signedUrl ?? null);
    writeCachedAvatar(data?.signedUrl ?? null);
  };


  useEffect(() => {
    (async () => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) return;
      setUserId(user.user.id);
      setEmail(user.user.email ?? "");
      const { data } = await supabase.from("profiles").select("full_name, avatar_url").eq("id", user.user.id).maybeSingle();
      if (data?.full_name) setFullName(data.full_name);
      if (data?.avatar_url) {
        setAvatarPath(data.avatar_url);
        await refreshAvatarUrl(data.avatar_url);
      }
      try {
        const addr = await getMyMailAddress();
        if (addr?.address) setMailAddress(addr.address);
      } catch {}
    })();
  }, []);

  const saveProfile = async () => {
    setSaving(true);
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return;
    const { error } = await supabase.from("profiles").upsert({ id: user.user.id, full_name: fullName });
    setSaving(false);
    if (error) toast.error("Could not save"); else toast.success("Profile updated");
  };

  const onAvatarPick = () => fileInputRef.current?.click();

  const onAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !userId) return;
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image file"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Max 10MB"); return; }
    setPendingFile(file);
  };

  const uploadAdjustedBlob = async (blob: Blob) => {
    if (!userId) return;
    setUploadingAvatar(true);
    setPendingFile(null);
    try {
      const path = `${userId}/avatar-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
      if (upErr) throw upErr;

      // Clean up previous avatar object
      if (avatarPath && avatarPath !== path) {
        await supabase.storage.from("avatars").remove([avatarPath]).catch(() => {});
      }

      const { error: profErr } = await supabase.from("profiles").upsert({ id: userId, avatar_url: path });
      if (profErr) throw profErr;
      setAvatarPath(path);
      await refreshAvatarUrl(path);
      toast.success("Profile photo updated");
    } catch (err: any) {
      toast.error(err?.message || "Upload failed");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const removeAvatar = async () => {
    if (!userId || !avatarPath) return;
    setUploadingAvatar(true);
    try {
      await supabase.storage.from("avatars").remove([avatarPath]).catch(() => {});
      await supabase.from("profiles").upsert({ id: userId, avatar_url: null });
      setAvatarPath(null);
      setAvatarUrl(null);
      toast.success("Profile photo removed");
    } finally {
      setUploadingAvatar(false);
    }
  };

  const changeEmail = async () => {
    setEmailError(null);
    const target = newEmail.trim().toLowerCase();
    if (!target) return;
    if (target === email.toLowerCase()) {
      setEmailError("New email must be different from your current email.");
      return;
    }
    setChangingEmail(true);
    try {
      const res = await requestEmailChange({ data: { newEmail: target, siteUrl: window.location.origin } });
      if (!res.ok) {
        setEmailError(res.error || "Could not send confirmation email.");
        setEmailPending(null);
      } else {
        setEmailPending(target);
        setNewEmail("");
        toast.success("Confirmation link sent to your current email.");
      }
    } catch (e: any) {
      setEmailError(e?.message || "Could not send confirmation email.");
    } finally {
      setChangingEmail(false);
    }
  };


  const deleteAccount = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteMyAccount();
      await supabase.auth.signOut();
      toast.success("Account deleted");
      navigate({ to: "/auth" });
    } catch (e: any) {
      toast.error(e?.message || "Could not delete account");
      setDeleting(false);
      setConfirmDelete(false);
    }
  };


  return (
    <div className="max-w-2xl space-y-6">
      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="pl-1 text-base font-semibold">Profile</h2>

        {/* Profile photo */}
        <div className="mt-5 flex items-center gap-5">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-zinc-200 bg-zinc-100">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Profile" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xl font-semibold text-zinc-400">
                {(fullName || email || "?").trim().charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onAvatarPick}
                disabled={uploadingAvatar}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
              >
                {uploadingAvatar ? "Uploading…" : avatarPath ? "Change photo" : "Upload photo"}
              </button>
              {avatarPath && (
                <button
                  type="button"
                  onClick={removeAvatar}
                  disabled={uploadingAvatar}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                >
                  Remove
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={onAvatarChange}
              />
            </div>
            <p className="text-[11px] text-zinc-500">JPG, PNG or WebP. Max 10MB. You can crop, zoom and reposition after selecting.</p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block text-xs font-medium text-zinc-600">
            Full name
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={nameLocked}
              className={[
                "mt-1 block w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm",
                nameLocked ? "cursor-not-allowed bg-zinc-50 text-zinc-500" : "",
              ].join(" ")}
              placeholder="Your name"
            />
            {nameLocked && (
              <span className="mt-1 block text-[11px] font-normal text-zinc-500">
                Locked — your name is verified against your identity documents. Contact support to change it.
              </span>
            )}
          </label>
          <label className="block text-xs font-medium text-zinc-600">
            Email
            <input
              value={email}
              disabled
              className="mt-1 block w-full cursor-not-allowed rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500"
            />
          </label>
          <button onClick={saveProfile} disabled={saving || nameLocked} className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50">
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>

      </section>

      <section id="change-email" className="scroll-mt-24 rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="pl-1 text-base font-semibold">&nbsp;Change email</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Enter a new email and we'll send a confirmation link to your current email address. Your email changes only after you click that link.
        </p>
        <div className="mt-4 space-y-3">
          <label className="block text-xs font-medium text-zinc-600">
            New email
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-1 block w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={changeEmail}
              disabled={changingEmail || !newEmail}
              className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {changingEmail ? "Sending…" : "Change email"}
            </button>
            {emailPending && (
              <span className="text-xs font-medium text-amber-600">
                Verification pending — check {email} for a confirmation link.
              </span>
            )}
          </div>
          {emailError && <p className="text-xs font-medium text-rose-600">{emailError}</p>}
        </div>
      </section>



      <section className="rounded-2xl border border-rose-200 bg-rose-50/40 p-6">
        <h2 className="pl-1 text-base font-semibold text-rose-700">&nbsp; Danger zone</h2>
        <p className="mt-1 text-sm text-rose-600/80">Deleting your account is permanent and cannot be undone.</p>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="mt-4 rounded-lg border border-rose-300 bg-white px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50">
            Delete account
          </button>
        ) : (
          <div className="mt-4 flex gap-2">
            <button onClick={deleteAccount} disabled={deleting} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50">{deleting ? "Deleting…" : "Confirm delete"}</button>
            <button onClick={() => setConfirmDelete(false)} disabled={deleting} className="rounded-lg px-4 py-2 text-sm">Cancel</button>

          </div>
        )}
      </section>

      {pendingFile && (
        <AvatarAdjuster
          file={pendingFile}
          onCancel={() => setPendingFile(null)}
          onDone={(blob) => { void uploadAdjustedBlob(blob); }}
        />
      )}
    </div>
  );
}
