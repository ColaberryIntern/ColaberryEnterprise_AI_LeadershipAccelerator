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
  refundable: boolean;
  counted: boolean;
  enrollment_id: string | null; // -> student profile (/admin/accelerator?enrollment=)
  lead_id: number | null; // -> lead profile (/admin/leads/:id)
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
