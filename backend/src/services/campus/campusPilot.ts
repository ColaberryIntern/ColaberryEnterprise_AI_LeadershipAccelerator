import type { Request } from 'express';
import { env } from '../../config/env';
import { campusEnabledFor } from './campusFlag';

/**
 * C1's per-enrollment pilot rule, as a request check shared by every campus surface (the campus routes and, since C10, the Game Room
 * routes). Reads CAMPUS_ENABLED / CAMPUS_ENROLLMENT_IDS / CAMPUS_COHORT_IDS through env; the enrollment comes only from the token.
 */
export function campusOnFor(req: Request): boolean {
  const p = req.participant;
  return campusEnabledFor(
    { enrollmentId: p?.sub, cohortId: p?.cohort_id },
    { mode: env.campusEnabled, enrollmentIds: env.campusEnrollmentIds, cohortIds: env.campusCohortIds },
  );
}
