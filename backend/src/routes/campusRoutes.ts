import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireParticipant } from '../middlewares/participantAuth';
import { campusOnFor } from '../services/campus/campusPilot';
import { isCampusArea } from '../services/campus/campusAreas';
import { touchCampusArea, getCampusPresence } from '../services/campus/campusPresenceService';
import { getStaffDesks } from '../services/campus/campusStaffDesks';
import { waveAt } from '../services/campus/campusWave';
import { campusAudienceFor } from '../services/campus/campusAudience';
import { requestTourHandoff } from '../services/campus/campusTourHandoff';
import { getLook, setLook } from '../services/campus/campusLookService';
import { GEAR_SLOTS } from '../services/campus/campusUnlocks';

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

// C1's per-enrollment pilot rule lives in services/campus/campusPilot.ts (shared with the Game Room routes, C10).

export function getCampusFlags(req: Request, res: Response): void {
  sendValidated(res, CampusFlagsResponse, { campus: campusOnFor(req) }, 'campus_flags');
}

// ---- C4: presence by building ----
const HereBody = z.object({ area: z.string().min(1).max(32) }).strict();
// C9: gear others may see is a STRICT object of the four public slots: the response contract itself refuses a ride.
const PublicGearSchema = z.object({ head: z.string(), face: z.string(), body: z.string(), neck: z.string() }).partial().strict();
const PersonSchema = z.object({
  enrollment_id: z.string(), display_name: z.string(), avatar_url: z.string().nullable(), can_message: z.boolean(),
  rung_name: z.string().optional(), gear: PublicGearSchema.optional(),
}).strict();
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

// ---- C5: AI staff desks ----
const DeskSchema = z.object({
  id: z.enum(['reese', 'dara', 'maya']), name: z.string(), title: z.string(), building: z.string(), ai: z.literal(true),
  on_duty: z.boolean(), enrollment_id: z.string().nullable(), opens: z.string().nullable(), prompts: z.array(z.string()).max(5),
}).strict();
export const StaffDesksResponse = z.object({ desks: z.array(DeskSchema).max(3) }).strict();

/** GET /api/portal/campus/staff-desks - the AI staff desks this viewer may see (pilot only). The audience is decided
 *  here, from the same sources as the frontend; the response carries only the desks, not the audience. */
export async function getStaffDesksRoute(req: Request, res: Response): Promise<void> {
  if (!campusOnFor(req)) { res.status(403).json({ error: 'The campus is not enabled for this account', error_class: 'CampusNotEnabled' }); return; }
  try {
    const { desks } = await getStaffDesks(req.participant!.sub);
    sendValidated(res, StaffDesksResponse, { desks } as z.infer<typeof StaffDesksResponse>, 'campus_staff_desks');
  } catch (err) {
    logFailure('campus_staff_desks_failed', err);
    res.status(500).json({ error: 'Could not load the staff desks', error_class: 'CampusStaffDesksUnavailable' });
  }
}

// ---- C5: wave (an ordinary DM, idempotent by room state; see campusWave.ts) ----
const WaveBody = z.object({ to: z.string().uuid() }).strict();
export const WaveResponse = z.object({ sent: z.boolean(), reason: z.enum(['sent', 'already_waved']), roomId: z.string() }).strict();

/** POST /api/portal/campus/wave {to} - pilot only. The sender comes ONLY from the token; read-only "view as" tokens
 *  are refused for every POST by requireParticipant. The DM rule refusal keeps its usual text (400 DmNotAllowed). */
export async function postWaveRoute(req: Request, res: Response): Promise<void> {
  const parsed = WaveBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: 'Invalid body', error_class: 'ValidationFailed' }); return; }
  if (!campusOnFor(req)) { res.status(403).json({ error: 'The campus is not enabled for this account', error_class: 'CampusNotEnabled' }); return; }
  try {
    const result = await waveAt(req.participant!.sub, req.participant!.cohort_id ?? null, parsed.data.to);
    sendValidated(res, WaveResponse, result, 'campus_wave');
  } catch (err) {
    const e = err as { name?: string; message?: string; error_class?: string };
    if (e?.name === 'DmError') { res.status(400).json({ error: e.message, error_class: 'DmNotAllowed' }); return; }
    if (e?.name === 'WaveError') { res.status(400).json({ error: e.message, error_class: e.error_class }); return; }
    logFailure('campus_wave_failed', err);
    res.status(500).json({ error: 'Could not send the wave', error_class: 'CampusWaveUnavailable' });
  }
}

// ---- C7: the Explorer tour's opt-in admissions handoff (see campusTourHandoff.ts) ----
const TourCompleteBody = z.object({ tour: z.literal('explorer') }).strict();
export const TourCompleteResponse = z.object({
  handoff: z.boolean(),
  reason: z.enum(['created', 'already_open', 'closed', 'disabled', 'unavailable']),
}).strict();

