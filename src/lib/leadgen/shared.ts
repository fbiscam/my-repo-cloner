// Client-safe constants and types for the Jenvu Leads platform.

export const LEAD_CREDIT_COST = 0.5;

export const LEAD_STATUSES = ["new", "contacted", "replied", "won", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export type LeadRow = {
  id: string;
  list_id: string | null;
  source: string;
  name: string;
  title: string | null;
  company: string | null;
  category: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  socials: Record<string, string>;
  rating: number | null;
  reviews: number | null;
  status: LeadStatus;
  notes: string | null;
  revealed: boolean;
  created_at: string;
};

export type LeadInput = {
  source: string;
  name: string;
  title?: string | null;
  company?: string | null;
  category?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  socials?: Record<string, string>;
  rating?: number | null;
  reviews?: number | null;
  external_id?: string | null;
  revealed?: boolean;
};

export type LeadList = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  lead_count?: number;
};

export type CreditState = {
  monthly_limit: number;
  used: number;
  remaining: number;
};

export type Me = {
  user_id: string;
  email: string;
  full_name: string | null;
  is_admin: boolean;
  is_disabled: boolean;
  credits: CreditState;
};

export function dedupeKeyFor(input: LeadInput): string {
  const parts = [
    (input.email ?? "").trim().toLowerCase(),
    (input.website ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, ""),
    (input.phone ?? "").replace(/[^\d]/g, ""),
    (input.external_id ?? "").trim(),
  ].filter(Boolean);
  if (parts.length > 0) return parts.join("|");
  return `${input.name.trim().toLowerCase()}|${(input.address ?? "").trim().toLowerCase()}`;
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(","), ...rows.map((r) => columns.map((c) => esc(r[c])).join(","))].join("\n");
}
