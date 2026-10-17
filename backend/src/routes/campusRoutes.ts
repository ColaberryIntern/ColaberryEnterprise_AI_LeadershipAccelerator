import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireParticipant } from '../middlewares/participantAuth';
import { env } from '../config/env';
import { campusEnabledFor } from '../services/campus/campusFlag';
import { isCampusArea } from '../services/campus/campusAreas';
import { touchCampusArea, getCampusPresence } from '../services/campus/campusPresenceService';

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
function sendValidated<T>(res: Response, schema: z.ZodType<T>, body: T, event: string): void {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    if (process.env.NODE_ENV !== 'production') throw new Error(`ContractViolation: ${event} ` + parsed.error.message);
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', service: 'backend', event: `${event}_contract_violation`,
      outcome: 'failure', error_class: 'ContractViolation', context: { issues: parsed.error.issues.length } }));
  }
  res.json(body);
}

function logFailure(event: string, err: unknown): void {
  const e = err as { name?: string; error_class?: string; message?: string };
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', service: 'backend', event, outcome: 'failure',
    error_class: e?.error_class ?? e?.name ?? 'UnknownError', context: { message: String(e?.message ?? '').slice(0, 200) } }));
}

/** C1's per-enrollment pilot rule, shared by every campus endpoint. */
function campusOnFor(req: Request): boolean {
  const p = req.participant;
  return campusEnabledFor(
    { enrollmentId: p?.sub, cohortId: p?.cohort_id },
    { mode: env.campusEnabled, enrollmentIds: env.campusEnrollmentIds, cohortIds: env.campusCohortIds },
  );
}

export function getCampusFlags(req: Request, res: Response): void {
  sendValidated(res, CampusFlagsResponse, { campus: campusOnFor(req) }, 'campus_flags');
}

// ---- C4: presence by building ----
const HereBody = z.object({ area: z.string().min(1).max(32) }).strict();
const PersonSchema = z.object({ enrollment_id: z.string(), display_name: z.string(), avatar_url: z.string().nullable() }).strict();
const EntrySchema = z.union([PersonSchema, z.object({ anonymous: z.literal(true) }).strict()]);
export const CampusPresenceResponse = z.object({
  areas: z.record(z.string(), z.object({ count: z.number().int().nonnegative(), people: z.array(EntrySchema) }).strict()),
}).strict();

/**
 * POST /api/portal/campus/here {area} - "I am in this building now". Its own endpoint, so the
 * community heartbeat is never affected by a bad area. Not in the pilot: 204, nothing written.
 * The enrollment comes ONLY from the token (req.participant.sub); the body cannot set it.
 */
export async function postCampusHere(req: Request, res: Response): Promise<void> {
  const parsed = HereBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: 'Invalid body', error_class: 'ValidationFailed' }); return; }
  if (!campusOnFor(req)) { res.status(204).end(); return; }
  if (!isCampusArea(parsed.data.area)) { res.status(400).json({ error: 'Unknown campus area', error_class: 'UnknownCampusArea' }); return; }
  try {
    await touchCampusArea(req.participant!.sub, parsed.data.area);
    res.status(204).end();
  } catch (err) {
    logFailure('campus_here_failed', err);
    res.status(500).json({ error: 'Could not record campus presence', error_class: 'CampusPresenceUnavailable' });
  }
}

/** GET /api/portal/campus/presence - who is in each building now (pilot only). */
export async function getCampusPresenceRoute(req: Request, res: Response): Promise<void> {
  if (!campusOnFor(req)) { res.status(403).json({ error: 'The campus is not enabled for this account', error_class: 'CampusNotEnabled' }); return; }
  try {
    const body = await getCampusPresence(req.participant!.sub, req.participant!.cohort_id ?? null);
    sendValidated(res, CampusPresenceResponse, body as z.infer<typeof CampusPresenceResponse>, 'campus_presence');
  } catch (err) {
    logFailure('campus_presence_failed', err);
    res.status(500).json({ error: 'Could not load campus presence', error_class: 'CampusPresenceUnavailable' });
  }
}

const router = Router();
router.get('/api/portal/campus/flags', requireParticipant, getCampusFlags);
router.post('/api/portal/campus/here', requireParticipant, postCampusHere);
router.get('/api/portal/campus/presence', requireParticipant, getCampusPresenceRoute);

export default router;
