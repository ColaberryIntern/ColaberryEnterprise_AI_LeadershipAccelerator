/**
 * WP-2 data, as pure functions:
 *  - plan steps: where each happens (by type), where it opens, its label, minutes and points; which ones the campus can mark done;
 *  - a step done on the campus keeps its place, ticked, when the server's next read of the plan drops it;
 *  - "Lv N" is a rung's place on the ladder (decision Q5);
 *  - "Happening here" and the urgent action come only from real facts;
 *  - the plan route is one path from the avatar through each unfinished stop.
 */
import { buildingForType, canComplete, planStops, stopDetail, withDone } from '../campusPlan';
import type { PlanStop } from '../campusPlan';
import type { TodayPlanItem } from '../../../services/capeApi';
import { levelOfRung } from '../../../services/bandLadder';
import { factsAt, inLabel, sessionStartMs, sourcesFor, urgentAt } from '../campusFacts';
import { planPathD } from '../CampusWorldMap';
import { CAMPUS_BUILDINGS } from '../campusMap';
import { doorOf } from '../walkPath';

const item = (o: Partial<TodayPlanItem>): TodayPlanItem => ({
  position: 0, kind: 'anchored', ref: 'card:c1', surface: 'today', type: 'deep_dive', render_band: 'learn', card_id: 'c1', title: 'Agents in depth',
  subtitle: null, description: null, image: null, video: null, blog: null, content: null, week: 5, estimated_time: 18, status: 'available',
  points: { learning: 10 }, interacted: false, slot: 'learn', chips: { why_this: '', level: '', proof: 'Learn' }, ...o,
} as unknown as TodayPlanItem);

