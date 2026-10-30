/**
 * C90: admissions calls book on the admissions calendar (Roselen in production), not the strategy-call calendar (Ali's).
 * Proves the target choice, that calendarService books and checks availability on the target it is given (acting as that
 * target's owner), that an admissions booking does not invite the fixed strategy-call staff, and that every admissions
 * caller passes the admissions target.
 */
const mockEnv: Record<string, string> = {
  googleCalendarId: 'ali@colaberry.com', googleCalendarOwnerEmail: 'ali@colaberry.com',
  googleServiceAccountEmail: 'svc@example.iam.gserviceaccount.com', googlePrivateKey: 'k',
  admissionsCalendarId: '', admissionsCalendarOwnerEmail: '',
};
jest.mock('../../config/env', () => ({ env: mockEnv }));
jest.mock('../settingsService', () => ({ getTestOverrides: async () => ({ enabled: false, email: '' }) }));

const mockSubjects: Array<string | undefined> = [];
const mockLists: Array<Record<string, unknown>> = [];
const mockInserts: Array<Record<string, unknown>> = [];
const mockPatches: Array<Record<string, unknown>> = [];
let mockPatch404On: string | null = null;
jest.mock('googleapis', () => ({
  google: {
    auth: { JWT: function JWT(this: unknown, o: { subject?: string }) { mockSubjects.push(o.subject); } },
    calendar: () => ({
      events: {
        list: async (p: Record<string, unknown>) => { mockLists.push(p); return { data: { items: [] } }; },
        insert: async (p: Record<string, unknown>) => { mockInserts.push(p); return { data: { id: 'ev1', hangoutLink: 'https://meet.example/x' } }; },
        delete: async () => ({}),
        patch: async (p: Record<string, unknown>) => {
          mockPatches.push(p);
          if (p.calendarId === mockPatch404On) { const e = new Error('Not Found') as Error & { code: number }; e.code = 404; throw e; }
          return { data: {} };
        },
      },
    }),
  },
}));

import fs from 'fs';
import path from 'path';
import { admissionsCalendar, defaultCalendar } from '../calendarTarget';
import { createBooking, insertCampusEvent, updateCalendarEvent } from '../calendarService';
import { admissionsCalendarPort } from '../campus/campusAdmissionsCalendarPort';

const set = (id: string, owner = '') => { mockEnv.admissionsCalendarId = id; mockEnv.admissionsCalendarOwnerEmail = owner; };
beforeEach(() => { set(''); mockSubjects.length = 0; mockLists.length = 0; mockInserts.length = 0; mockPatches.length = 0; mockPatch404On = null; });

describe('which calendar', () => {
  it('unset: admissions is the default calendar, so shipping the code changes nothing', () => {
    expect(admissionsCalendar()).toEqual(defaultCalendar());
    expect(defaultCalendar()).toEqual({ kind: 'default', calendarId: 'ali@colaberry.com', ownerEmail: 'ali@colaberry.com' });
  });
  it('set: the admissions calendar, acting as its owner (the id itself when it is an email)', () => {
    set('roselen@colaberry.com');
    expect(admissionsCalendar()).toEqual({ kind: 'admissions', calendarId: 'roselen@colaberry.com', ownerEmail: 'roselen@colaberry.com' });
    set('abc123@group.calendar.google.com', 'roselen@colaberry.com');
    expect(admissionsCalendar()).toEqual({ kind: 'admissions', calendarId: 'abc123@group.calendar.google.com', ownerEmail: 'roselen@colaberry.com' });
    set('plain-id-no-at');
    expect(admissionsCalendar().ownerEmail).toBeNull();
  });
});

