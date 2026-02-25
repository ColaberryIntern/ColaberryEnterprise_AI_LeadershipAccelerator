import { Request, Response, NextFunction } from 'express';
import { getRevenueDashboard } from '../services/revenueDashboardService';

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
