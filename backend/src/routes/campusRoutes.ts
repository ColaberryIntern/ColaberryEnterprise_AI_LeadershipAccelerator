import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireParticipant } from '../middlewares/participantAuth';
import { env } from '../config/env';
import { campusEnabledFor } from '../services/campus/campusFlag';

/**
 * Colaberry Campus learner endpoints (Basecamp C1 onward). Mounted with the
 * other learner-portal routers in `mountLearnerPortalRoutes`, above
 * `adminRoutes`. Every route is participant-authed per route, never via an
 * unscoped `router.use`, so this router cannot guard anyone else's paths.
 *
 * C1 ships one route: whether the campus is on for THIS participant. It is
 * separate from the public, global `GET /api/portal/flags` on purpose - that
 * endpoint cannot know who is asking, and the campus pilot is per enrollment
 * or per cohort.
 *
 * Read-only "view as member" tokens may call it (GET), so an admin viewing a
 * learner sees the navigation that learner sees.
 */

export const CampusFlagsResponse = z.object({ campus: z.boolean() }).strict();
export type CampusFlagsResponse = z.infer<typeof CampusFlagsResponse>;

/**
 * Validate the outbound shape at the boundary: fail loud in development and
 * test, log and continue in production (CLAUDE.md Contract Enforcement).
 */
function sendValidated(res: Response, body: CampusFlagsResponse): void {
  const parsed = CampusFlagsResponse.safeParse(body);
  if (!parsed.success) {
    if (process.env.NODE_ENV !== 'production') throw new Error('ContractViolation: campus flags response ' + parsed.error.message);
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', service: 'backend', event: 'campus_flags_contract_violation',
      outcome: 'failure', error_class: 'ContractViolation', context: { issues: parsed.error.issues.length } }));
  }
  res.json(body);
}

export function getCampusFlags(req: Request, res: Response): void {
  const p = req.participant;
  const campus = campusEnabledFor(
    { enrollmentId: p?.sub, cohortId: p?.cohort_id },
    { mode: env.campusEnabled, enrollmentIds: env.campusEnrollmentIds, cohortIds: env.campusCohortIds },
  );
  sendValidated(res, { campus });
}

const router = Router();
router.get('/api/portal/campus/flags', requireParticipant, getCampusFlags);

export default router;
