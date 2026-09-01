import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { UploadCloud, Trash2, FileVideo, FileImage, FileText, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  getMyDocumentStatus,
  listMyDocumentFiles,
  registerDocumentFile,
  deleteMyDocumentFile,
  type DocumentStatusRow,
  type FoundingDocFile,
} from "@/lib/founding.functions";

export const Route = createFileRoute("/_authenticated/dashboard/documents")({
  head: () => ({ meta: [{ title: "Identity verification — Jenvu" }] }),
  component: DocumentsPage,
});

const STEPS: { key: string; label: string; desc: string }[] = [
  { key: "not_submitted", label: "Upload", desc: "Add clear photos of your ID and driving license." },
  { key: "received", label: "Received", desc: "Your documents are uploaded and queued for review." },
  { key: "pending", label: "Under review", desc: "Our team is reviewing your identity documents." },
  { key: "verified", label: "Verified", desc: "Approved — full platform access is now unlocked." },
];

type DocKind = "identity" | "driving_license";
const DOC_KINDS: { key: DocKind; label: string; desc: string; required: boolean }[] = [
  { key: "identity", label: "ID verification", desc: "Passport or national ID — clear photo of the front (and back if applicable).", required: true },
  { key: "driving_license", label: "Driving license", desc: "Front side of your driving license, fully readable.", required: true },
];

const MAX_BYTES = 100 * 1024 * 1024; // 100 MB per file
const ACCEPT = "image/*,video/*,.pdf";

function statusIndex(s: string | undefined) {
  const order = ["not_submitted", "received", "pending", "verified"];
  return Math.max(0, order.indexOf(s || "not_submitted"));
}

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function FileIcon({ mime }: { mime: string }) {
  if (mime.startsWith("image/")) return <FileImage className="h-4 w-4 text-blue-600" />;
  if (mime.startsWith("video/")) return <FileVideo className="h-4 w-4 text-purple-600" />;
  return <FileText className="h-4 w-4 text-zinc-500" />;
}

