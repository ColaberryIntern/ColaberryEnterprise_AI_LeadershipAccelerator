import { google } from 'googleapis';
import { env } from '../config/env';
import { admissionsCalendar, defaultCalendar, type CalendarTarget } from './calendarTarget';
import { AppError } from '../utils/AppError';
import { getTestOverrides } from './settingsService';
import { redactForLogs } from '../utils/piiRedaction';

const SLOT_DURATION_MINUTES = 30;
const BUFFER_MINUTES = 15;      // Buffer between consecutive bookable slots
const BUSINESS_HOUR_START = 9;   // 9 AM CT
const BUSINESS_HOUR_END = 17;    // 5 PM CT
const BUSINESS_TIMEZONE = 'America/Chicago';

interface TimeSlot {
  start: string;
  end: string;
}

interface DateSlots {
  date: string;
  slots: TimeSlot[];
}

export interface AvailabilityResponse {
  dates: DateSlots[];
  timezone: string;
}

export interface BookingInput {
  name: string;
  email: string;
  company: string;
  phone: string;
  slotStart: string;
  timezone: string;
  pageOrigin?: string;
}

export interface BookingResult {
  eventId: string;
  meetLink: string;
  startTime: string;
  endTime: string;
}

function getAuthClient() {
  if (!env.googleServiceAccountEmail || !env.googlePrivateKey) {
    throw new AppError('Google Calendar not configured', 503);
  }

  return new google.auth.JWT({
    email: env.googleServiceAccountEmail,
    key: env.googlePrivateKey,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });
}

/**
 * Return a Calendar client using impersonated auth when the target has an owner
 * (googleCalendarOwnerEmail for the default calendar), otherwise plain service-account auth.
 * This ensures getAvailableSlots and createBooking see the same calendar.
 * C90: every call below takes a CalendarTarget (calendarTarget.ts); admissions passes its own.
 */
function getCalendarClient(ownerEmail: string | null = defaultCalendar().ownerEmail) {
  if (ownerEmail) {
    const impersonateAuth = new google.auth.JWT({
      email: env.googleServiceAccountEmail,
      key: env.googlePrivateKey,
      scopes: ['https://www.googleapis.com/auth/calendar'],
      subject: ownerEmail,
    });
    return google.calendar({ version: 'v3', auth: impersonateAuth });
  }
  return google.calendar({ version: 'v3', auth: getAuthClient() });
}

function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function getTzOffset(dateStr: string): string {
  const noon = new Date(`${dateStr}T12:00:00Z`);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIMEZONE,
    timeZoneName: 'short',
  });
  const parts = formatter.formatToParts(noon);
  const tzName = parts.find((p) => p.type === 'timeZoneName')?.value;
  // CDT = -05:00, CST = -06:00
  return tzName === 'CDT' ? '-05:00' : '-06:00';
}

function generateBusinessSlots(date: Date): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const dateStr = date.toISOString().split('T')[0];
  const offset = getTzOffset(dateStr);

  for (let hour = BUSINESS_HOUR_START; hour < BUSINESS_HOUR_END; hour++) {
    for (let min = 0; min < 60; min += SLOT_DURATION_MINUTES) {
      const startStr = `${dateStr}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00${offset}`;
      const endHour = min + SLOT_DURATION_MINUTES >= 60 ? hour + 1 : hour;
      const endMin = (min + SLOT_DURATION_MINUTES) % 60;
      const endStr = `${dateStr}T${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}:00${offset}`;
      slots.push({ start: startStr, end: endStr });
    }
  }
  return slots;
}

function slotsOverlap(slot: TimeSlot, busyStart: string, busyEnd: string): boolean {
  const slotStartMs = new Date(slot.start).getTime();
  const slotEndMs = new Date(slot.end).getTime();
  const busyStartMs = new Date(busyStart).getTime();
  const busyEndMs = new Date(busyEnd).getTime();
  // Add buffer after each busy block to prevent back-to-back scheduling
  const bufferedBusyEndMs = busyEndMs + BUFFER_MINUTES * 60 * 1000;
  // Also add buffer before the busy block so a slot doesn't end right when one starts
  const bufferedBusyStartMs = busyStartMs - BUFFER_MINUTES * 60 * 1000;
  return slotStartMs < bufferedBusyEndMs && slotEndMs > bufferedBusyStartMs;
}