describe('calendarService books on the target it is given', () => {
  const data = { name: 'Pat Lee', email: 'pat@example.com', company: '', phone: '', slotStart: '2026-11-03T15:00:00.000Z', timezone: 'America/Chicago' };
  it('an admissions booking: on the admissions calendar, acting as Roselen, inviting the attendee and Roselen only (not Ali, not Ram)', async () => {
    set('roselen@colaberry.com');
    await createBooking(data, admissionsCalendar());
    expect(mockLists[0].calendarId).toBe('roselen@colaberry.com'); // the conflict check reads her calendar
    expect(mockInserts[0].calendarId).toBe('roselen@colaberry.com');
    expect(mockSubjects).toContain('roselen@colaberry.com');
    expect(mockSubjects).not.toContain('ali@colaberry.com');
    const emails = ((mockInserts[0].requestBody as { attendees: Array<{ email: string }> }).attendees).map((a) => a.email);
    expect(emails).toEqual(['pat@example.com', 'roselen@colaberry.com']);
  });
  it('the strategy-call form (default): unchanged, on Ali\'s calendar with Ali and Ram invited', async () => {
    await createBooking(data);
    expect(mockInserts[0].calendarId).toBe('ali@colaberry.com');
    const emails = ((mockInserts[0].requestBody as { attendees: Array<{ email: string }> }).attendees).map((a) => a.email);
    expect(emails).toEqual(['pat@example.com', 'ali@colaberry.com', 'ali@colaberry.com', 'ram@colaberry.com']);
  });
  it('a campus event goes on the target calendar', async () => {
    set('roselen@colaberry.com');
    await insertCampusEvent({ summary: 's', description: 'd', slotStart: new Date('2026-11-03T15:00:00Z'), attendees: [], privateProps: {}, requestId: 'r' }, admissionsCalendar());
    expect(mockInserts[0].calendarId).toBe('roselen@colaberry.com');
  });
});

describe('every admissions caller uses the admissions calendar', () => {
  it('the campus "Talk to a person" port: books, finds and invites on the admissions calendar', async () => {
    set('roselen@colaberry.com');
    const port = admissionsCalendarPort();
    expect(port.ownerEmail).toBe('roselen@colaberry.com');
    await port.insertCampusEvent({ summary: 's', description: 'd', slotStart: new Date('2026-11-03T15:00:00Z'), attendees: [], privateProps: {}, requestId: 'r' });
    await port.findEventsByPrivateProperty('campus_enrollment_id', 'e1', new Date('2026-11-01T00:00:00Z'));
    expect(mockInserts[0].calendarId).toBe('roselen@colaberry.com');
    expect(mockLists[0].calendarId).toBe('roselen@colaberry.com');
  });
  it('the admissions appointment agent and Maya pass the admissions calendar for slots and bookings (pinned in the source)', () => {
    const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
    const agent = read('agents/admissions/admissionsAppointmentAgent.ts');
    expect(agent).toContain('getAvailableSlots(7, admissionsCalendar())');
    expect(agent).toMatch(/createBooking\(\{[\s\S]*?\}, admissionsCalendar\(\)\)/);
    const maya = read('mayaToolsService.ts');
    expect(maya).toContain('calendarGetSlots(days, admissionsCalendar())');
    expect(maya).toMatch(/createBooking\(\{[\s\S]*?\}, admissionsCalendar\(\)\)/);
  });
});

describe('C90: every booked call goes to Roselen, the website strategy-call form too', () => {
  it('the website form books and offers times on the bookings calendar (pinned in the controller)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'controllers', 'calendarController.ts'), 'utf8');
    expect(src).toContain('getAvailableSlots(Math.min(days, 60), admissionsCalendar())');
    expect(src).toMatch(/createBooking\(\{[\s\S]*?\}, admissionsCalendar\(\)\)/);
  });
  it('prep notes update the call on Roselen\x27s calendar; a call booked before the switch (404 there) falls back to the old calendar', async () => {
    set('roselen@colaberry.com');
    await updateCalendarEvent('ev1', 'prep');
    expect(mockPatches.map((p) => p.calendarId)).toEqual(['roselen@colaberry.com']);
    mockPatches.length = 0;
    mockPatch404On = 'roselen@colaberry.com';
    await updateCalendarEvent('old-ev', 'prep');
    expect(mockPatches.map((p) => p.calendarId)).toEqual(['roselen@colaberry.com', 'ali@colaberry.com']);
  });
  it('unset: prep notes go to the old calendar only, as before', async () => {
    await updateCalendarEvent('ev1', 'prep');
    expect(mockPatches.map((p) => p.calendarId)).toEqual(['ali@colaberry.com']);
  });
});
