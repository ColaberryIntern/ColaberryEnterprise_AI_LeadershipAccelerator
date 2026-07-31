import { Request, Response, NextFunction } from 'express';
import { getRevenueDashboard } from '../services/revenueDashboardService';
import { getRevenuePayments } from '../services/revenuePaymentsService';
import { reconcileAppPayments } from '../services/appPaymentReconcileService';
import { getSubscriptionAnalytics } from '../services/subscriptionAnalyticsService';
import { getExplorerRoster } from '../services/explorerRosterService';

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

// Subscription analytics for /admin/revenue: MRR/ARR, plan mix, upcoming
// renewals, the tenure funnel, and the lapsed/failed "needs attention" list.
export async function handleGetSubscriptionAnalytics(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await getSubscriptionAnalytics();
    res.json(data);
  } catch (error) {
    next(error);
  }
}

// Drill-down roster behind the "Explorer" tenure bucket: everyone still in
// free trial, tagged with their existing points-based engagement level.
export async function handleGetExplorerRoster(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await getExplorerRoster();
    res.json({ explorers: data });
  } catch (error) {
    next(error);
  }
}

// Heal missed-webhook membership payments: for OUR checkout customers whose
// enrollment is still unpaid, find + link their live PaySimple membership payment.
// Scoped to our stored customer ids only. Idempotent; safe to run repeatedly.
// `?dryRun=true` reports what would link without writing.
export async function handleReconcileAppPayments(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const dryRun = req.query.dryRun === 'true' || req.body?.dryRun === true;
    const summary = await reconcileAppPayments({ dryRun });
    res.json({ ok: true, summary });
  } catch (error) {
    next(error);
  }
}
