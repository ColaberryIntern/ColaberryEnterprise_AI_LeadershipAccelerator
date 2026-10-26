/**
 * Campus round 7b (Basecamp C62, C63, C64), the pure parts.
 *  C62: events happen in the Meeting Rooms; Colaberry Live (a broadcast) stays in the Events Hall.
 *  C63: the weekly sessions in Central time (the Monday call reaches interns only, by the server); the Intern preview.
 *  C64: the 5-minute alerts: which are due, what they say, and that each shows once.
 */
import { EVENTS_BUILDING, ROOM_BUILDING, roomBuilding, roomKind } from '../campusRoomKind';
import { LIVE_BUILDING, liveBuildingOf } from '../campusOnAir';
import { buildingForPath, CAMPUS_BUILDINGS } from '../campusMap';
import { buildingForType } from '../campusPlan';
import { wayfinderSearch } from '../wayfinderIndex';
import { occurrences, slotOf } from '../events/weekdaySessions';
import { agenda, comingUpOf } from '../events/agendaModel';
import { effectiveAudience, previewingIntern, readViewAs, VIEW_AS_KEY, VIEW_AS_OPTIONS } from '../campusAudienceSwitch';
import { alertCopy, alertItems, dueAlerts, LEAD_MS, markShown, readShown } from '../events/alertsModel';
import type { WeekdaySessionView } from '../campusApi';
import type { OpenHouseView } from '../../../services/onboardingApi';

describe('C62: events in the Meeting Rooms, Colaberry Live in the Events Hall', () => {
  it('a broadcast room is live (the Events Hall); an event room is the Meeting Rooms', () => {
    expect(roomKind({ broadcast: true })).toBe('live');
    expect(roomKind({ broadcast: true, metadata: { kind: 'event' } })).toBe('live');
    expect(roomBuilding({ broadcast: true })).toBe('amphi');
    expect(roomKind({ metadata: { kind: 'event' } })).toBe('event');
    expect(roomBuilding({ metadata: { event_id: 'e-1' } })).toBe('commons');
    expect(ROOM_BUILDING).toEqual({ live: 'amphi', event: 'commons', class: 'lecture', session: 'commons', open: 'commons' });
  });
  it('Live stays in the Events Hall; events go to the Meeting Rooms', () => {
    expect(LIVE_BUILDING).toBe('amphi');
    expect(liveBuildingOf({ room_id: 'r', session_id: null })).toBe('amphi');
    expect(EVENTS_BUILDING).toBe('commons');
  });
  it('the events page is in the Meeting Rooms, and the Events Hall keeps its name', () => {
    expect(buildingForPath('/portal/events')?.id).toBe('commons');
    expect(CAMPUS_BUILDINGS.find((b) => b.id === 'amphi')?.name).toBe('Events Hall');
  });
  it('event plan steps and the weekday sessions are placed in the Meeting Rooms', () => {
    for (const t of ['event', 'demo_tuesday', 'kes_wednesday', 'marketing_friday']) expect(buildingForType(t, null, '/portal/today')).toBe('commons');
  });
  it('Where to? "open house" finds the Meeting Rooms; "colaberry live" finds the Events Hall', () => {
    const ctx = { audience: 'member' as const, workplace: false, buildings: [...CAMPUS_BUILDINGS], accessOf: () => 'open' as const, presence: null, desks: [], urgent: null, suggested: [] };
    const first = (q: string) => wayfinderSearch(q, ctx).find((i) => i.kind === 'building') as { buildingId?: string; id?: string } | undefined;
    expect(JSON.stringify(first('open house'))).toContain('commons');
    expect(JSON.stringify(first('colaberry live'))).toContain('amphi');
  });
});

const S = (o: Partial<WeekdaySessionView>): WeekdaySessionView => ({ day: 'monday', time: '9:00 AM', title: 'Intern standup', audience: 'interns_only', room_id: null, room_name: null, join_url: null, registration_url: null, ...o });
// Mon 26 Oct 2026, 8:00 AM CDT (13:00 UTC)
const MON_8AM = Date.parse('2026-10-26T13:00:00Z');

