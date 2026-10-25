/**
 * WP-4, the words and the lists, pure: the concierge's kicker, greeting, lead and pulse per account (the prototype's renderMoment,
 * with only real numbers), "Right now" and the urgent card, and the Wayfinder's search (the prototype's keyword synonyms, AND
 * matching, groups and action labels).
 */
import { CAMPUS_BUILDINGS } from '../campusMap';
import type { CampusBuilding } from '../campusMap';
import type { CampusPresence } from '../campusApi';
import type { PlanStop } from '../campusPlan';
import type { StaffDesk } from '../campusPeopleApi';
import { kickerFor, greetingFor, greetLine, leadFor, momentOf, pulseLine, deskRole, wd } from '../home/conciergeCopy';
import type { LeadInput } from '../home/conciergeCopy';
import { rightNowRows, urgentOf, teamRows, eventIn } from '../home/rightNow';
import type { HomeAgenda } from '../home/useMapMoments';
import { wayfinderSearch, wayfinderEmpty, WF_LIMIT } from '../wayfinderIndex';
import type { WfContext } from '../wayfinderIndex';

const B = [...CAMPUS_BUILDINGS];
const bld = (id: string) => B.find((b) => b.id === id)! as CampusBuilding;
const now = new Date('2026-10-22T15:00:00Z'); // 10 AM Central
const mia = { enrollment_id: 'e-mia', display_name: 'Mia Lopez', avatar_url: null };
const PRESENCE: CampusPresence = { commons: { count: 3, people: [mia, { anonymous: true }] }, library: { count: 1, people: [] } };
const EMPTY: CampusPresence = { commons: { count: 0, people: [] } };
const desk = (id: 'reese' | 'dara' | 'maya', building: string, on = true): StaffDesk =>
  ({ id, name: id[0].toUpperCase() + id.slice(1), title: `${id} desk`, building, ai: true, on_duty: on, enrollment_id: null, opens: null, prompts: [] });
const stop = (o: Partial<PlanStop>): PlanStop => ({ key: 'k', title: 'Week 5 lessons', route: '/portal/x', buildingId: 'lecture', done: false, type: 'lesson', label: 'Lesson', minutes: 20, points: 0, ref: null, cardId: null, ...o });

describe('the kicker (D:1851-1854)', () => {
  const k = (o: Partial<Parameters<typeof kickerFor>[0]>) => kickerFor({ audience: 'member', here: null, workplace: false, live: false, now, ...o });
  it('an Explorer, staff and a partner always see their own; a partner sees the company only when we know it', () => {
    expect(k({ audience: 'explorer', here: bld('library') })).toBe('Explorer · visitor pass');
    expect(k({ audience: 'staff' })).toBe('Staff view · every building');
    expect(k({ audience: 'business' })).toBe('Partner visit');
    expect(k({ audience: 'business', company: 'Acme' })).toBe('Partner visit · Acme');
  });
  it('a member: the main gate (the lobby in Workplace names), "At the Library", but "At Project Studio" in the district; Live wins', () => {
    expect(k({})).toBe('At the main gate');
    expect(k({ workplace: true })).toBe('In the lobby');
    expect(k({ here: bld('library') })).toBe('At the Library');
    expect(k({ here: bld('studio') })).toBe('At Project Studio');
    expect(k({ here: bld('library'), live: true })).toMatch(/^Colaberry Live · Thursday/);
  });
  it('C17: out on the grass a member is "On campus" (never "At the main gate"); a building, or Live, still wins', () => {
    expect(k({ onLawn: true })).toBe('On campus');
    expect(k({ onLawn: true, workplace: true })).toBe('On campus');
    expect(k({ onLawn: true, here: bld('library') })).toBe('At the Library');
    expect(k({ onLawn: true, live: true })).toMatch(/^Colaberry Live/);
  });
});

describe('the greeting (D:1844-1848)', () => {
  it('morning before noon, the small hours too; a partner is welcomed; quiet hours say Hey (members)', () => {
    expect([greetingFor(3), greetingFor(11), greetingFor(12), greetingFor(17)]).toEqual(['Good morning', 'Good morning', 'Good afternoon', 'Good evening']);
    expect(greetLine('business', 'Elaine', 9, false)).toBe('Welcome, Elaine.');
    expect(greetLine('member', 'Ali', 2, true)).toBe('Hey, Ali.');
    expect(greetLine('explorer', 'Sam', 2, true)).toBe('Good morning, Sam.');
    expect(greetLine('member', '', 20, false)).toBe('Good evening.');
  });
});

