import { google } from 'googleapis';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';
import { getTestOverrides } from './settingsService';

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
 * Return a Calendar client using impersonated auth when googleCalendarOwnerEmail
 * is configured, otherwise plain service-account auth.
 * This ensures getAvailableSlots and createBooking see the same calendar.
 */
function getCalendarClient() {
  if (env.googleCalendarOwnerEmail) {
    const impersonateAuth = new google.auth.JWT({
      email: env.googleServiceAccountEmail,
      key: env.googlePrivateKey,
      scopes: ['https://www.googleapis.com/auth/calendar'],
      subject: env.googleCalendarOwnerEmail,
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

export async function getAvailableSlots(days: number = 21): Promise<AvailabilityResponse> {
  const calendar = getCalendarClient();

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
  const busyBlocks = await getTimedBusyBlocks(calendar, startDate, endDate);

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
): Promise<{ start: string; end: string }[]> {
  const MAX_MEETING_MS = 24 * 60 * 60 * 1000; // 24 hours
  const blocks: { start: string; end: string }[] = [];
  let pageToken: string | undefined;

  try {
    do {
      const res = await calendar.events.list({
        calendarId: env.googleCalendarId,
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

export async function createBooking(data: BookingInput): Promise<BookingResult> {
  const calendar = getCalendarClient();

  const startTime = new Date(data.slotStart);
  const endTime = new Date(startTime.getTime() + SLOT_DURATION_MINUTES * 60 * 1000);

  console.log(`[Calendar] createBooking: ${data.name} | ${startTime.toISOString()} - ${endTime.toISOString()} | calendarId: ${env.googleCalendarId} | impersonating: ${env.googleCalendarOwnerEmail || 'none'}`);

  // Pre-booking conflict check: verify the slot is still free (ignoring all-day events)
  const conflicts = await getTimedBusyBlocks(calendar, startTime, endTime);
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
      console.log(`[Calendar] TEST MODE: redirecting attendee from ${data.email} to ${test.email}`);
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
      ...(env.googleCalendarOwnerEmail ? [{ email: env.googleCalendarOwnerEmail }] : []),
      { email: 'ali@colaberry.com' },
      { email: 'ram@colaberry.com' },
      // Only add David Lahme for utility page bookings
      ...((data.pageOrigin || '').includes('utility') ? [{ email: 'dlahme@colaberry.com' }] : []),
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
      calendarId: env.googleCalendarId,
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
      calendarId: env.googleCalendarId,
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

export async function updateCalendarEvent(eventId: string, description: string): Promise<void> {
  try {
    const auth = getAuthClient();
    const calendar = google.calendar({ version: 'v3', auth });

    await calendar.events.patch({
      calendarId: env.googleCalendarId,
      eventId,
      requestBody: { description },
    });

    console.log('[Calendar] Updated event description:', eventId);
  } catch (err: any) {
    console.error('[Calendar] Failed to update event:', eventId, err.message);
  }
}
