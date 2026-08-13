/**
 * todayController — participant HTTP boundary for the Today Timeline v2 feed
 * (the never-ending engagement scroll). enrollmentId = req.participant.sub.
 * Flag-gated on env.todayFeedV2Enabled — 404 when off so the surface is dark by
 * default. Read path is no-store (per-student, always fresh cursor).
 */
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { env } from '../config/env';
import { getTodayPage, recordTodayInteraction } from '../services/timeline/todayFeedComposer';

function fail(res: Response, err: any, next: NextFunction) {
  if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input', issues: err.issues });
  if (err && typeof err.status === 'number') return res.status(err.status).json({ error: err.message });
  return next(err);
}
const eid = (req: Request) => req.participant!.sub;

export async function handleGetToday(req: Request, res: Response, next: NextFunction) {
  try {
    if (!env.todayFeedV2Enabled) return res.status(404).json({ error: 'Today feed not enabled' });
    const cursor = Math.max(0, parseInt(String(req.query.cursor ?? '0'), 10) || 0);
    const limit = Math.max(1, Math.min(30, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    // Per-visit seed reshuffles the lineup (client sends a fresh one each mount);
    // stable within a visit so pagination never repeats. Absent → natural order.
    const seedRaw = parseInt(String(req.query.seed ?? ''), 10);
    const seed = Number.isFinite(seedRaw) ? (seedRaw >>> 0) : undefined;
    res.set('Cache-Control', 'no-store');
    // Read-only "view as": render the feed but never log impressions for them.
    res.json(await getTodayPage(eid(req), cursor, limit, { readOnly: !!req.participant?.read_only, seed }));
  } catch (e) { fail(res, e, next); }
}

const interactSchema = z.object({ action: z.enum(['open', 'click', 'complete', 'dismiss']) });

export async function handleTodayInteract(req: Request, res: Response, next: NextFunction) {
  try {
    if (!env.todayFeedV2Enabled) return res.status(404).json({ error: 'Today feed not enabled' });
    const { action } = interactSchema.parse(req.body || {});
    res.json(await recordTodayInteraction(eid(req), String(req.params.cardRef), action));
  } catch (e) { fail(res, e, next); }
}