function DocumentsPage() {
  const qc = useQueryClient();
  const fetchStatus = useServerFn(getMyDocumentStatus);
  const fetchFiles = useServerFn(listMyDocumentFiles);
  const register = useServerFn(registerDocumentFile);
  const remove = useServerFn(deleteMyDocumentFile);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [pending, setPending] = useState<File[]>([]);
  const [docKind, setDocKind] = useState<DocKind>("identity");

  const { data: row, isLoading } = useQuery<DocumentStatusRow | null>({
    queryKey: ["my-document-status"],
    queryFn: () => fetchStatus({ data: undefined as any } as any),
  });

  const { data: files = [] } = useQuery<FoundingDocFile[]>({
    queryKey: ["my-document-files"],
    queryFn: () => fetchFiles({ data: undefined as any } as any),
    enabled: !!row,
  });

  const rejected = row?.document_status === "rejected";
  const needsInfo = row?.document_status === "needs_info";
  const currentIdx = rejected || needsInfo ? 0 : statusIndex(row?.document_status);
  const canUpload = !!row && row.document_status !== "verified";

  const removeMut = useMutation({
    mutationFn: (id: string) => remove({ data: { id } } as any),
    onSuccess: () => {
      toast.success("File removed");
      qc.invalidateQueries({ queryKey: ["my-document-files"] });
      qc.invalidateQueries({ queryKey: ["my-document-status"] });
    },
    onError: (e: any) => toast.error(e?.message || "Could not remove"),
  });

  function handleFiles(list: FileList | null) {
    if (!list || !list.length) return;
    const accepted: File[] = [];
    for (const file of Array.from(list)) {
      if (file.size > MAX_BYTES) {
        toast.error(`${file.name} exceeds 100 MB`);
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length) {
      setPending((prev) => [...prev, ...accepted]);
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  function removePending(idx: number) {
    setPending((prev) => prev.filter((_, i) => i !== idx));
  }

  async function submitPending() {
    if (!pending.length || !row) return;
    setUploading(true);
    try {
      const { data: session } = await supabase.auth.getUser();
      const uid = session?.user?.id;
      if (!uid) throw new Error("Not signed in");
      let done = 0;
      for (const file of pending) {
        setProgress(`Uploading ${++done}/${pending.length}: ${file.name}`);
        const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
        const path = `${uid}/${row.id}/${Date.now()}-${safe}`;
        const { error: upErr } = await supabase.storage
          .from("founding-docs")
          .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
        if (upErr) {
          toast.error(`${file.name}: ${upErr.message}`);
          continue;
        }
        await register({
          data: {
            storage_path: path,
            mime_type: file.type || "application/octet-stream",
            file_size: file.size,
            original_name: file.name,
            doc_kind: docKind,
          },
        } as any);
      }
      toast.success("Submitted for review");
      setPending([]);
      qc.invalidateQueries({ queryKey: ["my-document-files"] });
      qc.invalidateQueries({ queryKey: ["my-document-status"] });
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setUploading(false);
      setProgress("");
    }
  }

  return (
    <div
      className="mx-auto max-w-3xl px-4 py-8 font-['Google_Sans',_'Inter',_system-ui,_sans-serif]"
    >
      <div className="mb-6">
        <h1 className="pl-1 text-2xl font-semibold text-zinc-900 mt-1">Identity verification</h1>
        <p className={`text-sm text-zinc-600 mt-2`}>
          Submit your ID verification and driving license. Signals, alerts and account changes unlock as soon as our team approves your documents.
        </p>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">Loading…</div>
      ) : !row ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6">
          <div className="text-sm text-zinc-700">
            We couldn't find a Founding application linked to your account email. Please apply first.
          </div>
          <a
            href="/founding"
            className="inline-block mt-4 rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800"
          >
            Apply now
          </a>
        </div>
      ) : (
        <>
          {/* Stepper */}
          <div className={`rounded-2xl border border-zinc-200 bg-white p-6`}>
            <ol className="space-y-4">
              {STEPS.map((step, i) => {
                const done = i < currentIdx || (i === currentIdx && row?.document_status === "verified");
                const active = i === currentIdx && !rejected && !needsInfo && row?.document_status !== "verified";
                const isLast = i === STEPS.length - 1;
                return (
                  <li key={step.key} className="flex items-start gap-3">
                    <div className="flex flex-col items-center self-stretch">
                      <div
                        className={[
                          "jenvu-proof-step-circle mt-0.5 h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-xs font-semibold border-2",
                          done
                            ? "border-emerald-500 bg-emerald-500 text-white"
                            : active
                            ? "border-blue-600 bg-blue-600 text-white ring-4 ring-blue-100"
                            : "border-zinc-300 bg-white text-zinc-500",
                        ].join(" ")}
                      >
                        {done ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
                      </div>
                      {!isLast && (
                        <div className={["w-px flex-1 mt-1", done ? "bg-emerald-500" : "bg-zinc-300"].join(" ")} />
                      )}
                    </div>
                    <div className={`flex-1 pb-4`}>
                      <div className="text-sm font-semibold text-zinc-900">{step.label}</div>
                      <div className="text-xs text-zinc-600">{step.desc}</div>
                      {active && step.key === "received" && row.documents_submitted_at && (
                        <div className="text-[11px] text-zinc-500 mt-1">
                          Submitted {new Date(row.documents_submitted_at).toLocaleString()}
                        </div>
                      )}
                      {step.key === "verified" && row.documents_verified_at && (
                        <div className="text-[11px] text-emerald-700 mt-1">
                          Verified {new Date(row.documents_verified_at).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          {needsInfo && (
            <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-5">
              <div className="text-sm font-semibold text-violet-900">Reviewer needs more info</div>
              <div className="text-sm text-violet-800 mt-1 whitespace-pre-line">
                {row.documents_info_request || "Our team asked for a small update. Please upload the missing item below."}
              </div>
              {row.documents_info_requested_at && (
                <div className="text-[11px] text-violet-700 mt-2">
                  Requested {new Date(row.documents_info_requested_at).toLocaleString()}
                </div>
              )}
              <div className="text-xs text-violet-800 mt-3">
                Upload the requested file below — your submission will go straight back to review.
              </div>
            </div>
          )}

          {rejected && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-white p-5" style={{ fontFamily: '"Google Sans", "Google Sans Text", "Product Sans", Roboto, Arial, sans-serif' }}>
              <div className="text-sm font-semibold text-red-800">Documents rejected</div>
              <div className="text-sm text-yellow-600 mt-1">
                {row.documents_rejected_reason || "Please re-upload clearer or more recent ID and driving license."}
              </div>
              {row.documents_rejected_at && (
                <div className="text-[11px] text-black mt-2">
                  {new Date(row.documents_rejected_at).toLocaleString()}
                </div>
              )}
              <div className="text-xs mt-3 font-medium text-black">
                You can re-submit right away — just upload updated ID and driving license below.
              </div>
            </div>
          )}

          {/* Uploader */}
          {canUpload && (
            <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6">
              <div className="text-sm font-semibold text-zinc-900">Upload documents</div>
              <p className="text-xs text-zinc-600 mt-1">
                Images (JPG, PNG), videos (MP4, MOV) or PDFs — up to 100 MB each.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {DOC_KINDS.map((k) => {
                  const uploaded = files.some((f) => f.doc_kind === k.key);
                  return (
                    <button
                      key={k.key}
                      type="button"
                      onClick={() => setDocKind(k.key)}
                      className={[
                        "rounded-xl border px-3 py-2 text-xs font-semibold transition",
                        docKind === k.key
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50",
                      ].join(" ")}
                    >
                      {k.label}
                      {k.required && !uploaded ? " *" : ""}
                      {uploaded ? " ✓" : ""}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-zinc-600">
                {DOC_KINDS.find((k) => k.key === docKind)?.desc}
              </p>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  handleFiles(e.dataTransfer.files);
                }}
                className="mt-3 rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 p-6 text-center"
              >
                <UploadCloud className="mx-auto h-8 w-8 text-zinc-400" />
                <div className="mt-2 text-sm text-zinc-700">
                  Drag & drop files here, or{" "}
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="text-blue-600 font-semibold hover:underline"
                    disabled={uploading}
                  >
                    browse
                  </button>
                </div>
                {uploading && <div className="mt-2 text-xs text-zinc-500">{progress || "Uploading…"}</div>}
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept={ACCEPT}
                  onChange={(e) => handleFiles(e.target.files)}
                  className="hidden"
                />
              </div>

              {pending.length > 0 && (
                <div className="mt-4 rounded-xl border border-zinc-200 bg-white">
                  <div className="px-4 py-2 text-xs font-semibold text-zinc-700 border-b border-zinc-100">
                    Ready to submit ({pending.length})
                  </div>
                  <ul className="divide-y divide-zinc-100">
                    {pending.map((f, i) => (
                      <li key={`${f.name}-${i}`} className="flex items-center gap-3 px-4 py-2 text-sm">
                        <FileIcon mime={f.type || ""} />
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-zinc-900">{f.name}</div>
                          <div className="text-xs text-zinc-500">{fmtSize(f.size)}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removePending(i)}
                          disabled={uploading}
                          className="text-zinc-400 hover:text-red-600 disabled:opacity-40"
                          aria-label="Remove"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 flex items-center justify-end gap-3">
                {uploading && <div className="text-xs text-zinc-500">{progress}</div>}
                <button
                  type="button"
                  onClick={submitPending}
                  disabled={pending.length === 0 || uploading}
                  className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {uploading ? "Submitting…" : `Submit${pending.length ? ` (${pending.length})` : ""}`}
                </button>
              </div>
            </div>
          )}

          {/* Uploaded files list */}
          {canUpload && files.length > 0 && (
            <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6">
              <div className="text-sm font-semibold text-zinc-900 mb-3">
                Uploaded files ({files.length})
              </div>
              <ul className="divide-y divide-zinc-100">
                {files.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 py-3">
                    <FileIcon mime={f.mime_type} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-zinc-900 truncate">
                        {f.original_name || f.storage_path.split("/").pop()}
                      </div>
                      <div className="text-[11px] text-zinc-500">
                        {fmtSize(f.file_size)} · {new Date(f.created_at).toLocaleString()}
                      </div>
                    </div>
                    {f.signed_url && (
                      <a
                        href={f.signed_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-600 hover:underline"
                      >
                        View
                      </a>
                    )}
                    {canUpload && (
                      <button
                        onClick={() => removeMut.mutate(f.id)}
                        disabled={removeMut.isPending}
                        className="text-zinc-400 hover:text-red-600"
                        aria-label="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

        </>
      )}
    </div>
  );
}
