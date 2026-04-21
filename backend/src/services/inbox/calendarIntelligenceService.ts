/**
 * Calendar Intelligence Service for Inbox COS.
 * Morning brief, meeting prep, conflict detection, auto-scheduling.
 */
import { google } from 'googleapis';
import { env } from '../../config/env';
import { sendSms } from './smsAlertService';

const LOG_PREFIX = '[InboxCOS][Calendar]';

function getCalendarClient() {
  const auth = new google.auth.JWT({
    email: env.googleServiceAccountEmail,
    key: env.googlePrivateKey,
    scopes: ['https://www.googleapis.com/auth/calendar'],
    subject: env.googleCalendarOwnerEmail,
  });
  return google.calendar({ version: 'v3', auth });
}

interface CalendarEvent {
  summary: string;
  start: string;
  end: string;
  attendees: string[];
  meetLink?: string;
  organizer?: string;
}

async function getTodaysEvents(): Promise<CalendarEvent[]> {
  const calendar = getCalendarClient();
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const res = await calendar.events.list({
    calendarId: env.googleCalendarId,
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  });

  return (res.data.items || [])
    .filter((e: any) => e.status !== 'cancelled')
    .map((e: any) => ({
      summary: e.summary || '(no title)',
      start: e.start?.dateTime || e.start?.date || '',
      end: e.end?.dateTime || e.end?.date || '',
      attendees: (e.attendees || []).map((a: any) => a.displayName || a.email),
      meetLink: e.hangoutLink || e.conferenceData?.entryPoints?.[0]?.uri,
      organizer: e.organizer?.displayName || e.organizer?.email,
    }));
}

function formatTime(isoStr: string): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });
}

/**
 * 1. Morning calendar brief — included in daily SMS summary.
 */
export async function getCalendarBrief(): Promise<string> {
  try {
    const events = await getTodaysEvents();
    if (events.length === 0) return 'No meetings today.';

    const firstStart = formatTime(events[0].start);
    const lastEnd = formatTime(events[events.length - 1].end);

    return `${events.length} meetings today (${firstStart}-${lastEnd}). Next: ${events[0].summary} at ${firstStart}`;
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Calendar brief failed: ${err.message}`);
    return '';
  }
}

/**
 * 2. Detect meeting-request intent in an email.
 */
export function detectMeetingIntent(subject: string, bodyText: string | null): boolean {
  const text = `${subject} ${bodyText || ''}`.toLowerCase();
  const signals = [
    'schedule a call', 'schedule a meeting', 'set up a time',
    'find a time', 'book a time', 'would you be available',
    'can we meet', 'let\'s connect', 'let\'s schedule',
    'available for a call', 'hop on a call', 'quick call',
    'calendar invite', 'meeting request', 'sync up',
    'when are you free', 'what does your schedule look like',
  ];
  return signals.some(s => text.includes(s));
}

/**
 * 2. Get available slots for the next 3 business days.
 */
export async function getAvailableSlots(daysAhead: number = 3): Promise<string[]> {
  const calendar = getCalendarClient();
  const slots: string[] = [];
  const now = new Date();

  for (let d = 1; d <= daysAhead + 2 && slots.length < 6; d++) {
    const day = new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
    if (day.getDay() === 0 || day.getDay() === 6) continue;

    const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 9, 0);
    const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 17, 0);

    const busy = await calendar.freebusy.query({
      requestBody: {
        timeMin: dayStart.toISOString(),
        timeMax: dayEnd.toISOString(),
        items: [{ id: env.googleCalendarId }],
      },
    });

    const busySlots = busy.data.calendars?.[env.googleCalendarId]?.busy || [];
    const hourSlots = [9, 10, 11, 13, 14, 15, 16];

    for (const hour of hourSlots) {
      const slotStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0);
      const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);

      const isBusy = busySlots.some((b: any) => {
        const bStart = new Date(b.start);
        const bEnd = new Date(b.end);
        return slotStart < bEnd && slotEnd > bStart;
      });

      if (!isBusy && slots.length < 6) {
        const dayStr = slotStart.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Chicago' });
        slots.push(`${dayStr} at ${formatTime(slotStart.toISOString())}`);
      }
    }
  }

  return slots;
}

/**
 * 3. Meeting prep — context about attendees from recent emails.
 */
export async function getMeetingPrep(event: CalendarEvent): Promise<string> {
  if (event.attendees.length === 0) return '';

  try {
    const { sequelize } = await import('../../config/database');
    const attendeeEmails = event.attendees.filter(a => !a.includes('colaberry.com'));
    if (attendeeEmails.length === 0) return '';

    const conditions = attendeeEmails.map(a => `ie.from_address ILIKE '%${a.replace(/'/g, '')}%'`).join(' OR ');
    const [recent] = await sequelize.query(
      `SELECT ie.from_name, ie.subject, ie.received_at FROM inbox_emails ie WHERE (${conditions}) ORDER BY ie.received_at DESC LIMIT 3`
    ) as [any[], unknown];

    if (recent.length === 0) return '';

    let prep = `Context for ${event.summary}:\n`;
    recent.forEach((r: any) => {
      prep += `- ${r.from_name || 'them'}: "${r.subject?.slice(0, 50)}" (${new Date(r.received_at).toLocaleDateString()})\n`;
    });
    return prep.trim();
  } catch {
    return '';
  }
}

