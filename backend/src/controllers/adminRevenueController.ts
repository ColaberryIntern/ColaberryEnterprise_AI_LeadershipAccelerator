import { Request, Response, NextFunction } from 'express';
import { getRevenueDashboard } from '../services/revenueDashboardService';
import { getRevenuePayments } from '../services/revenuePaymentsService';
import { reconcileAppPayments } from '../services/appPaymentReconcileService';
import {
  getSubscriptionAnalytics,
  getTenureBucketRoster,
  getPlanRoster,
  getDepositHolderRoster,
  SubscriptionPlanKey,
} from '../services/subscriptionAnalyticsService';
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

// Drill-down roster for one Month-N tenure bucket (1-based; 5 means "Month 5+").
export async function handleGetTenureBucketRoster(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const month = Number(req.params.month);
    if (!Number.isInteger(month) || month < 1 || month > 5) {
      res.status(400).json({ error: 'month must be an integer between 1 and 5' });
      return;
    }
    const data = await getTenureBucketRoster(month);
    res.json({ members: data });
  } catch (error) {
    next(error);
  }
}

const KNOWN_PLANS: SubscriptionPlanKey[] = ['annual', 'monthly', 'comp', 'deposit_holder', 'other'];

// Drill-down roster for one plan category ("just the Annual people", etc.),
// across every tenure month — behind each row of "Subscribers by plan".
export async function handleGetPlanRoster(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const plan = req.params.plan as SubscriptionPlanKey;
    if (!KNOWN_PLANS.includes(plan)) {
      res.status(400).json({ error: `plan must be one of ${KNOWN_PLANS.join(', ')}` });
      return;
    }
    const data = plan === 'deposit_holder' ? await getDepositHolderRoster() : await getPlanRoster(plan);
    res.json({ members: data });
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
