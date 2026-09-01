import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Check, X, Clock, FileImage, FileVideo, FileText, HelpCircle } from "lucide-react";
import {
  adminListDocumentSubmissions,
  adminUpdateDocumentStatus,
  type AdminDocSubmission,
} from "@/lib/founding.functions";

export const Route = createFileRoute("/_authenticated/dashboard/admin/documents")({
  head: () => ({
    meta: [
      { title: "Identity verification submissions — Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminDocumentsPage,
});

const STATUS_BADGES: Record<string, string> = {
  received: "bg-blue-50 text-blue-700 border-blue-200",
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  needs_info: "bg-violet-50 text-violet-700 border-violet-200",
  verified: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
};

function FilePreview({ file }: { file: AdminDocSubmission["files"][number] }) {
  const url = file.signed_url ?? undefined;
  const mime = file.mime_type;
  if (mime.startsWith("image/") && url) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block group">
        <img
          src={url}
          alt={file.original_name || "proof"}
          className="h-40 w-full object-cover rounded-lg border border-zinc-200 group-hover:opacity-90"
          loading="lazy"
        />
      </a>
    );
  }
  if (mime.startsWith("video/") && url) {
    return (
      <video
        src={url}
        controls
        className="h-40 w-full object-cover rounded-lg border border-zinc-200 bg-black"
        preload="metadata"
      />
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="h-40 w-full flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 text-zinc-500 text-xs gap-2 hover:bg-zinc-100"
    >
      <FileText className="h-8 w-8" />
      Open file
    </a>
  );
}

function FileTypeIcon({ mime }: { mime: string }) {
  if (mime.startsWith("image/")) return <FileImage className="h-3.5 w-3.5" />;
  if (mime.startsWith("video/")) return <FileVideo className="h-3.5 w-3.5" />;
  return <FileText className="h-3.5 w-3.5" />;
}

function AdminDocumentsPage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(adminListDocumentSubmissions);
  const update = useServerFn(adminUpdateDocumentStatus);
  const [filter, setFilter] = useState<string>("all");
  const [rejectFor, setRejectFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [infoFor, setInfoFor] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState("");

  const { data: rows = [], isLoading, error } = useQuery<AdminDocSubmission[]>({
    queryKey: ["admin-doc-submissions"],
    queryFn: () => fetchList({ data: undefined as any } as any),
    refetchOnWindowFocus: false,
  });

  const mut = useMutation({
    mutationFn: (input: {
      id: string;
      status: "verified" | "pending" | "rejected" | "needs_info";
      reason?: string;
      info?: string;
    }) =>
      update({
        data: {
          id: input.id,
          document_status: input.status,
          rejected_reason: input.reason,
          info_request: input.info,
        },
      } as any),
    onSuccess: (_r, vars) => {
      toast.success(
        vars.status === "verified"
          ? "Approved — user is now verified"
          : vars.status === "rejected"
          ? "Rejected"
          : vars.status === "needs_info"
          ? "Info request sent to user"
          : "Marked as under review",
      );
      setRejectFor(null);
      setReason("");
      setInfoFor(null);
      setInfoMsg("");
      qc.invalidateQueries({ queryKey: ["admin-doc-submissions"] });
    },
    onError: (e: any) => {
      console.error("[admin-docs] update failed", e);
      toast.error(e?.message || "Failed to update — check console");
    },
  });

  const filtered = filter === "all" ? rows : rows.filter((r) => r.document_status === filter);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 font-['Google_Sans',_'Inter',_system-ui,_sans-serif]">
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="pl-1 text-2xl font-semibold text-zinc-900">Identity verification submissions</h1>
          <p className="text-sm text-zinc-600 mt-1">Review ID and driving license uploads and approve or reject users.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {["all", "received", "pending", "needs_info", "verified", "rejected"].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={[
                "text-xs px-3 py-1.5 rounded-full border capitalize",
                filter === s
                  ? "bg-zinc-900 text-white border-zinc-900"
                  : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50",
              ].join(" ")}
            >
              {s.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">Loading…</div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {(error as Error).message}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-500">
          No submissions yet.
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((row) => (
            <div key={row.application_id} className="rounded-2xl border border-zinc-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">{row.full_name}</div>
                  {row.profile_full_name && row.profile_full_name.trim() && (
                    <div className="text-[11px] text-zinc-600">
                      Profile name: <span className="text-zinc-900 font-medium">{row.profile_full_name}</span>
                    </div>
                  )}
                  <div className="text-xs text-zinc-500">{row.email}</div>

                  <div className="text-[11px] text-zinc-500 mt-1">
                    Plan requested: <span className="text-zinc-700 uppercase">{row.requested_plan || "—"}</span> ·
                    Submitted{" "}
                    {row.documents_submitted_at
                      ? new Date(row.documents_submitted_at).toLocaleString()
                      : "—"}
                  </div>
                </div>
                <span
                  className={[
                    "text-[11px] font-semibold px-2 py-1 rounded-full border capitalize",
                    STATUS_BADGES[row.document_status] || "bg-zinc-50 text-zinc-700 border-zinc-200",
                  ].join(" ")}
                >
                  {row.document_status}
                </span>
              </div>

              {row.documents_note && (
                <div className="mt-3 text-xs text-zinc-600 bg-zinc-50 rounded-lg p-3">
                  <span className="font-semibold text-zinc-800">Note: </span>
                  {row.documents_note}
                </div>
              )}
              {row.document_status === "rejected" && row.documents_rejected_reason && (
                <div className="mt-3 text-xs text-rose-700 bg-rose-50 rounded-lg p-3">
                  <span className="font-semibold">Rejected: </span>
                  {row.documents_rejected_reason}
                </div>
              )}
              {row.document_status === "needs_info" && row.documents_info_request && (
                <div className="mt-3 text-xs text-violet-700 bg-violet-50 rounded-lg p-3">
                  <span className="font-semibold">Info requested: </span>
                  {row.documents_info_request}
                </div>
              )}

              {row.files.filter((f) => f.doc_kind !== "earning_proof").length === 0 ? (
                <div className="mt-4 text-xs text-zinc-500 italic">No files uploaded.</div>
              ) : (
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {row.files
                    .filter((f) => f.doc_kind !== "earning_proof")
                    .map((f) => (
                      <div key={f.id} className="space-y-1">
                        <FilePreview file={f} />
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-700">
                          {f.doc_kind === "identity"
                            ? "ID verification"
                            : f.doc_kind === "driving_license"
                              ? "Driving license"
                              : "Document"}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 truncate">
                          <FileTypeIcon mime={f.mime_type} />
                          <span className="truncate" title={f.original_name || undefined}>
                            {f.original_name || f.storage_path.split("/").pop()}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              )}

              {rejectFor === row.application_id ? (
                <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3">
                  <div className="text-xs font-semibold text-rose-800 mb-2">Rejection reason (shown to user)</div>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Screenshot is blurry — please re-upload a clearer version."
                    className="w-full rounded-lg border border-rose-200 bg-white p-2 text-sm outline-none min-h-[70px]"
                  />
                  <div className="text-[11px] text-rose-700 mt-1">
                    User will have 24 hours to re-upload after rejection.
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() =>
                        mut.mutate({ id: row.application_id, status: "rejected", reason: reason.trim() })
                      }
                      disabled={mut.isPending || !reason.trim()}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50"
                    >
                      Confirm reject
                    </button>
                    <button
                      onClick={() => {
                        setRejectFor(null);
                        setReason("");
                      }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-zinc-200 text-zinc-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : infoFor === row.application_id ? (
                <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-3">
                  <div className="text-xs font-semibold text-violet-800 mb-2">
                    What info do you need from the user? (shown to them)
                  </div>
                  <textarea
                    value={infoMsg}
                    onChange={(e) => setInfoMsg(e.target.value)}
                    placeholder="e.g. Please share a screen recording that also shows the account name on your broker terminal."
                    className="w-full rounded-lg border border-violet-200 bg-white p-2 text-sm outline-none min-h-[70px]"
                  />
                  <div className="text-[11px] text-violet-700 mt-1">
                    User can respond and re-upload right away — status resets to Received on their next upload.
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() =>
                        mut.mutate({ id: row.application_id, status: "needs_info", info: infoMsg.trim() })
                      }
                      disabled={mut.isPending || !infoMsg.trim()}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
                    >
                      Send request
                    </button>
                    <button
                      onClick={() => {
                        setInfoFor(null);
                        setInfoMsg("");
                      }}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-zinc-200 text-zinc-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => mut.mutate({ id: row.application_id, status: "verified" })}
                    disabled={mut.isPending || row.document_status === "verified"}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    <Check className="h-3.5 w-3.5" /> Approve
                  </button>
                  <button
                    onClick={() => mut.mutate({ id: row.application_id, status: "pending" })}
                    disabled={mut.isPending || row.document_status === "pending"}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    <Clock className="h-3.5 w-3.5" /> Mark reviewing
                  </button>
                  <button
                    onClick={() => {
                      setInfoFor(row.application_id);
                      setInfoMsg(row.documents_info_request || "");
                    }}
                    disabled={mut.isPending}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-violet-200 text-violet-700 hover:bg-violet-50 inline-flex items-center gap-1"
                  >
                    <HelpCircle className="h-3.5 w-3.5" /> Need info
                  </button>
                  <button
                    onClick={() => setRejectFor(row.application_id)}
                    disabled={mut.isPending}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-rose-200 text-rose-700 hover:bg-rose-50 inline-flex items-center gap-1"
                  >
                    <X className="h-3.5 w-3.5" /> Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
