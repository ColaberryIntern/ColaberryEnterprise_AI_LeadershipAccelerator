import api from '../utils/api';

// Unified "all payments" feed for /admin/revenue — memberships + Open House
// deposits + refunds merged server-side, with a summary that reconciles to the
// dashboard Revenue KPI.

export interface RevenueTransaction {
  id: string;
  date: string | null; // ISO
  payer_name: string;
  payer_email: string;
  type: 'membership' | 'deposit' | 'refund';
  plan: string | null;
  amount: number; // dollars; refunds negative
  status: string;
  paysimple_payment_id: string | null;
  refundable: boolean; // eligible to reverse (show the button)
  refundable_now: boolean; // can be actioned right now (void window open OR settled)
  refund_method: 'void' | 'refund' | null; // how it would reverse right now
  settles_on: string | null; // ISO — when a not-yet-settled payment becomes refundable
  counted: boolean;
  enrollment_id: string | null;
}

export interface RevenueSummary {
  collected: number;
  memberships: number;
  deposits: number;
  refunds: number;
  net: number;
  membershipCount: number;
  depositAvailableCount: number;
  depositAppliedCount: number;
  refundCount: number;
}

export async function getRevenuePayments(): Promise<{ summary: RevenueSummary; transactions: RevenueTransaction[] }> {
  const { data } = await api.get('/api/admin/revenue/payments');
  return data;
}

export interface LedgerSyncSummary {
  scanned: number;
  accelerator: number;
  inserted: number;
  updated: number;
  unchanged: number;
  accountsCreated: number;
  liveCount: number;
  deadCount: number;
  liveTotalCents: number;
}

// Pull the latest Accelerator payments from PaySimple into the ledger (idempotent).
export async function syncPayments(): Promise<{ ok: boolean; summary: LedgerSyncSummary }> {
  const { data } = await api.post('/api/admin/revenue/sync');
  return data;
}
