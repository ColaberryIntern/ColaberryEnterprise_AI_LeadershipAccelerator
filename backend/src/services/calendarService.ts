import { google } from 'googleapis';
import { env } from '../config/env';
import { AppError } from '../utils/AppError';

const SLOT_DURATION_MINUTES = 30;
const BUSINESS_HOUR_START = 9; // 9 AM ET
const BUSINESS_HOUR_END = 17;  // 5 PM ET
const BUSINESS_TIMEZONE = 'America/New_York';

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

function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function generateBusinessSlots(date: Date): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const dateStr = date.toISOString().split('T')[0];

  for (let hour = BUSINESS_HOUR_START; hour < BUSINESS_HOUR_END; hour++) {
    for (let min = 0; min < 60; min += SLOT_DURATION_MINUTES) {
      const startStr = `${dateStr}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`;
      const endHour = min + SLOT_DURATION_MINUTES >= 60 ? hour + 1 : hour;
      const endMin = (min + SLOT_DURATION_MINUTES) % 60;
      const endStr = `${dateStr}T${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}:00`;
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
  return slotStartMs < busyEndMs && slotEndMs > busyStartMs;
}

export async function getAvailableSlots(days: number = 21): Promise<AvailabilityResponse> {
  const auth = getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const now = new Date();
  // Start from tomorrow to avoid same-day bookings
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() + 1);
  startDate.setHours(0, 0, 0, 0);

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + days);

  // Use events.list instead of freebusy so we can distinguish all-day events
  // from timed events. All-day events (start.date) should NOT block time slots.
  const busyBlocks = await getTimedBusyBlocks(calendar, startDate, endDate);

  // Generate available slots per day
  const dates: DateSlots[] = [];
  const current = new Date(startDate);

  while (current < endDate) {
    if (isWeekday(current)) {
      const allSlots = generateBusinessSlots(current);

      const available = allSlots.filter((slot) => {
        const slotDateObj = new Date(slot.start);
        if (slotDateObj <= now) return false;

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
 * All-day events (which use start.date instead of start.dateTime) are excluded
 * so they don't block bookable time slots.
 */
async function getTimedBusyBlocks(
  calendar: ReturnType<typeof google.calendar>,
  timeMin: Date,
  timeMax: Date,
): Promise<{ start: string; end: string }[]> {
  const blocks: { start: string; end: string }[] = [];
  let pageToken: string | undefined;

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

      blocks.push({
        start: event.start.dateTime,
        end: event.end.dateTime,
      });
    }

    pageToken = res.data.nextPageToken || undefined;
  } while (pageToken);

  return blocks;
}

export async function createBooking(data: BookingInput): Promise<BookingResult> {
  const auth = getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const startTime = new Date(data.slotStart);
  const endTime = new Date(startTime.getTime() + SLOT_DURATION_MINUTES * 60 * 1000);

  // Pre-booking conflict check: verify the slot is still free (ignoring all-day events)
  const conflicts = await getTimedBusyBlocks(calendar, startTime, endTime);
  if (conflicts.length > 0) {
    throw new AppError('This time slot is no longer available. Please select a different time.', 409);
  }

  const companyLabel = data.company ? ` (${data.company})` : '';

  const event = await calendar.events.insert({
    calendarId: env.googleCalendarId,
    conferenceDataVersion: 1,
    requestBody: {
      summary: `Executive AI Strategy Call — ${data.name}${companyLabel}`,
      description: [
        `Strategy call with ${data.name}`,
        data.company ? `Company: ${data.company}` : '',
        data.email ? `Email: ${data.email}` : '',
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
        { email: data.email, displayName: data.name },
      ],
      conferenceData: {
        createRequest: {
          requestId: `strategy-call-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 60 },
          { method: 'popup', minutes: 15 },
        ],
      },
    },
  });

  const eventId = event.data.id || '';
  const meetLink = event.data.conferenceData?.entryPoints?.find(
    (ep) => ep.entryPointType === 'video'
  )?.uri || event.data.hangoutLink || '';

  return {
    eventId,
    meetLink,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
  };
}
