import { Request, Response } from 'express';
import { isTimelineEngineEnabled } from '../services/timeline/timelineFlag';
import { initProgress, getFeed } from '../services/timeline/timelineService';
import { getProgressionSummary, onCardCompleted } from '../services/progression/progressionService';

/**
 * GET /api/portal/classroom — the Classroom timeline feed for the
 * authenticated student. Flag-gated: when the Timeline Engine is off for the
 * cohort, returns 404 so the frontend falls back to the legacy curriculum
 * surface. Idempotently ensures the student's progress rows exist, then
 * returns the composed feed.
 */
export async function handleGetClassroomFeed(req: Request, res: Response): Promise<void> {
  try {
    const enrollmentId = req.participant!.sub;
    const cohortId = req.participant!.cohort_id;

    if (!isTimelineEngineEnabled(cohortId)) {
      res.status(404).json({ error: 'timeline_engine_disabled', message: 'Classroom timeline is not enabled for this cohort yet.' });
      return;
    }

    // Read-only "view as": never create the viewer's progress rows. getFeed reads
    // fine without them (missing rows just render as their computed lock status).
    if (!req.participant?.read_only) await initProgress(enrollmentId);
    const feed = await getFeed(enrollmentId);
    const progression = await getProgressionSummary(enrollmentId);
    // The feed is per-student, live curriculum data — never let the browser or a
    // CDN serve a stale copy (a newly-published card must appear on next load).
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
    res.json({ ...feed, progression });
  } catch (err: any) {
    console.error('[timelineController] classroom feed failed', err?.message);
    res.status(500).json({ error: 'classroom_feed_failed', message: err?.message || 'unknown' });
  }
}

/**
 * POST /api/portal/classroom/cards/:cardId/complete — mark a card complete
 * and run the progression pipeline (Learning/Evidence -> Competency ->
 * promotion gate). Idempotent. Flag-gated.
 */
export async function handleCompleteCard(req: Request, res: Response): Promise<void> {
  try {
    const enrollmentId = req.participant!.sub;
    const cohortId = req.participant!.cohort_id;
    const cardId = req.params.cardId as string;

    if (!isTimelineEngineEnabled(cohortId)) {
      res.status(404).json({ error: 'timeline_engine_disabled' });
      return;
    }
    const outcome = await onCardCompleted(enrollmentId, cardId);
    res.json(outcome);
  } catch (err: any) {
    // Gate errors (e.g. the 75% watch requirement) carry a status + student-readable
    // message — pass them through instead of flattening to a 500.
    if (err && typeof err.status === 'number') {
      res.status(err.status).json({ error: err.message, code: err.code, watched_pct: err.watched_pct, required_pct: err.required_pct });
      return;
    }
    console.error('[timelineController] complete card failed', err?.message);
    res.status(500).json({ error: 'card_complete_failed', message: err?.message || 'unknown' });
  }
}
