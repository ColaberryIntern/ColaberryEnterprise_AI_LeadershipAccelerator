import type { Request, Response } from 'express';
import { z } from 'zod';
import { dismissLearnerNudge, listLearnerNudges, type LearnerNudge } from '../services/growthJourney/execution/nudgeReadService';
import { classifyError } from '../utils/errorClassifier';

/**
 * The learner's nudges on the portal dashboard (Phase 5 T514): two handlers
 * behind `requireParticipant`. The caller is the token's enrolment and nothing
 * else - no id in the request names whose nudges these are - so another
 * learner's nudge is unreachable by construction, and a dismiss of any id that
 * is not the caller's own live nudge is a 404 with nothing changed.
 *
 * The response is the four-field learner view, declared here and checked at
 * the boundary before it is sent: a row leaking past the service would fail
 * the strict schema, and that is logged rather than shipped.
 */

const nudgeIdParam = z.object({ id: z.string().uuid() });

export const learnerNudgeSchema = z.object({
  id: z.string(),
  title: z.string(),
  href: z.string().nullable(),
  purpose: z.string().nullable(),
}).strict();
export const learnerNudgesResponseSchema = z.array(learnerNudgeSchema);

const enrollmentOf = (req: Request): string | null => {
  const participant = (req as Request & { participant?: { sub?: string; read_only?: boolean } }).participant;
  return participant?.sub ?? null;
};

const logFailure = (event: string, err: unknown, context: Record<string, unknown>): void => {
  console.error(JSON.stringify({ level: 'error', service: 'growth-journey', event, outcome: 'failure', error_class: classifyError(err), context }));
};

export async function listJourneyNudges(req: Request, res: Response): Promise<void> {
  const enrollmentId = enrollmentOf(req);
  if (!enrollmentId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const readOnly = Boolean((req as Request & { participant?: { read_only?: boolean } }).participant?.read_only);
  try {
    const nudges: LearnerNudge[] = await listLearnerNudges({ enrollmentId, asOf: new Date(), readOnly });
    const checked = learnerNudgesResponseSchema.safeParse(nudges);
    if (!checked.success) {
      // The contract, not the data: the service maps to four fields, so this can only be a code change. Fail loud.
      logFailure('growth_journey.nudges.response_shape', checked.error, { enrollment_id: enrollmentId, issues: checked.error.issues.length });
      res.status(500).json({ error: 'Response shape violation' });
      return;
    }
    res.json(checked.data);
  } catch (err: unknown) {
    logFailure('growth_journey.nudges.list_failed', err, { enrollment_id: enrollmentId });
    res.status(500).json({ error: 'Failed to load nudges' });
  }
}

export async function dismissJourneyNudge(req: Request, res: Response): Promise<void> {
  const enrollmentId = enrollmentOf(req);
  if (!enrollmentId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const params = nudgeIdParam.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: 'Invalid nudge id' });
    return;
  }
  try {
    const result = await dismissLearnerNudge({ enrollmentId, nudgeId: params.data.id, asOf: new Date() });
    if (result === 'not_found') {
      res.status(404).json({ error: 'Nudge not found' });
      return;
    }
    res.json({ dismissed: true });
  } catch (err: unknown) {
    logFailure('growth_journey.nudges.dismiss_failed', err, { enrollment_id: enrollmentId, nudge_id: params.data.id });
    res.status(500).json({ error: 'Failed to dismiss nudge' });
  }
}
