import { AppError } from '../../utils/AppError';
import type { AvailabilityResponse, CampusCalendarEvent, CampusEventInput } from '../calendarService';

/**
 * Book a call with a person in admissions, from the campus (Basecamp C20; v6 D3's meeting table and "Talk to a person").
 *
 * It books on the SAME admissions calendar the public strategy-call page uses, through additive calendar primitives, and has none
 * of that flow's side effects: no strategy-call email, no prep nudge, no GHL sync, no pipeline change (the public
 * POST /api/calendar/book controller is not reused). The invite goes to the learner and the admissions calendar's owner only.
 *
 * IDEMPOTENCY without a migration: every campus event carries the private property campus_enrollment_id, so the calendar itself
 * is the record. Before booking we look up this learner's upcoming campus calls:
 *   - one at the same time  -> return it (200, created:false): a double click or a retry books once;
 *   - one at another time   -> 409 ALREADY_BOOKED with that booking: Reschedule (cancel, then book) is the way to move it;
 *   - none                  -> the slot must be one we offer right now (409 SLOT_TAKEN otherwise), then insert.
 * Two concurrent inserts for one learner are settled after the fact: the earliest-created event is kept, the others are cancelled.
 *
 * FAILURE MODES: calendar not configured / unreachable / timed out -> the port throws, the route answers 503 and nothing is
 * claimed (fail closed). No retry here: the learner's own retry is safe because of the lookup above. Not handled: the learner
 * editing or deleting the invite in their own calendar (the calendar stays the record; a deleted event simply is not found).
 */

export const CAMPUS_ENROLLMENT_PROP = 'campus_enrollment_id';
export const CAMPUS_TOPIC_PROP = 'campus_topic';
// The sheet's "What's it about?" chips (round 3 §2.7); the label travels to admissions in the invite.
export const ADMISSIONS_TOPICS = ['enroll', 'payment', 'cohort', 'other'] as const;
export type AdmissionsTopic = typeof ADMISSIONS_TOPICS[number];
export const TOPIC_LABEL: Record<AdmissionsTopic, string> = {
  enroll: 'Enrollment & next steps', payment: 'Payment or employer sponsorship', cohort: 'Changing my cohort', other: 'Something else',
};
/** The sheet offers the next seven business days (v3 §2.7: "7 business days, Central"). */
export const BOOKING_BUSINESS_DAYS = 7;
const SEARCH_CALENDAR_DAYS = 11; // seven weekdays always fit inside eleven calendar days
export const NOTE_MAX = 500;

export interface AdmissionsBooking { eventId: string; startTime: string; endTime: string; meetLink: string; topic: AdmissionsTopic | null }

/** What the service needs from a calendar; calendarService in production, a fake in tests and the local e2e. */
export interface AdmissionsCalendarPort {
  getAvailableSlots(days: number): Promise<AvailabilityResponse>;
  findEventsByPrivateProperty(key: string, value: string, timeMin: Date): Promise<CampusCalendarEvent[]>;
  insertCampusEvent(input: CampusEventInput): Promise<CampusCalendarEvent>;
  cancelCalendarEvent(eventId: string): Promise<void>;
  /** The admissions calendar's owner, invited to every call (null when not configured). */
  ownerEmail: string | null;
  /** Test mode: the inbox every learner invite is redirected to (null when off). */
  testRedirect(): Promise<string | null>;
}

export interface Learner { enrollmentId: string; name: string; email: string }

const isTopic = (v: unknown): v is AdmissionsTopic => typeof v === 'string' && (ADMISSIONS_TOPICS as readonly string[]).includes(v);
const toBooking = (e: CampusCalendarEvent): AdmissionsBooking => ({
  eventId: e.eventId, startTime: e.startTime, endTime: e.endTime, meetLink: e.meetLink, topic: isTopic(e.props[CAMPUS_TOPIC_PROP]) ? e.props[CAMPUS_TOPIC_PROP] as AdmissionsTopic : null,
});

/** The offered times: the first seven business days that have any free slot (the calendar's own 9-5 Central grid and lead time). */
export async function admissionsSlots(port: AdmissionsCalendarPort): Promise<AvailabilityResponse> {
  const a = await port.getAvailableSlots(SEARCH_CALENDAR_DAYS);
  return { timezone: a.timezone, dates: a.dates.slice(0, BOOKING_BUSINESS_DAYS) };
}

