/**
 * enterpriseIntakeSchedule - the client plans the rest of their intake in the same visit (v2).
 *
 * Ali, 2026-11-21: "they need to schedule their AI and Human interview through this process so
 * it can already be done. Give them an option to do their AI interview now or later... Either
 * way, the human interview has to be after the AI interview." And: "these go on my calendar and
 * not admissions calendar."
 *
 *  - The AI interview: now, or a time they choose in the next 14 days (we remind them then).
 *  - The human meeting: a 30-minute slot on ALI'S calendar (defaultCalendar(), ali@colaberry.com
 *    in production; never admissionsCalendar()), at the earliest on the next business day after
 *    the AI interview (Ali chose 1 business day: research takes minutes, the gap is his prep).
 *
 * Failure handling:
 *  - Calendar reads carry a 15s timeout; a failure is a CalendarUnavailable refusal (503), and the
 *    page says so. Nothing is booked that the calendar did not confirm.
 *  - Booking is once-only: an atomic claim on meeting_booking_at (stale after 2 minutes), then an
 *    event tagged enterprise_intake_id is ADOPTED if one exists (a booking whose response was lost),
 *    else the slot is re-checked free and inserted with a stable requestId. Any failure releases
 *    the claim, so the client can pick again. Retries are the client's own clicks, never a loop.
 */
import { Op } from 'sequelize';
import { z } from 'zod';
import EnterpriseIntake from '../../models/EnterpriseIntake';
import {
  findEventsByPrivateProperty,
  getAvailableSlots,
  insertCampusEvent,
  isSlotFree,
  type AvailabilityResponse,
} from '../calendarService';
import { defaultCalendar } from '../calendarTarget';
import { getTestOverrides } from '../settingsService';
import { callable, voiceConfigured } from './enterpriseIntakeService';

import { TZ, meetingWhen } from './enterpriseIntakeTime';

export { TZ, meetingWhen };
export const MEETING_MINUTES = 30;
const CALENDAR_TIMEOUT_MS = 15_000;
const CLAIM_STALE_MS = 2 * 60 * 1000;
const LATER_MIN_MS = 30 * 60 * 1000;
const LATER_MAX_MS = 14 * 24 * 60 * 60 * 1000;
/** Mirrors calendarService's buffer between bookable slots. */
const BUFFER_MS = 15 * 60 * 1000;
export const ALI_EMAIL = 'ali@colaberry.com';
export const INTAKE_EVENT_KEY = 'enterprise_intake_id';

export class ScheduleRefused extends Error {
  error_class = 'ValidationError';
  constructor(public code: string, message: string, public http = 409) {
    super(message);
    this.name = 'ScheduleRefused';
  }
}

export class CalendarUnavailable extends Error {
  error_class = 'UpstreamUnavailable';
  constructor(message: string) {
    super(message);
    this.name = 'CalendarUnavailable';
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: NodeJS.Timeout;
  return Promise.race([
    p.finally(() => clearTimeout(t)),
    new Promise<T>((_, reject) => {
      t = setTimeout(() => reject(new CalendarUnavailable(`${what} timed out after ${ms}ms`)), ms);
    }),
  ]);
}

// --- Central-time business days (pure) ---

interface CtParts { y: number; m: number; d: number; weekday: number; hour: number; minute: number }

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function ctParts(at: Date): CtParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return {
    y: Number(get('year')), m: Number(get('month')), d: Number(get('day')),
    weekday: WEEKDAYS[get('weekday')] ?? 0, hour: Number(get('hour')) % 24, minute: Number(get('minute')),
  };
}

/** Minutes Central time is behind UTC at this instant (360 in CST, 300 in CDT). */
function ctOffsetMinutes(at: Date): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TZ, timeZoneName: 'shortOffset' })
    .formatToParts(at).find((p) => p.type === 'timeZoneName')?.value || 'GMT-6';
  const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  if (!m) return 360;
  const mins = Number(m[2]) * 60 + Number(m[3] || 0);
  return m[1] === '-' ? mins : -mins;
}

/** Midnight Central time on a calendar date, as an instant. */
export function ctMidnight(y: number, m: number, d: number): Date {
  // 06:00 UTC is 00:00 or 01:00 Central, before any 2 AM daylight-saving switch that day.
  const probe = new Date(Date.UTC(y, m - 1, d, 6));
  return new Date(Date.UTC(y, m - 1, d) + ctOffsetMinutes(probe) * 60 * 1000);
}

