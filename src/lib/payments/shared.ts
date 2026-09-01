// Client-safe shared types & constants for crypto top-ups.

export type NetworkId = "trc20" | "bep20" | "erc20";

export const NETWORKS: Array<{
  id: NetworkId;
  label: string;
  chain: string;
  asset: string;
  note: string;
  explorerTx: (hash: string) => string;
}> = [
  {
    id: "trc20",
    label: "USDT · TRC20",
    chain: "Tron (TRC20)",
    asset: "USDT",
    note: "Lowest fees · fastest confirmation",
    explorerTx: (h) => `https://tronscan.org/#/transaction/${h}`,
  },
  {
    id: "bep20",
    label: "USDT · BEP20",
    chain: "BNB Smart Chain (BEP20)",
    asset: "USDT",
    note: "Low fees on BSC",
    explorerTx: (h) => `https://bscscan.com/tx/${h}`,
  },
  {
    id: "erc20",
    label: "USDT · ERC20",
    chain: "Ethereum (ERC20)",
    asset: "USDT",
    note: "Higher gas fees",
    explorerTx: (h) => `https://etherscan.io/tx/${h}`,
  },
];

export function networkMeta(id: string) {
  return NETWORKS.find((n) => n.id === id) ?? NETWORKS[0];
}

export const PRESET_AMOUNTS = [10, 25, 50, 100];

export const ORDER_WINDOW_MINUTES = 5;

export type PromoType = "percent" | "flat" | "discount" | "free";

export type Quote = {
  amountUsd: number;      // requested credit value
  payUsd: number;         // what the user actually sends
  creditUsd: number;      // total credited on approval
  bonusUsd: number;
  promoCode: string | null;
  promoType: PromoType | null;
  promoNote: string | null;
  error: string | null;
};

export type OrderStatus =
  | "pending"
  | "verifying"
  | "needs_review"
  | "approved"
  | "rejected"
  | "expired";

export type PaymentOrder = {
  id: string;
  network: NetworkId;
  deposit_address: string;
  pay_amount_usd: number;
  credit_usd: number;
  bonus_usd: number;
  promo_code: string | null;
  target_plan_id: string | null;
  is_upgrade: boolean;
  tx_hash: string | null;
  status: OrderStatus;
  reject_reason: string | null;
  created_at: string;
  expires_at: string;
  decided_at: string | null;
};

export function statusLabel(s: OrderStatus): string {
  switch (s) {
    case "pending":
      return "Awaiting payment";
    case "verifying":
      return "Verifying on-chain";
    case "needs_review":
      return "Manual review";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "expired":
      return "Expired";
  }
}