describe('C63: weekly sessions in Central time', () => {
  it.each([['9:00 AM', '9:00 AM'], ['9 AM', '9:00 AM'], ['10:30pm', '10:30 PM'], ['13:00', null], ['soon', null], ['0:30 AM', null]])('slotOf(%s) = %s', (a, b) => {
    expect(slotOf(a)).toBe(b);
  });
  it('Monday 9:00 AM is today at 9:00 CDT, then next Monday; Friday falls between', () => {
    const occ = occurrences([S({}), S({ day: 'friday', title: 'AI Friday Trends', audience: 'public' })], MON_8AM, 8);
    expect(occ.map((o) => [o.session.title, o.startIso])).toEqual([
      ['Intern standup', '2026-10-26T14:00:00.000Z'],
      ['AI Friday Trends', '2026-10-30T14:00:00.000Z'],
      ['Intern standup', '2026-11-02T15:00:00.000Z'], // CST after the 1 Nov change: still 9:00 AM Central
    ]);
  });
  it('a session that started more than an hour ago is gone; an unreadable time is skipped', () => {
    const at1015 = MON_8AM + 2.25 * 3600_000;
    expect(occurrences([S({})], at1015, 1)).toEqual([]);
    expect(occurrences([S({ time: 'whenever' })], MON_8AM, 7)).toEqual([]);
  });
  it('the agenda puts them in the Meeting Rooms; Coming up keeps an intern\'s, not a member\'s', () => {
    const occ = occurrences([S({}), S({ day: 'tuesday', title: 'AI Internship Presentation', audience: 'public' })], MON_8AM, 3);
    const now = new Date(MON_8AM);
    const asIntern = agenda({ sessions: [], events: [], bookings: [], now, weekly: { intern: true, occurrences: occ } });
    expect(asIntern.map((i) => [i.kind, i.building, i.internsOnly])).toEqual([['weekly', 'commons', true], ['weekly', 'commons', false]]);
    expect(comingUpOf(asIntern, now)).toHaveLength(2);
    const asMember = agenda({ sessions: [], events: [], bookings: [], now, weekly: { intern: false, occurrences: occ.filter((o) => o.session.audience === 'public') } });
    expect(asMember).toHaveLength(1);
    expect(comingUpOf(asMember, now)).toEqual([]);
  });
  it('the Intern preview draws the member campus, honored only while previewing is allowed', () => {
    expect(VIEW_AS_OPTIONS).toEqual(['member', 'intern', 'explorer', 'business', 'staff']);
    expect(effectiveAudience('staff', true, 'intern')).toBe('member');
    expect(effectiveAudience('staff', false, 'intern')).toBe('staff');
    expect(previewingIntern(true, 'intern')).toBe(true);
    expect(previewingIntern(false, 'intern')).toBe(false);
    window.localStorage.setItem(VIEW_AS_KEY, 'intern');
    expect(readViewAs()).toBe('intern');
    window.localStorage.setItem(VIEW_AS_KEY, 'admin');
    expect(readViewAs()).toBeNull();
    window.localStorage.removeItem(VIEW_AS_KEY);
  });
});

const EV = (o: Partial<OpenHouseView>): OpenHouseView => ({ id: 'e1', title: 'Open House', description: null, starts_at: '2026-10-26T13:05:00Z', ends_at: null, timezone: 'America/Chicago',
  registration_url: null, meeting_link: null, image_url: null, signup_count: null, is_registered: false, ...o } as OpenHouseView);

describe('C64: the 5-minute alerts', () => {
  const now = MON_8AM;
  it('every event and weekly session becomes an alert in its building; the interns-only call says so', () => {
    const items = alertItems([EV({})], occurrences([S({ time: '8:04 AM' })], now, 1), new Date(now));
    expect(items.map((i) => [i.title, i.building, i.internsOnly])).toEqual([['Open House', 'commons', false], ['Intern standup', 'commons', true]]);
  });
  it('due: within the next five minutes, not started, not shown before (boundaries exact)', () => {
    const at = (ms: number) => ({ key: `k${ms}`, title: 't', startIso: new Date(now + ms).toISOString(), building: 'commons' as const, internsOnly: false });
    const items = [at(LEAD_MS + 1000), at(LEAD_MS), at(60_000), at(0), at(-60_000)];
    expect(dueAlerts(items, now, new Set()).map((i) => i.key)).toEqual([`k${LEAD_MS}`, 'k60000']);
    expect(dueAlerts(items, now, new Set(['k60000'])).map((i) => i.key)).toEqual([`k${LEAD_MS}`]);
  });
  it('the copy: minutes left (one minute, singular) and where', () => {
    const i = { key: 'k', title: 'Intern standup', startIso: new Date(now + 4.2 * 60_000).toISOString(), building: 'commons' as const, internsOnly: true };
    expect(alertCopy(i, now, 'Meeting Rooms')).toEqual({ big: '🗓', title: 'Intern standup starts in 5 minutes', detail: 'Interns only · Meeting Rooms' });
    expect(alertCopy({ ...i, internsOnly: false, startIso: new Date(now + 20_000).toISOString() }, now, 'Meeting Rooms').title).toBe('Intern standup starts in 1 minute');
  });
  it('shown alerts are remembered for a day, then forgotten', () => {
    window.localStorage.clear();
    markShown(['a', 'b'], now);
    expect([...readShown(now + 1000)].sort()).toEqual(['a', 'b']);
    expect(readShown(now + 86_400_001).size).toBe(0);
    window.localStorage.setItem('cm-alerts-shown', 'not json');
    expect(readShown(now).size).toBe(0);
  });
});
