/**
 * workforceController — HTTP boundary for the AI Workforce Operating System.
 * Admin-only, /api/admin/workforce/*.
 */
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  roster, office, briefing, runDailyMeeting, listMeetings,
  listTasks, createTask, updateTask, listMessages, review, analytics,
} from '../services/workforce/workforceService';

function fail(res: Response, err: any, next: NextFunction) {
  if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input', issues: err.issues });
  if (err && typeof err.status === 'number') return res.status(err.status).json({ error: err.message });
  return next(err);
}

export async function handleRoster(_req: Request, res: Response, next: NextFunction) {
  try { res.json(await roster()); } catch (e) { fail(res, e, next); }
}
export async function handleOffice(req: Request, res: Response, next: NextFunction) {
  try { res.json(await office(String(req.params.slug))); } catch (e) { fail(res, e, next); }
}
export async function handleBriefing(_req: Request, res: Response, next: NextFunction) {
  try { res.json(await briefing()); } catch (e) { fail(res, e, next); }
}
export async function handleDailyMeeting(_req: Request, res: Response, next: NextFunction) {
  try { res.json(await runDailyMeeting()); } catch (e) { fail(res, e, next); }
}
export async function handleMeetings(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ meetings: await listMeetings() }); } catch (e) { fail(res, e, next); }
}
export async function handleListTasks(req: Request, res: Response, next: NextFunction) {
  try { res.json({ tasks: await listTasks(typeof req.query.status === 'string' ? req.query.status : undefined) }); } catch (e) { fail(res, e, next); }
}
const createSchema = z.object({ employee_slug: z.string().min(1), title: z.string().min(1), description: z.string().optional(), priority: z.enum(['low', 'medium', 'high']).optional(), deadline: z.string().nullable().optional() });
export async function handleCreateTask(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json(await createTask(createSchema.parse(req.body || {}))); } catch (e) { fail(res, e, next); }
}
export async function handleUpdateTask(req: Request, res: Response, next: NextFunction) {
  try { res.json(await updateTask(String(req.params.id), String(req.body?.status))); } catch (e) { fail(res, e, next); }
}
export async function handleMessages(_req: Request, res: Response, next: NextFunction) {
  try { res.json({ messages: await listMessages() }); } catch (e) { fail(res, e, next); }
}
export async function handleReview(req: Request, res: Response, next: NextFunction) {
  try { res.json(await review(String(req.params.slug))); } catch (e) { fail(res, e, next); }
}
export async function handleAnalytics(_req: Request, res: Response, next: NextFunction) {
  try { res.json(await analytics()); } catch (e) { fail(res, e, next); }
}