/** POST /api/portal/campus/tour/complete {tour:'explorer'} - the "Have admissions reach out to me" click (Ali: the click is the
 *  consent). Pilot only; Explorers only (the same audience rule the campus uses); the subject comes ONLY from the token. Read-only
 *  "view as" tokens are refused for every POST by requireParticipant. A failing audience lookup writes nothing (500). */
export async function postTourCompleteRoute(req: Request, res: Response): Promise<void> {
  const parsed = TourCompleteBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: 'Invalid body', error_class: 'ValidationFailed' }); return; }
  if (!campusOnFor(req)) { res.status(403).json({ error: 'The campus is not enabled for this account', error_class: 'CampusNotEnabled' }); return; }
  const enrollmentId = req.participant!.sub;
  let audience: string;
  try {
    audience = await campusAudienceFor(enrollmentId);
  } catch (err) {
    logFailure('campus_tour_audience_failed', err);
    res.status(500).json({ error: 'Could not check this account', error_class: 'CampusAudienceUnavailable' });
    return;
  }
  if (audience !== 'explorer') { res.status(403).json({ error: 'Only Explorer accounts can ask admissions from the tour', error_class: 'NotExplorer' }); return; }
  sendValidated(res, TourCompleteResponse, await requestTourHandoff(enrollmentId), 'campus_tour_complete');
}

// ---- C9: My look (earned gear; see campusUnlocks.ts and campusLookService.ts) ----
const SlotEnum = z.enum(GEAR_SLOTS);
/** The COMPLETE equipped set: a slot not present means nothing worn there. At most one entry per slot. */
const ItemId = z.string().max(40).nullable();
const LookBody = z.object({ equipped: z.object({ head: ItemId, face: ItemId, body: ItemId, neck: ItemId, ride: ItemId }).partial().strict() }).strict();
const EquippedSchema = z.object({ head: z.string(), face: z.string(), body: z.string(), neck: z.string(), ride: z.string() }).partial().strict();
export const LookResponse = z.object({
  points: z.number().int().nonnegative(),
  rung_name: z.string(),
  catalog: z.array(z.object({ id: z.string(), name: z.string(), slot: SlotEnum, threshold: z.number().int(), unlocked: z.boolean() }).strict()),
  equipped: EquippedSchema,
}).strict();

const notEnabled = (res: Response) => res.status(403).json({ error: 'The campus is not enabled for this account', error_class: 'CampusNotEnabled' });

/** GET /api/portal/campus/look - my points, level, the gear catalog with what I have earned, and what I wear. Pilot only. */
export async function getLookRoute(req: Request, res: Response): Promise<void> {
  if (!campusOnFor(req)) { notEnabled(res); return; }
  try {
    sendValidated(res, LookResponse, await getLook(req.participant!.sub), 'campus_look');
  } catch (err) {
    logFailure('campus_look_failed', err);
    res.status(500).json({ error: 'Could not load your look', error_class: 'CampusLookUnavailable' });
  }
}

/** PUT /api/portal/campus/look {equipped} - save the complete set. Checked against server-side points at write time; the
 *  enrollment comes ONLY from the token; read-only "view as" tokens are refused by requireParticipant. One upsert per learner. */
export async function putLookRoute(req: Request, res: Response): Promise<void> {
  const parsed = LookBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: 'Invalid body', error_class: 'ValidationFailed' }); return; }
  if (!campusOnFor(req)) { notEnabled(res); return; }
  try {
    sendValidated(res, LookResponse, await setLook(req.participant!.sub, parsed.data.equipped), 'campus_look_saved');
  } catch (err) {
    const e = err as { name?: string; message?: string; error_class?: string };
    if (e?.name === 'GearError') { res.status(400).json({ error: e.message, error_class: e.error_class }); return; }
    logFailure('campus_look_save_failed', err);
    res.status(500).json({ error: 'Could not save your look', error_class: 'CampusLookUnavailable' });
  }
}

const router = Router();
router.get('/api/portal/campus/flags', requireParticipant, getCampusFlags);
router.post('/api/portal/campus/here', requireParticipant, postCampusHere);
router.get('/api/portal/campus/presence', requireParticipant, getCampusPresenceRoute);
router.get('/api/portal/campus/staff-desks', requireParticipant, getStaffDesksRoute);
router.post('/api/portal/campus/wave', requireParticipant, postWaveRoute);
router.post('/api/portal/campus/tour/complete', requireParticipant, postTourCompleteRoute);
router.get('/api/portal/campus/look', requireParticipant, getLookRoute);
router.put('/api/portal/campus/look', requireParticipant, putLookRoute);

export default router;