export async function getAvailableSlots(days: number = 21, target: CalendarTarget = defaultCalendar()): Promise<AvailabilityResponse> {
  const calendar = getCalendarClient(target.ownerEmail);

  const now = new Date();
  // Allow same-day bookings with 4-hour buffer
  const MIN_BOOKING_LEAD_MS = 4 * 60 * 60 * 1000; // 4 hours from now
  const startDate = new Date(now);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + days);

  // Use events.list instead of freebusy so we can distinguish all-day events
  // from timed events. All-day events (start.date) should NOT block time slots.
  // If the calendar API fails, propagate the error so callers know availability
  // could not be verified (fail-closed).
  const busyBlocks = await getTimedBusyBlocks(calendar, startDate, endDate, target.calendarId);

  // Generate available slots per day
  const dates: DateSlots[] = [];
  const current = new Date(startDate);

  while (current < endDate) {
    if (isWeekday(current)) {
      const allSlots = generateBusinessSlots(current);

      const earliest = new Date(now.getTime() + MIN_BOOKING_LEAD_MS);
      const available = allSlots.filter((slot) => {
        const slotDateObj = new Date(slot.start);
        if (slotDateObj <= earliest) return false;

        return !busyBlocks.some((busy) =>
          slotsOverlap(slot, busy.start, busy.end)
        );
      });

      if (available.length > 0) {
        dates.push({
          date: current.toISOString().split('T')[0],
          slots: available,
        });
      }
    }
    current.setDate(current.getDate() + 1);
  }

  return { dates, timezone: BUSINESS_TIMEZONE };
}

/**
 * Fetch timed (non-all-day) events from the calendar and return them as busy blocks.
 * Excluded: all-day events, transparent/free events, cancelled events,
 * and multi-day timed events (>24h) which are calendar holds, not real meetings.
 */
async function getTimedBusyBlocks(
  calendar: ReturnType<typeof google.calendar>,
  timeMin: Date,
  timeMax: Date,
  calendarId: string,
): Promise<{ start: string; end: string }[]> {
  const MAX_MEETING_MS = 24 * 60 * 60 * 1000; // 24 hours
  const blocks: { start: string; end: string }[] = [];
  let pageToken: string | undefined;

  try {
    do {
      const res = await calendar.events.list({
        calendarId,
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 250,
        pageToken,
      });

      for (const event of res.data.items || []) {
        // Skip all-day events — they use start.date, not start.dateTime
        if (!event.start?.dateTime || !event.end?.dateTime) continue;
        // Skip transparent (free) events
        if (event.transparency === 'transparent') continue;
        // Skip cancelled events
        if (event.status === 'cancelled') continue;
        // Skip multi-day timed events (>24h) — calendar holds, not real meetings
        const durationMs = new Date(event.end.dateTime).getTime() - new Date(event.start.dateTime).getTime();
        if (durationMs > MAX_MEETING_MS) continue;

        blocks.push({
          start: event.start.dateTime,
          end: event.end.dateTime,
        });
      }

      pageToken = res.data.nextPageToken || undefined;
    } while (pageToken);
  } catch (err: any) {
    console.error(`[Calendar] getTimedBusyBlocks FAILED (${timeMin.toISOString()} - ${timeMax.toISOString()}):`, err.message, err.code || '', err.status || '');
    // Fail closed — do NOT return empty and allow bookings when availability is unknown.
    // Callers must handle this error and reject the booking attempt.
    throw new AppError('Calendar availability could not be verified. Please try again.', 503);
  }

  return blocks;
}