/** The first instant of the next weekday (Central) after `anchor`. */
/** The nth weekday (0 Sun..6 Sat) of a month, or the last one when n is -1. Day of month. */
function nthWeekday(y: number, m: number, weekday: number, n: number): number {
  if (n > 0) {
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = new Date(Date.UTC(y, m - 1, lastDay)).getUTCDay();
  return lastDay - ((last - weekday + 7) % 7);
}

/**
 * US holidays Colaberry does not take meetings on. Live check 2026-11-21: Thanksgiving and the
 * day after were offered as bookable. (Fixed dates are not shifted when they fall on a weekend:
 * weekends are never offered anyway.)
 */
export function isHoliday(y: number, m: number, d: number): boolean {
  const md = `${m}-${d}`;
  if (['1-1', '7-4', '12-24', '12-25', '12-31'].includes(md)) return true;
  if (m === 5 && d === nthWeekday(y, 5, 1, -1)) return true; // Memorial Day
  if (m === 9 && d === nthWeekday(y, 9, 1, 1)) return true; // Labor Day
  const thanksgiving = nthWeekday(y, 11, 4, 4);
  return m === 11 && (d === thanksgiving || d === thanksgiving + 1);
}

/** True for a Central calendar date we meet on: a weekday that is not a holiday. */
export function isBusinessDay(y: number, m: number, d: number): boolean {
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd !== 0 && wd !== 6 && !isHoliday(y, m, d);
}

export function earliestMeetingStart(anchor: Date): Date {
  const p = ctParts(anchor);
  // Walk calendar days in UTC arithmetic on the Central date, which has no DST problem.
  const day = new Date(Date.UTC(p.y, p.m - 1, p.d));
  do {
    day.setUTCDate(day.getUTCDate() + 1);
  } while (!isBusinessDay(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate()));
  return ctMidnight(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate());
}

/** The AI interview time the meeting must follow: done, else scheduled, else now. */
export function meetingAnchor(i: Pick<EnterpriseIntake, 'interviewed_at' | 'interview_mode' | 'interview_scheduled_for'>, now = new Date()): Date {
  if (i.interviewed_at) return new Date(i.interviewed_at);
  if (i.interview_mode === 'later' && i.interview_scheduled_for) {
    const s = new Date(i.interview_scheduled_for);
    return s > now ? s : now;
  }
  return now;
}

/** A start the calendar would offer: a weekday, on the half hour, 9:00 to 16:30 Central. */
export function isBookableShape(start: Date): boolean {
  const p = ctParts(start);
  return isBusinessDay(p.y, p.m, p.d) && (p.minute === 0 || p.minute === 30) && p.hour >= 9 && p.hour <= 16
    && start.getUTCSeconds() === 0 && start.getUTCMilliseconds() === 0;
}

// --- Slots ---

export interface OfferedSlots {
  earliest: string;
  timezone: string;
  dates: AvailabilityResponse['dates'];
}

export function filterSlots(avail: AvailabilityResponse, earliest: Date): AvailabilityResponse['dates'] {
  return avail.dates
    .filter((d) => {
      const [y, m, day] = d.date.split('-').map(Number);
      return isBusinessDay(y, m, day);
    })
    .map((d) => ({ date: d.date, slots: d.slots.filter((s) => new Date(s.start).getTime() >= earliest.getTime()) }))
    .filter((d) => d.slots.length > 0);
}

export async function listMeetingSlots(intake: EnterpriseIntake, now = new Date()): Promise<OfferedSlots> {
  const earliest = earliestMeetingStart(meetingAnchor(intake, now));
  let avail: AvailabilityResponse;
  try {
    avail = await withTimeout(getAvailableSlots(21, defaultCalendar()), CALENDAR_TIMEOUT_MS, 'calendar availability');
  } catch (err) {
    throw err instanceof CalendarUnavailable ? err : new CalendarUnavailable(String((err as Error)?.message || err).slice(0, 200));
  }
  return { earliest: earliest.toISOString(), timezone: TZ, dates: filterSlots(avail, earliest) };
}

// --- The AI interview: now or later ---

export const interviewPlanSchema = z.object({
  mode: z.enum(['now', 'later']),
  at: z.string().datetime({ offset: true }).optional(),
  via: z.enum(['chat', 'call']).optional(),
});
export type InterviewPlan = z.infer<typeof interviewPlanSchema>;

export async function setInterviewPlan(intake: EnterpriseIntake, plan: InterviewPlan, now = new Date()): Promise<{ mode: 'now' | 'later'; at: string | null; via: 'chat' | 'call' }> {
  if (intake.interviewed_at) throw new ScheduleRefused('already_interviewed', 'Your AI interview is already done.');
  let at: Date | null = null;
  if (plan.mode === 'later') {
    if (!plan.at) throw new ScheduleRefused('time_required', 'Pick a time for your AI interview.', 400);
    at = new Date(plan.at);
    const ahead = at.getTime() - now.getTime();
    if (ahead < LATER_MIN_MS) throw new ScheduleRefused('too_soon', 'Pick a time at least 30 minutes from now, or do it now.', 400);
    if (ahead > LATER_MAX_MS) throw new ScheduleRefused('too_far', 'Pick a time in the next 14 days.', 400);
  }
  if (intake.meeting_start) {
    const anchor = at || now;
    if (new Date(intake.meeting_start).getTime() < earliestMeetingStart(anchor).getTime()) {
      throw new ScheduleRefused('meeting_too_soon', 'Your meeting with Ali is booked before that. Pick an earlier time for the AI interview.');
    }
  }
  const via: 'chat' | 'call' = plan.via === 'call' && voiceConfigured() && callable(intake) ? 'call' : 'chat';
  await intake.update({
    interview_mode: plan.mode,
    interview_scheduled_for: at,
    interview_via_pref: via,
    // A new time gets its own reminder.
    interview_reminder_sent_at: null,
    interview_reminder_attempts: 0,
  });
  return { mode: plan.mode, at: at ? at.toISOString() : null, via };
}

// --- The human meeting, on Ali's calendar ---

export const meetingSchema = z.object({ start: z.string().datetime({ offset: true }) });

export interface BookedMeeting { start: string; end: string; link: string | null }

export const meetingOf = (i: Pick<EnterpriseIntake, 'meeting_start' | 'meeting_end' | 'meeting_link'>): BookedMeeting | null =>
  i.meeting_start
    ? { start: new Date(i.meeting_start).toISOString(), end: new Date(i.meeting_end || i.meeting_start).toISOString(), link: i.meeting_link || null }
    : null;

async function attendeeEmail(intended: string): Promise<string> {
  try {
    const test = await getTestOverrides();
    if (test.enabled && test.email) return test.email;
  } catch (err) {
    // Settings unreadable: invite the real address, as the strategy-call booking does.
    console.warn(JSON.stringify({ level: 'warn', service: 'enterprise-intake-schedule', event: 'enterprise_test_overrides_unreadable', outcome: 'partial',
      error_class: 'UpstreamUnavailable', context: { message: String((err as Error)?.message || err).slice(0, 200) } }));
  }
  return intended;
}

export function inviteText(i: Pick<EnterpriseIntake, 'company' | 'full_name'>): { summary: string; description: string } {
  return {
    summary: `Colaberry demo pilot: ${i.company || i.full_name}`.slice(0, 200),
    description: [
      `Your demo pilot meeting with Ali Muwwakkil, Colaberry.`,
      '',
      'We will walk through the pilot options we drafted from your AI interview and our research,',
      'ranked by what each could return, and agree on the one to run first.',
      '',
      'Join with the Google Meet link on this invite.',
    ].join('\n'),
  };
}

/**
 * After a booking: the meeting goes on their Basecamp list, and Ali's brief is tried (it sends
 * only once the research is done). Lazy imports keep the calendar module free of the Basecamp
 * and email stacks; both have their own sweep, so a failure here is only a log line.
 */
function afterMeetingBooked(intakeId: string): void {
  import('./enterpriseIntakeMeetingPost').then(({ postMeetingSoon }) => postMeetingSoon(intakeId))
    .catch((err) => console.error(JSON.stringify({ level: 'error', service: 'enterprise-intake-schedule', event: 'enterprise_after_booking_failed',
      outcome: 'failure', error_class: 'UnknownError', context: { intake_id: intakeId, step: 'meeting_post', message: String(err?.message || err).slice(0, 200) } })));
  import('./enterpriseIntakeAliBrief').then(({ aliBriefSoon }) => aliBriefSoon(intakeId))
    .catch((err) => console.error(JSON.stringify({ level: 'error', service: 'enterprise-intake-schedule', event: 'enterprise_after_booking_failed',
      outcome: 'failure', error_class: 'UnknownError', context: { intake_id: intakeId, step: 'ali_brief', message: String(err?.message || err).slice(0, 200) } })));
}

export async function bookMeeting(intake: EnterpriseIntake, startIso: string, now = new Date()): Promise<{ status: 'booked' | 'already_booked'; meeting: BookedMeeting }> {
  const existing = meetingOf(intake);
  if (existing) return { status: 'already_booked', meeting: existing };

  const start = new Date(startIso);
  const earliest = earliestMeetingStart(meetingAnchor(intake, now));
  if (start.getTime() < earliest.getTime()) {
    throw new ScheduleRefused('too_soon', 'Meetings start the business day after your AI interview. Pick a later time.');
  }
  if (!isBookableShape(start) || start.getTime() > now.getTime() + 21 * 24 * 60 * 60 * 1000) {
    throw new ScheduleRefused('not_offered', 'That time is not one we offer. Pick one of the times shown.', 400);
  }

  const [n] = await EnterpriseIntake.update({ meeting_booking_at: now } as Partial<EnterpriseIntake>, {
    where: {
      id: intake.id,
      meeting_start: null,
      [Op.or]: [{ meeting_booking_at: null }, { meeting_booking_at: { [Op.lt]: new Date(now.getTime() - CLAIM_STALE_MS) } }],
    } as Record<string, unknown>,
  });
  if (n !== 1) throw new ScheduleRefused('busy', 'Your booking is already going through. Reload in a moment.');

  const target = defaultCalendar();
  try {
    // A booking whose response was lost (timeout) is already on the calendar: adopt it.
    const tagged = await withTimeout(
      findEventsByPrivateProperty(INTAKE_EVENT_KEY, intake.id, new Date(now.getTime() - 24 * 60 * 60 * 1000), target),
      CALENDAR_TIMEOUT_MS, 'calendar lookup',
    );
    let ev = tagged[0];
    if (!ev) {
      const end = new Date(start.getTime() + MEETING_MINUTES * 60 * 1000);
      const free = await withTimeout(
        isSlotFree(new Date(start.getTime() - BUFFER_MS), new Date(end.getTime() + BUFFER_MS), target),
        CALENDAR_TIMEOUT_MS, 'calendar check',
      );
      if (!free) throw new ScheduleRefused('slot_taken', 'That time was just taken. Pick another.');
      const text = inviteText(intake);
      ev = await insertCampusEvent({
        summary: text.summary,
        description: text.description,
        slotStart: start,
        attendees: [{ email: await attendeeEmail(intake.email), displayName: intake.full_name }, { email: ALI_EMAIL }],
        privateProps: { [INTAKE_EVENT_KEY]: intake.id },
        requestId: `ent-${intake.id}-${start.getTime()}`,
      }, target);
    }
    await intake.update({
      meeting_start: new Date(ev.startTime || start),
      meeting_end: new Date(ev.endTime || start.getTime() + MEETING_MINUTES * 60 * 1000),
      meeting_event_id: ev.eventId || null,
      meeting_link: ev.meetLink || null,
    });
    // The claim was set by a static UPDATE, so the instance never saw it: clear it the same way.
    await EnterpriseIntake.update({ meeting_booking_at: null } as Partial<EnterpriseIntake>, { where: { id: intake.id } as Record<string, unknown> });
    console.log(JSON.stringify({ level: 'info', service: 'enterprise-intake-schedule', event: 'enterprise_meeting_booked', outcome: 'success',
      context: { intake_id: intake.id, adopted: Boolean(tagged[0]), calendar: target.kind } }));
    afterMeetingBooked(intake.id);
    return { status: 'booked', meeting: meetingOf(intake)! };
  } catch (err) {
    await EnterpriseIntake.update({ meeting_booking_at: null } as Partial<EnterpriseIntake>, { where: { id: intake.id, meeting_start: null } as Record<string, unknown> })
      .catch((releaseErr) => console.error(JSON.stringify({ level: 'error', service: 'enterprise-intake-schedule', event: 'enterprise_meeting_claim_release_failed',
        outcome: 'failure', error_class: 'UpstreamUnavailable',
        // Self-heals: the claim goes stale after 2 minutes and the client can pick again.
        context: { intake_id: intake.id, message: String((releaseErr as Error)?.message || releaseErr).slice(0, 200) } })));
    console.error(JSON.stringify({ level: 'error', service: 'enterprise-intake-schedule', event: 'enterprise_meeting_booking_failed', outcome: 'failure',
      error_class: (err as { error_class?: string })?.error_class || 'UpstreamUnavailable',
      context: { intake_id: intake.id, message: String((err as Error)?.message || err).slice(0, 200) } }));
    if (err instanceof ScheduleRefused || err instanceof CalendarUnavailable) throw err;
    throw new CalendarUnavailable(String((err as Error)?.message || err).slice(0, 200));
  }
}