async function mine(port: AdmissionsCalendarPort, enrollmentId: string, now: Date): Promise<CampusCalendarEvent[]> {
  return port.findEventsByPrivateProperty(CAMPUS_ENROLLMENT_PROP, enrollmentId, now);
}

/** This learner's next campus admissions call, or null. */
export async function upcomingAdmissionsCall(port: AdmissionsCalendarPort, enrollmentId: string, now = new Date()): Promise<AdmissionsBooking | null> {
  const list = await mine(port, enrollmentId, now);
  return list.length ? toBooking(list[0]) : null;
}

export class AdmissionsConflict extends AppError {
  constructor(public readonly reason: 'SLOT_TAKEN' | 'ALREADY_BOOKED', public readonly booking: AdmissionsBooking | null, message: string) {
    super(message, 409);
    // AppError pins its own prototype, which would make `instanceof AdmissionsConflict` false; restore ours.
    Object.setPrototypeOf(this, AdmissionsConflict.prototype);
  }
}

export interface BookRequest { slotStart: string; topic: AdmissionsTopic; note?: string }

export async function bookAdmissionsCall(port: AdmissionsCalendarPort, who: Learner, req: BookRequest, now = new Date()):
  Promise<{ booking: AdmissionsBooking; created: boolean }> {
  const start = new Date(req.slotStart);
  if (Number.isNaN(start.getTime())) throw new AppError('slotStart is not a time', 400);
  const existing = await mine(port, who.enrollmentId, now);
  const same = existing.find((e) => new Date(e.startTime).getTime() === start.getTime());
  if (same) return { booking: toBooking(same), created: false };
  if (existing.length) throw new AdmissionsConflict('ALREADY_BOOKED', toBooking(existing[0]), 'You already have a call booked. Reschedule it to pick another time.');

  const offered = (await admissionsSlots(port)).dates.some((d) => d.slots.some((s) => new Date(s.start).getTime() === start.getTime()));
  if (!offered) throw new AdmissionsConflict('SLOT_TAKEN', null, 'That time is no longer available. Please pick another.');

  const redirect = await port.testRedirect().catch(() => null);
  const note = (req.note || '').trim().slice(0, NOTE_MAX);
  const ev = await port.insertCampusEvent({
    summary: `Admissions call: ${who.name}`,
    description: [`Topic: ${TOPIC_LABEL[req.topic]}`, note ? `Note from ${who.name}: ${note}` : '', `Email: ${who.email}`, '', 'Booked from the Colaberry Campus (Admissions).'].filter((l, i) => l || i === 3).join('\n'),
    slotStart: start,
    attendees: [{ email: redirect || who.email, displayName: who.name }, ...(port.ownerEmail ? [{ email: port.ownerEmail }] : [])],
    privateProps: { [CAMPUS_ENROLLMENT_PROP]: who.enrollmentId, [CAMPUS_TOPIC_PROP]: req.topic },
    requestId: `campus-${who.enrollmentId}-${start.getTime()}`.slice(0, 64),
  });
  return { booking: toBooking(await settle(port, who.enrollmentId, ev, now)), created: true };
}

/** Two inserts raced for one learner: keep the earliest-created event, cancel the rest. Returns the one kept. */
async function settle(port: AdmissionsCalendarPort, enrollmentId: string, inserted: CampusCalendarEvent, now: Date): Promise<CampusCalendarEvent> {
  const all = await mine(port, enrollmentId, now).catch(() => [inserted]);
  if (all.length <= 1) return inserted;
  const keep = [...all].sort((a, b) => a.created.localeCompare(b.created) || a.eventId.localeCompare(b.eventId))[0];
  for (const e of all) if (e.eventId !== keep.eventId) await port.cancelCalendarEvent(e.eventId);
  return keep;
}

/** Cancel one of THIS learner's calls (Reschedule = cancel, then book). Someone else's event id reads as not found. */
export async function cancelAdmissionsCall(port: AdmissionsCalendarPort, enrollmentId: string, eventId: string, now = new Date()): Promise<void> {
  const list = await mine(port, enrollmentId, now);
  if (!list.some((e) => e.eventId === eventId)) throw new AppError('No such call', 404);
  await port.cancelCalendarEvent(eventId);
}