export async function createBooking(data: BookingInput, target: CalendarTarget = defaultCalendar()): Promise<BookingResult> {
  const calendar = getCalendarClient(target.ownerEmail);

  const startTime = new Date(data.slotStart);
  const endTime = new Date(startTime.getTime() + SLOT_DURATION_MINUTES * 60 * 1000);

  console.log(`[Calendar] createBooking: ${redactForLogs(data.name)} | ${startTime.toISOString()} - ${endTime.toISOString()} | ${target.kind} calendar: ${target.calendarId} | impersonating: ${target.ownerEmail || 'none'}`);

  // Pre-booking conflict check: verify the slot is still free (ignoring all-day events)
  const conflicts = await getTimedBusyBlocks(calendar, startTime, endTime, target.calendarId);
  if (conflicts.length > 0) {
    console.warn(`[Calendar] Conflict detected for ${startTime.toISOString()} - ${endTime.toISOString()}:`, JSON.stringify(conflicts));
    throw new AppError('This time slot is no longer available. Please select a different time.', 409);
  }

  const companyLabel = data.company ? ` (${data.company})` : '';

  // In test mode, redirect the attendee email so invites go to the test inbox
  let attendeeEmail = data.email;
  try {
    const test = await getTestOverrides();
    if (test.enabled && test.email) {
      console.log(`[Calendar] TEST MODE: redirecting attendee from ${redactForLogs(data.email)} to ${redactForLogs(test.email)}`);
      attendeeEmail = test.email;
    }
  } catch {
    // If settings DB fails, use original email
  }

  const baseRequest = {
    summary: `Executive AI Strategy Call — ${data.name}${companyLabel}`,
    description: [
      `Strategy call with ${data.name}`,
      data.company ? `Company: ${data.company}` : '',
      `Email: ${data.email}`,
      data.phone ? `Phone: ${data.phone}` : '',
      '',
      'Booked via Colaberry Enterprise AI Leadership Accelerator website.',
    ].filter(Boolean).join('\n'),
    start: {
      dateTime: startTime.toISOString(),
      timeZone: BUSINESS_TIMEZONE,
    },
    end: {
      dateTime: endTime.toISOString(),
      timeZone: BUSINESS_TIMEZONE,
    },
    attendees: [
      { email: attendeeEmail, displayName: data.name },
      ...(target.ownerEmail ? [{ email: target.ownerEmail }] : []),
      // C90: the fixed staff invites belong to the strategy-call calendar only; an admissions call is the attendee and admissions
      ...(target.kind === 'default' ? [
        { email: 'ali@colaberry.com' },
        { email: 'ram@colaberry.com' },
        // Only add David Lahme for utility page bookings
        ...((data.pageOrigin || '').includes('utility') ? [{ email: 'dlahme@colaberry.com' }] : []),
      ] : []),
    ],
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 60 },
        { method: 'popup', minutes: 15 },
      ],
    },
  };

  // Try with Google Meet conference data; fall back to plain event.
  // calendar already uses impersonated auth (via getCalendarClient) which is
  // required for Meet link creation with domain-wide delegation.
  let event;
  try {
    event = await calendar.events.insert({
      calendarId: target.calendarId,
      conferenceDataVersion: 1,
      sendNotifications: true,
      requestBody: {
        ...baseRequest,
        conferenceData: {
          createRequest: {
            requestId: `strategy-${Date.now()}`,
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      },
    });
    console.log('[Calendar] Event created with Meet conference data');
  } catch (meetErr: any) {
    console.warn('[Calendar] Meet link creation failed, creating event without conference:', meetErr.message);
    event = await calendar.events.insert({
      calendarId: target.calendarId,
      sendNotifications: true,
      requestBody: baseRequest,
    });
  }

  const eventId = event.data.id || '';
  const meetLink =
    event.data.conferenceData?.entryPoints?.find(
      (ep) => ep.entryPointType === 'video'
    )?.uri || event.data.hangoutLink || '';

  return {
    eventId,
    meetLink,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
  };
}

// ── Campus admissions calls (Basecamp C20) ──────────────────────────────────
// Additive primitives for campusAdmissionsCall.ts. They use the SAME calendar and
// auth as the strategy-call booking above but none of its side effects: no
// strategy-call title, no fixed staff invite list, no email/nudge/GHL (those live
// in the controller that wraps createBooking, which campus never calls). Every
// request carries an explicit timeout; a timeout or API error throws, and the
// caller fails closed (no booking is claimed that the calendar did not confirm).

const CAMPUS_CALENDAR_TIMEOUT_MS = 15_000;

export interface CampusCalendarEvent {
  eventId: string;
  startTime: string;
  endTime: string;
  meetLink: string;
  /** The event's private extended properties (campus_enrollment_id, campus_topic). */
  props: Record<string, string>;
  created: string;
}

function toCampusEvent(e: { id?: string | null; start?: { dateTime?: string | null } | null; end?: { dateTime?: string | null } | null;
  hangoutLink?: string | null; created?: string | null; conferenceData?: { entryPoints?: Array<{ entryPointType?: string | null; uri?: string | null }> | null } | null;
  extendedProperties?: { private?: Record<string, string> | null } | null }): CampusCalendarEvent {
  return {
    eventId: e.id || '',
    startTime: e.start?.dateTime ? new Date(e.start.dateTime).toISOString() : '',
    endTime: e.end?.dateTime ? new Date(e.end.dateTime).toISOString() : '',
    meetLink: e.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === 'video')?.uri || e.hangoutLink || '',
    props: e.extendedProperties?.private || {},
    created: e.created || '',
  };
}