/**
 * 4. Conflict detection — check if a new event conflicts.
 */
export async function checkConflicts(): Promise<CalendarEvent[]> {
  try {
    const events = await getTodaysEvents();

    // Filter out all-day events (no time component) and multi-day spans
    const timedEvents = events.filter(e => {
      if (!e.start || !e.end) return false;
      const start = new Date(e.start);
      const end = new Date(e.end);
      const durationMin = (end.getTime() - start.getTime()) / 60000;
      return durationMin > 0 && durationMin <= 480; // max 8 hours
    });

    const conflicts: CalendarEvent[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < timedEvents.length; i++) {
      for (let j = i + 1; j < timedEvents.length; j++) {
        // Skip if same event title (recurring instances)
        if (timedEvents[i].summary === timedEvents[j].summary) continue;

        const aStart = new Date(timedEvents[i].start);
        const aEnd = new Date(timedEvents[i].end);
        const bStart = new Date(timedEvents[j].start);
        const bEnd = new Date(timedEvents[j].end);

        if (aStart < bEnd && bStart < aEnd) {
          const key = `${timedEvents[j].summary}-${timedEvents[j].start}`;
          if (!seen.has(key)) {
            seen.add(key);
            conflicts.push(timedEvents[j]);
          }
        }
      }
    }
    return conflicts;
  } catch {
    return [];
  }
}

// Track what we've already sent so we don't spam
const sentPrepIds = new Set<string>();
let conflictAlertSentToday: string | null = null;

/**
 * Send meeting prep texts 15 min before each meeting. Once per meeting, once per day for conflicts.
 */
export async function sendUpcomingMeetingPreps(): Promise<void> {
  try {
    const events = await getTodaysEvents();
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];

    for (const event of events) {
      const start = new Date(event.start).getTime();
      const minsUntil = (start - now) / 60000;
      const eventKey = `${event.summary}-${event.start}`;

      if (minsUntil > 10 && minsUntil <= 15 && !sentPrepIds.has(eventKey)) {
        sentPrepIds.add(eventKey);

        let msg = `In 15 min: ${event.summary}`;
        if (event.attendees.length > 0) {
          msg += `\nWith: ${event.attendees.slice(0, 3).join(', ')}`;
        }

        await sendSms(msg);
        console.log(`${LOG_PREFIX} Sent prep for: ${event.summary}`);
      }
    }

    // Conflict check — once per day only
    if (conflictAlertSentToday !== today) {
      const conflicts = await checkConflicts();
      if (conflicts.length > 0) {
        conflictAlertSentToday = today;
        await sendSms(`${conflicts.length} calendar conflicts today.`);
      }
    }
  } catch (err: any) {
    console.error(`${LOG_PREFIX} Meeting prep failed: ${err.message}`);
  }
}