describe('plan steps', () => {
  it('a curriculum card happens in its type\'s building, opens its own page, and carries label, minutes and points', () => {
    const [s] = planStops([item({})]);
    expect(s).toMatchObject({ buildingId: 'lecture', route: '/portal/runtime/c1', cardId: 'c1', label: 'Deep Dive', minutes: 18, points: 10, done: false });
    expect(stopDetail(s)).toBe('Deep Dive · 18 min');
    expect(stopDetail(s, true)).toBe('Deep Dive · 18 min · +10 pts');
    expect(canComplete(s)).toBe(true);
  });

  it('a knowledge check is at Cert Prep; a project task in the Studio opens its workspace and is done there', () => {
    const [kc, proj] = planStops([
      item({ type: 'knowledge_check', ref: 'card:k1', card_id: 'k1', student_label: 'Knowledge check' }),
      item({ type: 'project_task', ref: 'project:t9', card_id: null, project_id: 'p1', project_task_id: 't9', estimated_time: null, points: { builder: 50 } }),
    ]);
    expect(kc).toMatchObject({ buildingId: 'testing', label: 'Knowledge check' });
    expect(proj).toMatchObject({ buildingId: 'studio', cardId: null, minutes: null, points: 50 });
    expect(proj.route).toMatch(/^\/portal\/projects\/workspace\//);
    expect(canComplete(proj)).toBe(false);
  });

  it('ambient blogs and media can be marked done (Today\'s collect path); a community post cannot', () => {
    expect(canComplete({ cardId: null, ref: 'blog:b1' })).toBe(true);
    expect(canComplete({ cardId: null, ref: 'podcast:p1' })).toBe(true);
    expect(canComplete({ cardId: null, ref: 'community:x' })).toBe(false);
  });

  it('an unknown type falls back to its route\'s building, then the Schedule tower', () => {
    expect(buildingForType('mystery', 'card:x', '/portal/runtime/x')).toBe('tower');
    expect(buildingForType('mystery', 'community:1', '/portal/today')).toBe('commons');
    expect(buildingForType('ai_pulse', null, '/portal/today')).toBe('library');
  });
});

describe('withDone: a step done on the campus stays, ticked', () => {
  const s = (key: string, done = false) => ({ key, done } as PlanStop);
  it('keeps a done step the server dropped, at its old place, and ticks one it still lists', () => {
    const prev = [s('a'), s('b'), s('c')];
    const out = withDone(prev, [s('a'), s('c')], new Set(['b']));
    expect(out.map((x) => [x.key, x.done])).toEqual([['a', false], ['b', true], ['c', false]]);
    expect(withDone(null, [s('a')], new Set(['a']))[0].done).toBe(true);
  });
  it('running it twice gives the same list (idempotent)', () => {
    const prev = [s('a'), s('b')];
    const once = withDone(prev, [s('a')], new Set(['b']));
    expect(withDone(once, [s('a')], new Set(['b']))).toEqual(once);
  });
});

describe('Lv N (Q5)', () => {
  it('is the rung\'s place on the ladder, counting from 1; unknown or empty is null', () => {
    expect(levelOfRung('AI Aware I')).toBe(1);
    expect(levelOfRung('AI Enabled II')).toBe(4);
    expect(levelOfRung('AI Builder IV · Program Graduate')).toBe(8);
    expect(levelOfRung('Senior AI Architect')).toBe(12);
    expect(levelOfRung('')).toBeNull();
    expect(levelOfRung('Wizard')).toBeNull();
  });
});

describe('Happening here and the urgent action, from real facts only', () => {
  const now = new Date('2026-10-22T10:00:00').getTime();
  const session = { id: 's1', session_number: 5, title: 'Build Day', session_date: '2026-10-23', start_time: '13:00', end_time: '15:00', status: 'scheduled' as const,
    meeting_link: null, meeting_provider: null, timezone: 'America/Chicago', room_id: null };
  it('counts down in the prototype\'s words', () => {
    expect(inLabel(now + 12 * 60000, now)).toBe('in 12 min');
    expect(inLabel(now + (3 * 60 + 20) * 60000, now)).toBe('in 3h 20m');
    expect(inLabel(now + (27 * 60) * 60000, now)).toBe('in 1d 3h');
    expect(inLabel(now - 1, now)).toBe('now');
    expect(inLabel(now - 3 * 3600000, now)).toBe('earlier today'); // a start hours ago is never 'now'
    expect(inLabel(now - 2 * 86400000, now)).toBe('Oct 20');
    expect(sessionStartMs(session)).toBe(new Date('2026-10-23T13:00:00').getTime());
  });
  it('the Classroom says the plan minutes and the next class; nothing is said without a source', () => {
    const rows = factsAt('lecture', { session }, { points: null, rung: null, planMinutes: 96 }, now);
    expect(rows.map((r) => r.title)).toEqual(['Today’s plan', 'Next live class']);
    expect(rows[1].detail).toBe('Build Day · in 1d 3h');
    expect(factsAt('lecture', {}, { points: null, rung: null, planMinutes: null }, now)).toEqual([]);
    // WP-5: a session from an earlier day is never the "next" class
    expect(factsAt('lecture', { session: { ...session, session_date: '2026-04-02' } }, { points: null, rung: null, planMinutes: null }, now)).toEqual([]);
  });
  it('My Progress shows "Lv N · rung" and points; the Game Room the break left', () => {
    expect(factsAt('observatory', {}, { points: 1252, rung: 'AI Enabled II', planMinutes: null }, now)[0]).toMatchObject({ title: 'Lv 4 · AI Enabled II', detail: '1,252 pts' });
    expect(factsAt('arcade', { gameTime: { used_s: 180, cap_s: 900, left_s: 720, resets_at: '' } }, { points: null, rung: null, planMinutes: null }, now)[0].detail).toBe('12 min left · resets at midnight Central');
  });
  it('cert evidence is asked for members only (the page is paywalled)', () => {
    expect(sourcesFor('testing', 'member')).toEqual(['certVerified']);
    expect(sourcesFor('testing', 'explorer')).toEqual([]);
    expect(sourcesFor('testing', 'member', false)).toEqual([]); // locked to this member: no request the paywall would refuse
  });
  it('a class within 15 minutes, or live, takes over the Classroom\'s main action; not hours ahead', () => {
    const soon = { ...session, session_date: '2026-10-22', start_time: '10:10' };
    expect(urgentAt('lecture', { session: soon }, now)).toEqual({ label: 'Build Day · go now', route: '/portal/sessions' });
    expect(urgentAt('lecture', { session }, now)).toBeNull();
    expect(urgentAt('library', { session: soon }, now)).toBeNull();
  });
});

describe('the plan route on the map', () => {
  const b = (id: string) => CAMPUS_BUILDINGS.find((x) => x.id === id)!;
  it('starts where the avatar stands and ends at the last unfinished stop\'s door', () => {
    const from = { x: 500, y: 640, zone: 'gate' as const };
    const d = planPathD(from, [b('lecture'), b('testing')])!;
    expect(d.startsWith('M500 640')).toBe(true);
    const end = doorOf(b('testing'));
    expect(d.endsWith(`L${end.x} ${end.y}`)).toBe(true);
    expect(planPathD(from, [])).toBeNull();
  });
});
