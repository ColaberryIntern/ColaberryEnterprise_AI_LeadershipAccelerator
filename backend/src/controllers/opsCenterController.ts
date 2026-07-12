/**
 * opsCenterController — HTTP boundary for the AI Operations Center (School
 * Intelligence Platform). Admin-only. Namespaced under /api/admin/school to
 * avoid the pre-existing /api/admin/ops (Basecamp ops) routes.
 */
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { homePayload, getHealth, getDirectors, listWorkQueue, updateRecommendation, search } from '../services/ops/opsService';
import { simulateRemoval } from '../services/ops/digitalTwin';

function fail(res: Response, err: any, next: NextFunction) {
  if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input', issues: err.issues });
  if (err && typeof err.status === 'number') return res.status(err.status).json({ error: err.message });
  return next(err);
}

export async function handleHome(_req: Request, res: Response, next: NextFunction) {
  try { res.json(await homePayload()); } catch (e) { fail(res, e, next); }
}
export async function handleHealth(_req: Request, res: Response, next: NextFunction) {
  try { res.json(await getHealth()); } catch (e) { fail(res, e, next); }
}
export async function handleDirectors(_req: Request, res: Response, next: NextFunction) {
  try { res.json(await getDirectors()); } catch (e) { fail(res, e, next); }
}
export async function handleWorkQueue(req: Request, res: Response, next: NextFunction) {
  try { res.json({ items: await listWorkQueue(typeof req.query.status === 'string' ? req.query.status : undefined) }); } catch (e) { fail(res, e, next); }
}
const updateSchema = z.object({ status: z.enum(['open', 'approved', 'rejected', 'assigned', 'done']).optional(), assigned_to: z.string().nullable().optional() });
export async function handleUpdateWorkItem(req: Request, res: Response, next: NextFunction) {
  try { res.json(await updateRecommendation(String(req.params.id), updateSchema.parse(req.body || {}))); } catch (e) { fail(res, e, next); }
}
const twinSchema = z.object({ type: z.string().min(1) });
export async function handleTwinSimulate(req: Request, res: Response, next: NextFunction) {
  try { res.json(simulateRemoval(twinSchema.parse(req.body || {}).type)); } catch (e) { fail(res, e, next); }
}
export async function handleSearch(req: Request, res: Response, next: NextFunction) {
  try { res.json(await search(String(req.query.q || ''))); } catch (e) { fail(res, e, next); }
}