describe('the lead (MOMENTS, finishTour)', () => {
  const base: LeadInput = { audience: 'member', moment: 'now', firstName: 'Ali', workplace: false, buildings: B, liveAt: 'Community Lounge', next: null, dutyNames: ['Reese', 'Dara'], tourStops: 9, onCampus: 4 };
  const lead = (o: Partial<LeadInput>) => leadFor({ ...base, ...o });
  it('the moment: first true one wins', () => {
    expect(momentOf({ live: true, justToured: true, presenceError: true, classSoon: true, quiet: true })).toBe('live');
    expect(momentOf({ live: false, justToured: false, presenceError: true, classSoon: true, quiet: true })).toBe('down');
    expect(momentOf({ live: false, justToured: false, presenceError: false, classSoon: true, quiet: true })).toBe('soon');
    expect(momentOf({ live: false, justToured: false, presenceError: false, classSoon: false, quiet: false })).toBe('now');
  });
  it('a member by moment, with real names on duty; Workplace speaks of HQ', () => {
    expect(lead({})).toBe('Nothing is starting soon, so this is focus time.');
    expect(lead({ moment: 'soon' })).toBe('Live class starts in a few minutes.');
    expect(lead({ moment: 'quiet' })).toBe('It’s quiet on campus right now — nobody else is online. Reese and Dara are still on duty if you need them.');
    expect(lead({ moment: 'quiet', dutyNames: [] })).toBe('It’s quiet on campus right now — nobody else is online.');
    expect(lead({ moment: 'live' })).toBe('Colaberry Live is on air. Follow the lit path to the Community Lounge, or watch from anywhere on campus.');
    expect(lead({ moment: 'soon', workplace: true })).toBe('Live session starts in a few minutes.');
    expect(lead({ moment: 'toured', next: stop({}) })).toBe('That’s everything in your seat, Ali. Your next step — Week 5 lessons — is waiting in the Classroom.');
  });
  it('the other accounts: Explorer, partner (the real stop count), staff (the real count, never "could use a hand")', () => {
    expect(lead({ audience: 'explorer' })).toBe('Look around freely. Buildings marked 🔒 are for enrolled members — you can still peek inside.');
    expect(lead({ audience: 'business', tourStops: 6 })).toBe('Here is where your team learns and builds. Take the six-stop tour, or explore on your own.');
    expect(lead({ audience: 'staff', onCampus: 1 })).toBe('1 learner on campus.');
    expect(lead({ audience: 'staff', onCampus: null })).toBe('Here is where everyone is right now.');
  });
});

describe('the pulse (renderPresence)', () => {
  const pl = (o: Partial<Parameters<typeof pulseLine>[0]>) => pulseLine({ audience: 'member', workplace: false, presence: PRESENCE, presenceError: false, buildings: B, staffOnDuty: true, ...o });
  it('member, Explorer, partner (their named people of all), quiet, down, unknown', () => {
    expect(pl({})).toEqual({ tone: 'live', bold: '4 classmates on campus', rest: 'busiest: Community Lounge (3)', walk: true });
    expect(pl({ audience: 'explorer' })!.bold).toBe('4 people on campus');
    expect(pl({ audience: 'business' })).toEqual({ tone: 'team', bold: '1 of your people on campus', rest: '4 learners in all', walk: true });
    expect(pl({ presence: EMPTY })).toEqual({ tone: 'quiet', bold: 'Quiet hours', rest: 'nobody else on campus · staff on duty 24/7', walk: false });
    expect(pl({ presence: EMPTY, staffOnDuty: false })!.rest).toBe('nobody else on campus');
    expect(pl({ presenceError: true })!.tone).toBe('down');
    expect(pl({ presence: null })).toBeNull();
    expect(pl({ workplace: true })!.bold).toBe('4 colleagues at HQ');
  });
  it('the help desk roles; wd leaves member words alone', () => {
    expect([deskRole(desk('reese', 'commons'), false), deskRole(desk('dara', 'library'), false), deskRole(desk('dara', 'library'), true), deskRole(desk('maya', 'gate'), false)])
      .toEqual(['Mentor', 'Curriculum', 'Learning', 'Admissions']);
    expect(wd('5 classmates on campus', false)).toBe('5 classmates on campus');
  });
});

const T0 = new Date('2026-10-22T10:00:00').getTime();
const session = (date: string, time: string, status: 'scheduled' | 'live' = 'scheduled') => ({ id: 's', session_number: 1, title: 'Build Day', session_date: date,
  start_time: time, end_time: '23:00', status, meeting_link: null, meeting_provider: null, timezone: 'America/Chicago', room_id: null });
const agenda = (s: ReturnType<typeof session> | null, eventDays: number | null): HomeAgenda => ({
  lecture: { session: s }, amphi: { event: eventDays === null ? null : ({ id: 'e', title: 'Open House', starts_at: new Date(T0 + eventDays * 86400000).toISOString() } as never) }, now: T0,
});

