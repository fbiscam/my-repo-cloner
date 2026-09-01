// Server-only: on-chain verification of a submitted USDT transaction.
import type { NetworkId } from "./shared";

const TRON_USDT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const BSC_USDT = "0x55d398326f99059fF775485246999027B3197955"; // 18 decimals
const ETH_USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7"; // 6 decimals

export type VerifyResult = {
  ok: boolean;
  reason: string;
  receivedUsd?: number;
  confirmations?: number;
  checkedAt: string;
};

const AMOUNT_TOLERANCE = 0.02;

async function j(url: string): Promise<any> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`explorer_http_${res.status}`);
  return res.json();
}

async function verifyTron(hash: string, address: string, expected: number): Promise<VerifyResult> {
  const now = new Date().toISOString();
  const url = `https://api.trongrid.io/v1/accounts/${address}/transactions/trc20?limit=200&only_to=true&contract_address=${TRON_USDT}`;
  const data = await j(url);
  const rows: any[] = data?.data ?? [];
  const tx = rows.find((r) => String(r.transaction_id ?? "").toLowerCase() === hash.toLowerCase());
  if (!tx) return { ok: false, reason: "Transaction not found for this deposit address yet.", checkedAt: now };
  if (String(tx.to ?? "").toLowerCase() !== address.toLowerCase())
    return { ok: false, reason: "Transaction was not sent to our deposit address.", checkedAt: now };
  const decimals = Number(tx.token_info?.decimals ?? 6);
  const received = Number(tx.value ?? 0) / Math.pow(10, decimals);
  if (received + AMOUNT_TOLERANCE < expected)
    return { ok: false, reason: `Amount too low: received $${received.toFixed(2)}, expected $${expected.toFixed(2)}.`, receivedUsd: received, checkedAt: now };
  return { ok: true, reason: "Verified on Tron.", receivedUsd: received, checkedAt: now };
}

async function verifyEvm(
  chainId: 1 | 56,
  contract: string,
  decimals: number,
  hash: string,
  address: string,
  expected: number,
): Promise<VerifyResult> {
  const now = new Date().toISOString();
  const key = process.env["ETHERSCAN_API_KEY"];
  if (!key) return { ok: false, reason: "Explorer API key not configured — sent for manual review.", checkedAt: now };
  const url =
    `https://api.etherscan.io/v2/api?chainid=${chainId}&module=account&action=tokentx` +
    `&contractaddress=${contract}&address=${address}&page=1&offset=200&sort=desc&apikey=${key}`;
  const data = await j(url);
  if (String(data?.status) !== "1" && !Array.isArray(data?.result))
    return { ok: false, reason: `Explorer error: ${String(data?.message ?? "unknown")}`, checkedAt: now };
  const rows: any[] = Array.isArray(data?.result) ? data.result : [];
  const tx = rows.find((r) => String(r.hash ?? "").toLowerCase() === hash.toLowerCase());
  if (!tx) return { ok: false, reason: "Transaction not found for this deposit address yet.", checkedAt: now };
  if (String(tx.to ?? "").toLowerCase() !== address.toLowerCase())
    return { ok: false, reason: "Transaction was not sent to our deposit address.", checkedAt: now };
  const d = Number(tx.tokenDecimal ?? decimals);
  const received = Number(tx.value ?? 0) / Math.pow(10, d);
  const confirmations = Number(tx.confirmations ?? 0);
  if (received + AMOUNT_TOLERANCE < expected)
    return { ok: false, reason: `Amount too low: received $${received.toFixed(2)}, expected $${expected.toFixed(2)}.`, receivedUsd: received, confirmations, checkedAt: now };
  if (confirmations < 5)
    return { ok: false, reason: `Only ${confirmations} confirmations — waiting for the network.`, receivedUsd: received, confirmations, checkedAt: now };
  return { ok: true, reason: "Verified on-chain.", receivedUsd: received, confirmations, checkedAt: now };
}

export async function verifyPayment(args: {
  network: NetworkId;
  txHash: string;
  address: string;
  expectedUsd: number;
}): Promise<VerifyResult> {
  const now = new Date().toISOString();
  if (!args.address) return { ok: false, reason: "Deposit address not configured.", checkedAt: now };
  try {
    if (args.network === "trc20") return await verifyTron(args.txHash, args.address, args.expectedUsd);
    if (args.network === "bep20")
      return await verifyEvm(56, BSC_USDT, 18, args.txHash, args.address, args.expectedUsd);
    return await verifyEvm(1, ETH_USDT, 6, args.txHash, args.address, args.expectedUsd);
  } catch (e) {
    return { ok: false, reason: `Auto-check unavailable (${(e as Error)?.message ?? "error"}) — sent for manual review.`, checkedAt: now };
  }
}
