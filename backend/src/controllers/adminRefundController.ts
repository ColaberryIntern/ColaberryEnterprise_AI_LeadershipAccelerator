import { Request, Response } from 'express';
import { issueRefund, lookupPayment, listRefunds } from '../services/refundService';

const STATUS_BY_REASON: Record<string, number> = {
  billing_unconfigured: 503,
  payment_not_found: 404,
  already_reversed: 409,
  invalid_amount: 400,
  paysimple_error: 502,
};

/** GET /api/admin/refunds — recent refunds. */
export async function handleListRefunds(req: Request, res: Response) {
  const limit = Number(req.query.limit) || 100;
  const refunds = await listRefunds(limit);
  res.json({ refunds });
}

/** GET /api/admin/refunds/lookup?payment_id=... — preview a payment before refunding. */
export async function handleLookupPayment(req: Request, res: Response) {
  const paymentId = String(req.query.payment_id || '').trim();
  if (!paymentId) return res.status(400).json({ error: 'payment_id is required' });
  const result = await lookupPayment(paymentId);
  if (!result.ok) return res.status(STATUS_BY_REASON[result.reason] ?? 400).json({ error: result.reason });
  res.json(result.payment);
}

/** POST /api/admin/refunds — issue a refund/void. Body: { payment_id, amount?, reason? }. */
export async function handleCreateRefund(req: Request, res: Response) {
  const paymentId = String(req.body?.payment_id || '').trim();
  if (!paymentId) return res.status(400).json({ error: 'payment_id is required' });

  let amountCents: number | undefined;
  if (req.body?.amount != null && req.body.amount !== '') {
    const amt = Number(req.body.amount);
    if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'amount must be a positive number of dollars' });
    amountCents = Math.round(amt * 100);
  }

  const result = await issueRefund({
    paymentId,
    amountCents,
    reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
    issuedBy: req.admin?.email,
  });

  if (!result.ok) {
    return res.status(STATUS_BY_REASON[result.reason ?? 'paysimple_error'] ?? 400).json({ error: result.reason, message: result.message });
  }
  res.status(201).json({ refund: result.refund });
}
