import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireParticipant } from '../middlewares/participantAuth';
import { campusOnFor } from '../services/campus/campusPilot';
import { Enrollment } from '../models';
import {
  ADMISSIONS_TOPICS, NOTE_MAX, AdmissionsConflict, admissionsSlots, bookAdmissionsCall, cancelAdmissionsCall, upcomingAdmissionsCall,
} from '../services/campus/campusAdmissionsCall';
import { admissionsCalendarPort } from '../services/campus/campusAdmissionsCalendarPort';
import { sendValidated, logFailure } from './campusRoutes';

/**
 * Campus "Book a call with admissions" (Basecamp C20). Participant-authed per route and behind the campus pilot, like every campus
 * route; read-only "view as member" tokens can look but cannot book or cancel (requireParticipant blocks non-GET for them). The
 * enrollment comes only from the token. See services/campus/campusAdmissionsCall.ts for idempotency and failure modes.
 *
 *   GET    /api/portal/campus/admissions-call/slots   the next seven business days of free times (Central)
 *   GET    /api/portal/campus/admissions-call         { booking } this learner's next call, or null ("Coming up")
 *   POST   /api/portal/campus/admissions-call         { slotStart, topic, note? } -> 201 created | 200 already booked at that time
 *   DELETE /api/portal/campus/admissions-call/:eventId cancel one of this learner's calls (Reschedule = cancel, then book)
 */
const Slot = z.object({ start: z.string(), end: z.string() }).strict();
export const SlotsResponse = z.object({ timezone: z.string(), dates: z.array(z.object({ date: z.string(), slots: z.array(Slot) }).strict()).max(7) }).strict();
const Booking = z.object({ eventId: z.string(), startTime: z.string(), endTime: z.string(), meetLink: z.string(), topic: z.enum(ADMISSIONS_TOPICS).nullable() }).strict();
export const BookingResponse = z.object({ booking: Booking.nullable() }).strict();
export const BookBody = z.object({
  slotStart: z.string().datetime({ offset: true }),
  topic: z.enum(ADMISSIONS_TOPICS),
  note: z.string().max(NOTE_MAX).optional(),
}).strict();
const EventIdParam = z.string().regex(/^[A-Za-z0-9_-]{5,1024}$/);

function gate(req: Request, res: Response): boolean {
  if (campusOnFor(req)) return true;
  res.status(403).json({ error: 'The campus is not enabled for this account', error_class: 'CampusNotEnabled' });
  return false;
}

/** Calendar down, not configured or timed out: fail closed with a clear, stable class (never the upstream's body). */
function failUpstream(res: Response, event: string, err: unknown): void {
  const status = (err as { statusCode?: number; status?: number })?.statusCode ?? (err as { status?: number })?.status;
  if (status === 400 || status === 404) { res.status(status).json({ error: (err as Error).message, error_class: status === 404 ? 'NotFound' : 'ValidationFailed' }); return; }
  logFailure(event, err);
  res.status(503).json({ error: 'Booking is not available right now. Please try again shortly.', error_class: 'UpstreamUnavailable' });
}

export async function getSlotsRoute(req: Request, res: Response): Promise<void> {
  if (!gate(req, res)) return;
  try { sendValidated(res, SlotsResponse, await admissionsSlots(admissionsCalendarPort()), 'campus_admissions_slots'); }
  catch (err) { failUpstream(res, 'campus_admissions_slots_failed', err); }
}

export async function getUpcomingRoute(req: Request, res: Response): Promise<void> {
  if (!gate(req, res)) return;
  try { sendValidated(res, BookingResponse, { booking: await upcomingAdmissionsCall(admissionsCalendarPort(), req.participant!.sub) }, 'campus_admissions_upcoming'); }
  catch (err) { failUpstream(res, 'campus_admissions_upcoming_failed', err); }
}

export async function postBookRoute(req: Request, res: Response): Promise<void> {
  if (!gate(req, res)) return;
  const parsed = BookBody.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: 'Invalid booking', error_class: 'ValidationFailed' }); return; }
  try {
    const e = await Enrollment.findByPk(req.participant!.sub, { attributes: ['id', 'full_name', 'email'] });
    if (!e) { res.status(404).json({ error: 'Enrollment not found', error_class: 'NotFound' }); return; }
    const who = { enrollmentId: e.id, name: e.full_name || 'Colaberry learner', email: e.email };
    const { booking, created } = await bookAdmissionsCall(admissionsCalendarPort(), who, parsed.data);
    res.status(created ? 201 : 200);
    sendValidated(res, BookingResponse, { booking }, 'campus_admissions_book');
  } catch (err) {
    if (err instanceof AdmissionsConflict) {
      res.status(409).json({ error: err.message, error_class: err.reason === 'ALREADY_BOOKED' ? 'AlreadyBooked' : 'SlotTaken', booking: err.booking });
      return;
    }
    failUpstream(res, 'campus_admissions_book_failed', err);
  }
}

export async function deleteBookingRoute(req: Request, res: Response): Promise<void> {
  if (!gate(req, res)) return;
  const id = EventIdParam.safeParse(req.params.eventId);
  if (!id.success) { res.status(400).json({ error: 'Invalid event id', error_class: 'ValidationFailed' }); return; }
  try { await cancelAdmissionsCall(admissionsCalendarPort(), req.participant!.sub, id.data); res.status(204).end(); }
  catch (err) { failUpstream(res, 'campus_admissions_cancel_failed', err); }
}

const router = Router();
router.get('/api/portal/campus/admissions-call/slots', requireParticipant, getSlotsRoute);
router.get('/api/portal/campus/admissions-call', requireParticipant, getUpcomingRoute);
router.post('/api/portal/campus/admissions-call', requireParticipant, postBookRoute);
router.delete('/api/portal/campus/admissions-call/:eventId', requireParticipant, deleteBookingRoute);
export default router;