describe('Right now and the urgent card', () => {
  const rows = (o: Partial<Parameters<typeof rightNowRows>[0]>) => rightNowRows({ audience: 'member', workplace: false, buildings: B, stops: [stop({})], planMinutes: 96,
    agenda: agenda(session('2026-10-23', '13:00'), 15), presence: PRESENCE, presenceError: false, live: false, urgent: null, ...o });
  it('a member: the plan, the next class, where people are (three at most, the event drops off)', () => {
    expect(rows({}).map((r) => [r.key, r.title, r.detail])).toEqual([
      ['plan', 'Continue today’s plan', '20 min · Week 5 lessons'], ['class', 'Next live class', 'Build Day · in 1d 3h'], ['people', 'Drop into the Community Lounge', '3 people here now'],
    ]);
    expect(rows({ stops: [], presence: EMPTY }).map((r) => r.key)).toEqual(['class', 'event']);
    expect(rows({ stops: [], presence: EMPTY }).find((r) => r.key === 'event')!.detail).toBe('In 15d');
  });
  it('steps aside while live, for partners (their team list instead), and the urgent card replaces the class row', () => {
    expect(rows({ live: true })).toEqual([]);
    expect(rows({ audience: 'business' })).toEqual([]);
    const u = urgentOf('member', agenda(session('2026-10-22', '10:12'), null), B, false)!;
    expect(u).toEqual({ buildingId: 'lecture', title: 'Live class starts in 12 min', detail: 'Build Day · Classroom', route: '/portal/sessions' });
    expect(rows({ urgent: u }).map((r) => r.key)).not.toContain('class');
  });
  it('urgent: live now, far away, nobody but members', () => {
    expect(urgentOf('member', agenda(session('2026-10-22', '09:00', 'live'), null), B, false)!.title).toBe('Live class is starting now');
    expect(urgentOf('member', agenda(session('2026-10-23', '13:00'), null), B, false)).toBeNull();
    expect(urgentOf('explorer', agenda(session('2026-10-22', '10:12'), null), B, false)).toBeNull();
    expect(urgentOf('member', null, B, false)).toBeNull();
    expect(eventIn(new Date(T0 - 60000).toISOString(), T0)).toBeNull();
  });
  it('a partner\'s team: every named (teammate) entry, with where they are', () => {
    expect(teamRows(PRESENCE, false, B, false).map((r) => [r.name, r.detail])).toEqual([['Mia Lopez', 'In Community Lounge']]);
    expect(teamRows(PRESENCE, true, B, false)).toEqual([]);
  });
});

describe('the Wayfinder search (buildDest + matcher)', () => {
  const ctx = (o: Partial<WfContext> = {}): WfContext => ({ audience: 'member', workplace: false, buildings: B, accessOf: () => 'open', presence: PRESENCE,
    desks: [desk('reese', 'commons'), desk('dara', 'library'), desk('maya', 'gate', false)], urgent: null, suggested: [], ...o });
  const titles = (q: string, o?: Partial<WfContext>) => wayfinderSearch(q, ctx(o)).map((r) => r.title);
  it('the prototype\'s synonyms: "standup" finds the Career Center, "my points" My Progress, "cert prep" the Cert Prep Center first', () => {
    expect(titles('standup')[0]).toBe('Career Center');
    expect(titles('my points')[0]).toBe('My Progress');
    expect(titles('cert prep')[0]).toBe('Cert Prep Center');
  });
  it('every word must match (AND); nothing matches nothing', () => {
    expect(titles('points library')).toEqual([]);
    expect(titles('zzzz')).toEqual([]);
  });
  it('people: only those the server named, the staff on duty; partners see no staff', () => {
    expect(titles('mia')).toEqual(['Mia Lopez']);
    expect(wayfinderSearch('mia', ctx())[0]).toMatchObject({ kind: 'person', action: 'View', buildingId: 'commons' });
    expect(titles('mentor')[0]).toBe('Reese');
    expect(titles('admissions')).not.toContain('Maya'); // off duty
    expect(titles('mentor', { audience: 'business' })).not.toContain('Reese');
  });
  it('rooms carry their page, buildings their action; an Explorer\'s locked building says 🔒 Peek', () => {
    const room = wayfinderSearch('classroom', ctx()).find((r) => r.kind === 'room');
    expect(room).toMatchObject({ sub: 'in Classroom', action: 'Walk →' });
    expect(room!.route).toMatch(/^\/portal\//);
    expect(wayfinderSearch('cert', ctx({ audience: 'explorer', accessOf: (b) => (b.id === 'testing' ? 'locked' : 'open') })).find((r) => r.kind === 'building')!.action).toBe('🔒 Peek');
    expect(wayfinderSearch('a', ctx()).length).toBeLessThanOrEqual(WF_LIMIT + 5);
  });
  it('"late" puts what is starting first; the empty Wayfinder groups Happening now, Suggested, Staff, Help (C20), All buildings', () => {
    const urgent = { buildingId: 'lecture' as const, title: 'Live class starts in 4 min', detail: 'Build Day · Classroom' };
    expect(wayfinderSearch('late', ctx({ urgent }))[0]).toMatchObject({ kind: 'urgent', action: 'Run →', run: true });
    const groups = Array.from(new Set(wayfinderEmpty(ctx({ urgent, suggested: [{ key: 'plan', buildingId: 'lecture', title: 'Continue today’s plan', detail: '~96 min' }] })).map((r) => r.group)));
    expect(groups).toEqual(['Happening now', 'Suggested for you', 'Staff · always on', 'Help', 'All buildings']);
    expect(wayfinderEmpty(ctx()).filter((r) => r.group === 'All buildings')).toHaveLength(B.length);
  });
});