/** Upcoming (not cancelled) events carrying a private property, oldest first. */
export async function findEventsByPrivateProperty(key: string, value: string, timeMin: Date, target: CalendarTarget = defaultCalendar()): Promise<CampusCalendarEvent[]> {
  const calendar = getCalendarClient(target.ownerEmail);
  const res = await calendar.events.list({
    calendarId: target.calendarId,
    privateExtendedProperty: [`${key}=${value}`],
    timeMin: timeMin.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 20,
  }, { timeout: CAMPUS_CALENDAR_TIMEOUT_MS });
  return (res.data.items || []).filter((e) => e.status !== 'cancelled' && e.start?.dateTime).map(toCampusEvent);
}

/** True when no timed event overlaps [start, end) (all-day, free and cancelled events ignored, as createBooking). */
export async function isSlotFree(start: Date, end: Date, target: CalendarTarget = defaultCalendar()): Promise<boolean> {
  return (await getTimedBusyBlocks(getCalendarClient(target.ownerEmail), start, end, target.calendarId)).length === 0;
}

export interface CampusEventInput {
  summary: string;
  description: string;
  slotStart: Date;
  attendees: Array<{ email: string; displayName?: string }>;
  privateProps: Record<string, string>;
  /** Stable per (enrollment, slot): Google dedups conference creation on it. */
  requestId: string;
}

/** Insert a 30-minute event with a Meet link (plain event if Meet creation fails), invites sent. */
export async function insertCampusEvent(input: CampusEventInput, target: CalendarTarget = defaultCalendar()): Promise<CampusCalendarEvent> {
  const calendar = getCalendarClient(target.ownerEmail);
  const end = new Date(input.slotStart.getTime() + SLOT_DURATION_MINUTES * 60 * 1000);
  const base = {
    summary: input.summary,
    description: input.description,
    start: { dateTime: input.slotStart.toISOString(), timeZone: BUSINESS_TIMEZONE },
    end: { dateTime: end.toISOString(), timeZone: BUSINESS_TIMEZONE },
    attendees: input.attendees,
    extendedProperties: { private: input.privateProps },
    reminders: { useDefault: false, overrides: [{ method: 'email', minutes: 60 }, { method: 'popup', minutes: 15 }] },
  };
  try {
    const ev = await calendar.events.insert({
      calendarId: target.calendarId, conferenceDataVersion: 1, sendUpdates: 'all',
      requestBody: { ...base, conferenceData: { createRequest: { requestId: input.requestId, conferenceSolutionKey: { type: 'hangoutsMeet' } } } },
    }, { timeout: CAMPUS_CALENDAR_TIMEOUT_MS });
    return toCampusEvent(ev.data);
  } catch (meetErr: any) {
    console.warn('[Calendar] campus event: Meet link creation failed, creating without conference:', meetErr?.message);
    const ev = await calendar.events.insert({ calendarId: target.calendarId, sendUpdates: 'all', requestBody: base }, { timeout: CAMPUS_CALENDAR_TIMEOUT_MS });
    return toCampusEvent(ev.data);
  }
}

/** Cancel (delete) an event and notify its attendees. A 404/410 means it is already gone, which is the goal. */
export async function cancelCalendarEvent(eventId: string, target: CalendarTarget = defaultCalendar()): Promise<void> {
  const calendar = getCalendarClient(target.ownerEmail);
  try {
    await calendar.events.delete({ calendarId: target.calendarId, eventId, sendUpdates: 'all' }, { timeout: CAMPUS_CALENDAR_TIMEOUT_MS });
  } catch (err: any) {
    const code = err?.code ?? err?.status;
    if (code === 404 || code === 410) return;
    throw err;
  }
}

/**
 * Write prep notes into a booked call's description. C90: calls are booked on the bookings calendar (Roselen), so it is tried
 * first; a call booked before the switch lives on the default calendar, so a 404/410 there falls back to it (the previous
 * behavior). Never throws: prep notes are best-effort and logged on failure.
 */
export async function updateCalendarEvent(eventId: string, description: string, target: CalendarTarget = admissionsCalendar()): Promise<void> {
  const patch = (calendar: ReturnType<typeof google.calendar>, calendarId: string) =>
    calendar.events.patch({ calendarId, eventId, requestBody: { description } });
  try {
    try {
      await patch(getCalendarClient(target.ownerEmail), target.calendarId);
    } catch (err: any) {
      const code = err?.code ?? err?.status;
      if (target.kind === 'default' || (code !== 404 && code !== 410)) throw err;
      await patch(google.calendar({ version: 'v3', auth: getAuthClient() }), env.googleCalendarId);
    }
    console.log('[Calendar] Updated event description:', eventId);
  } catch (err: any) {
    console.error('[Calendar] Failed to update event:', eventId, err.message);
  }
}
