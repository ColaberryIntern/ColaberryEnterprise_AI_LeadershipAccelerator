import { Request, Response, NextFunction } from 'express';
import { getRevenueDashboard } from '../services/revenueDashboardService';
import { getRevenuePayments } from '../services/revenuePaymentsService';

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
