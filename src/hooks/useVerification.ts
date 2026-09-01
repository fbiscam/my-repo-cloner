import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyDocumentStatus, type DocumentStatusRow } from "@/lib/founding.functions";

/**
 * Identity-verification state for the signed-in user.
 * `verified` unlocks the full app; everything else keeps the account limited
 * to Dashboard, Profile, Security and Documents.
 */
export function useVerification() {
  const fetchStatus = useServerFn(getMyDocumentStatus);
  const { data, isLoading } = useQuery<DocumentStatusRow | null>({
    queryKey: ["my-document-status"],
    queryFn: () => fetchStatus({ data: undefined as any } as any),
    staleTime: 60_000,
    retry: false,
  });

  const status = data?.document_status ?? null;
  return {
    loading: isLoading,
    status,
    verified: status === "verified",
    submitted: status === "received" || status === "pending",
    rejected: status === "rejected",
    needsInfo: status === "needs_info",
    row: data ?? null,
  };
}

/** Pages that stay reachable while an account is unverified. */
export const VERIFICATION_ALLOWED_PATHS = [
  "/dashboard",
  "/dashboard/profile",
  "/dashboard/security",
  "/dashboard/documents",
];

export function isVerificationAllowedPath(pathname: string) {
  const p = pathname.replace(/\/+$/, "") || "/dashboard";
  if (p.startsWith("/dashboard/admin") || p.startsWith("/ops-")) return true;
  return VERIFICATION_ALLOWED_PATHS.includes(p);
}
