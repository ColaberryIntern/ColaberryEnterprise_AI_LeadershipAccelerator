import type { Request, Response } from 'express';
import { z } from 'zod';
import { campusOnFor } from '../services/campus/campusPilot';
import { getMyProgress } from '../services/campus/myProgressService';
import { MAX_SKILLS } from '../services/campus/myProgressModel';

/**
 * C120: GET /api/portal/campus/my-progress - the My Progress room's celebration of the signed-in learner. Read-only; the
 * enrollment comes ONLY from the token (req.participant.sub), there is no query or body input. Campus pilot only, like every
 * other campus route. Read-only "view as" tokens may call it (a GET), so an admin viewing a learner sees that learner's screen.
 *
 * Errors: 401 no token (requireParticipant), 403 campus off, 404 the token's enrollment no longer exists, 500 any read failure
 * (a generic message; the error class is logged, never the data).
 *
 * The response schema is STRICT, so the privacy rule is also a contract: a background with a phone, location or full name in it
 * fails validation (loud in development and test).
 */
const Str = (max: number) => z.string().min(1).max(max);
const Iso = z.string().max(40);
export const MyProgressResponse = z.object({
  firstName: Str(120).nullable(),
  week: z.object({
    current: z.number().int().min(1), total: z.number().int().min(1), cohortName: Str(120).nullable(),
    cardsDoneThisWeek: z.number().int().nonnegative(), cardsThisWeek: z.number().int().nonnegative(),
  }).strict().nullable(),
  points: z.object({
    total: z.number().int().nonnegative(), level: z.number().int().min(1).nullable(), levelName: Str(120).nullable(),
    builder: z.number().int().nonnegative(), learning: z.number().int().nonnegative(), community: z.number().int().nonnegative(),
  }).strict(),
  latestWin: z.object({ title: Str(240), date: Iso }).strict().nullable(),
  milestones: z.object({
    earned: z.array(z.object({ key: Str(200), label: Str(120), date: Iso.nullable() }).strict()).max(50),
    next: z.object({ key: Str(60), label: Str(120), detail: Str(200) }).strict().nullable(),
  }).strict(),
  background: z.object({
    title: Str(120).nullable(), company: Str(120).nullable(), industry: Str(120).nullable(), years: Str(40).nullable(),
    skills: z.array(Str(60)).max(MAX_SKILLS), education: Str(240).nullable(),
  }).strict().nullable(),
  goal: Str(240).nullable(),
  hasResume: z.boolean(),
}).strict();
export type MyProgressResponse = z.infer<typeof MyProgressResponse>;

type Send = <T>(res: Response, schema: z.ZodType<T>, body: T, event: string) => void;
type Log = (event: string, err: unknown) => void;

/** Built with the router's own send/log helpers (campusRoutes.sendValidated / logFailure), so this file has no cycle back to it. */
export function myProgressRoute(sendValidated: Send, logFailure: Log) {
  return async (req: Request, res: Response): Promise<void> => {
    if (!campusOnFor(req)) { res.status(403).json({ error: 'The campus is not enabled for this account', error_class: 'CampusNotEnabled' }); return; }
    try {
      sendValidated(res, MyProgressResponse, await getMyProgress(req.participant!.sub), 'campus_my_progress');
    } catch (err) {
      const e = err as { name?: string; error_class?: string };
      if (e?.name === 'MyProgressError' && e.error_class === 'EnrollmentNotFound') {
        res.status(404).json({ error: 'No enrollment for this account', error_class: 'EnrollmentNotFound' }); return;
      }
      logFailure('campus_my_progress_failed', err);
      res.status(500).json({ error: 'Could not load your progress', error_class: 'MyProgressUnavailable' });
    }
  };
}
