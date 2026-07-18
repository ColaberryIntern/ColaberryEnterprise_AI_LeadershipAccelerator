import { Request, Response, NextFunction } from 'express';
import { getRevenueDashboard } from '../services/revenueDashboardService';
import { getRevenuePayments } from '../services/revenuePaymentsService';
import { syncPaymentLedger } from '../services/paymentLedgerService';

export async function handleGetRevenueDashboard(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await getRevenueDashboard();
    res.json(data);
  } catch (error) {
    next(error);
  }
}

// Unified "all payments" feed for the rebuilt /admin/revenue page:
// memberships + Open House deposits + refunds, with a summary that
// reconciles to the dashboard Revenue KPI.
export async function handleGetRevenuePayments(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await getRevenuePayments();
    res.json(data);
  } catch (error) {
    next(error);
  }
}

// Manual "Sync now" — pull the latest Accelerator payments from PaySimple into the
// ledger (records new payments, drops bounced/reversed ones out of revenue, creates
// member accounts for no-account payers). Idempotent; safe to click repeatedly.
export async function handleSyncPaymentLedger(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const dryRun = req.query.dryRun === 'true' || req.body?.dryRun === true;
    const summary = await syncPaymentLedger({ dryRun });
    res.json({ ok: true, summary });
  } catch (error) {
    next(error);
  }
}
