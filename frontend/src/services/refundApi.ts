import api from '../utils/api';

// Admin refunds. Look up a PaySimple payment, then issue a refund/void; the
// backend records it and voids any account credit the payment had granted.

export interface PaymentLookup {
  id: string;
  status: string;
  amount_cents: number;
  refundable_cents: number;
  method: 'refund' | 'void';
  email: string | null;
  name: string;
}

export interface RefundRow {
  id: string;
  paysimple_payment_id: string;
  paysimple_refund_id: string | null;
  amount_cents: number;
  method: 'refund' | 'void';
  status: 'pending' | 'succeeded' | 'failed';
  reason: string | null;
  customer_email: string | null;
  voided_credit_cents: number;
  issued_by: string | null;
  error: string | null;
  created_at: string;
}

export async function lookupPayment(paymentId: string): Promise<PaymentLookup> {
  const { data } = await api.get('/api/admin/refunds/lookup', { params: { payment_id: paymentId } });
  return data;
}

export async function issueRefund(body: { payment_id: string; amount?: number; reason?: string }): Promise<{ refund: RefundRow }> {
  const { data } = await api.post('/api/admin/refunds', body);
  return data;
}

export async function listRefunds(): Promise<RefundRow[]> {
  const { data } = await api.get('/api/admin/refunds');
  return data.refunds || [];
}
