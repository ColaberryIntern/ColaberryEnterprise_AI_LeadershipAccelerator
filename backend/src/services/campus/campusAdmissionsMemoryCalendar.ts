import type { AvailabilityResponse, CampusCalendarEvent, CampusEventInput } from '../calendarService';
import type { AdmissionsCalendarPort } from './campusAdmissionsCall';

/**
 * An in-memory admissions calendar (C20) for unit tests and the LOCAL e2e only, so neither ever reaches Google or sends an invite.
 * Selected by campusAdmissionsCalendarPort() only when CAMPUS_CALENDAR_STUB=1 AND NODE_ENV is not 'production'. Same rules as the
 * real one where they matter: weekdays 9:00-17:00 Central on a 30-minute grid, a 4-hour lead, a taken slot is not offered.
 */
const LEAD_MS = 4 * 60 * 60 * 1000;
const SLOT_MS = 30 * 60 * 1000;

function centralOffset(day: Date): string {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', timeZoneName: 'short' })
    .formatToParts(new Date(`${day.toISOString().slice(0, 10)}T12:00:00Z`)).find((p) => p.type === 'timeZoneName')?.value;
  return name === 'CDT' ? '-05:00' : '-06:00';
}

export function memoryAdmissionsCalendar(clock: () => Date = () => new Date()): AdmissionsCalendarPort & { events: CampusCalendarEvent[] } {
  const events: CampusCalendarEvent[] = [];
  let seq = 0;
  const port = {
    events,
    ownerEmail: 'admissions-owner@example.test',
    testRedirect: async () => null,
    async getAvailableSlots(days: number): Promise<AvailabilityResponse> {
      const now = clock();
      const dates: AvailabilityResponse['dates'] = [];
      for (let i = 0; i < days; i++) {
        const day = new Date(now.getTime() + i * 86_400_000);
        const dow = new Date(`${day.toISOString().slice(0, 10)}T12:00:00Z`).getUTCDay();
        if (dow === 0 || dow === 6) continue;
        const ymd = day.toISOString().slice(0, 10);
        const off = centralOffset(day);
        const slots = [];
        for (let h = 9; h < 17; h++) for (const m of [0, 30]) {
          const start = new Date(`${ymd}T${String(h).padStart(2, '0')}:${m ? '30' : '00'}:00${off}`);
          if (start.getTime() <= now.getTime() + LEAD_MS) continue;
          if (events.some((e) => new Date(e.startTime).getTime() === start.getTime())) continue;
          slots.push({ start: start.toISOString(), end: new Date(start.getTime() + SLOT_MS).toISOString() });
        }
        if (slots.length) dates.push({ date: ymd, slots });
      }
      return { dates, timezone: 'America/Chicago' };
    },
    async findEventsByPrivateProperty(key: string, value: string, timeMin: Date): Promise<CampusCalendarEvent[]> {
      return events.filter((e) => e.props[key] === value && new Date(e.endTime) > timeMin).sort((a, b) => a.startTime.localeCompare(b.startTime));
    },
    async insertCampusEvent(input: CampusEventInput): Promise<CampusCalendarEvent> {
      seq += 1;
      const ev: CampusCalendarEvent = {
        eventId: `mem${String(seq).padStart(6, '0')}`,
        startTime: input.slotStart.toISOString(),
        endTime: new Date(input.slotStart.getTime() + SLOT_MS).toISOString(),
        meetLink: '',
        props: { ...input.privateProps },
        created: new Date(clock().getTime() + seq).toISOString(),
      };
      events.push(ev);
      return ev;
    },
    async cancelCalendarEvent(eventId: string): Promise<void> {
      const i = events.findIndex((e) => e.eventId === eventId);
      if (i >= 0) events.splice(i, 1);
    },
  };
  return port;
}
