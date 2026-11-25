import { careerPrepSummary, interviewWhen } from '../logic/careerPrepCopy';
import { careerPrepDoorsFor, doorsText, CAREER_PREP_ROOM_PATH } from '../../campus/hq/careerPrepDoors';
import { buildHq, PLACEMENT_SECTION, readerLine, type HqNav } from '../../campus/hq/hqModel';
import { NAV_GROUPS } from '../../Layout/adminNav';
import type { PrepInterview, PrepSummary } from '../careerPrepApi';

const acme: PrepInterview = { id: 'i1', source: 'real', company: 'Acme', role: 'AI Engineer', type: 'technical', startsAt: '2026-11-19T20:00:00Z', readiness: 64, target: 75 };
const summary = (o: Partial<PrepSummary> = {}): PrepSummary => ({ stops: {}, interviews: [], today: '2026-11-16', ...o });

describe('careerPrepSummary', () => {
  it('greets with the next interview, in Central time', () => {
    expect(careerPrepSummary(summary({ firstName: 'Ali', nextInterview: acme })).greeting).toBe('Hi Ali. Your Acme interview is Thursday at 2:00 PM.');
  });
  it('greets a practice anchor by role, and asks for an interview when there is none', () => {
    expect(careerPrepSummary(summary({ firstName: 'Ali', nextInterview: { ...acme, source: 'practice', startsAt: undefined } })).greeting)
      .toBe('Hi Ali. You are practicing for AI Engineer.');
    expect(careerPrepSummary(summary()).greeting).toBe('Hi. Tell Cora which interview you are preparing for, and she will build your plan.');
  });
  it('shows only the stops that have data, never a zero', () => {
    expect(careerPrepSummary(summary()).stops).toEqual([]);
    expect(careerPrepSummary(summary({ stops: { readiness: 64, readyAt: 75, streak: 1, thisWeek: 40 } })).stops.map((s) => `${s.label}: ${s.value}`))
      .toEqual(['Readiness: 64', 'Ready at: 75', 'Streak: 1 day', 'This week: 40 min']);
    expect(careerPrepSummary(summary({ stops: { readiness: 64 } })).stops).toHaveLength(1);
  });
  it('lists the readiness gap as waiting on you only when there is a readiness', () => {
    expect(careerPrepSummary(summary({ nextInterview: acme })).waiting).toEqual(['Your Acme readiness · 64 now · 75 is ready']);
    expect(careerPrepSummary(summary({ nextInterview: { ...acme, readiness: undefined } })).waiting).toEqual([]);
  });
  it('keeps Central time across the DST change', () => {
    expect(interviewWhen('2026-11-02T20:00:00Z')).toBe('Monday at 2:00 PM'); // CST
    expect(interviewWhen('2026-10-30T19:00:00Z')).toBe('Friday at 2:00 PM'); // CDT
  });
});

describe('careerPrepDoorsFor: one door for students (CP2.2)', () => {
  it('gives a member with Career Prep on exactly one own door into the room', () => {
    const doors = careerPrepDoorsFor('member', { on: true });
    expect(doors).toHaveLength(1);
    expect(doors[0]).toMatchObject({ path: CAREER_PREP_ROOM_PATH, label: 'Career Prep', own: true, open: true });
  });
  it('gives an explorer it is on for (a pilot volunteer) the same one door', () => {
    expect(careerPrepDoorsFor('explorer', { on: true })).toEqual(careerPrepDoorsFor('member', { on: true }));
  });
  it('gives no doors to a student without it, a partner or staff', () => {
    for (const a of ['member', 'explorer'] as const) {
      expect(careerPrepDoorsFor(a, { on: false })).toEqual([]);
      expect(careerPrepDoorsFor(a, undefined)).toEqual([]); // flag still loading, or failed closed
    }
    expect(careerPrepDoorsFor('business', { on: true })).toEqual([]);
    expect(careerPrepDoorsFor('staff', { on: true })).toEqual([]);
  });
  it('pluralizes doors', () => {
    expect([doorsText(1), doorsText(4)]).toEqual(['1 door', '4 doors']);
  });
});

describe('the tower with Career Prep (CP2.2)', () => {
  const nav: HqNav = { pinned: [], groups: [
    { label: 'Placement', section: PLACEMENT_SECTION, links: [{ path: '/admin/placement/students', label: 'Student prep', icon: 'x', inPlace: true }] },
  ] };
  const floorOf = (hq: ReturnType<typeof buildHq>) => hq.floors.find((f) => f.label === 'Career Prep' || f.label === 'Hiring')!;

  it('a student with Career Prep on sees their one door, open, and never the staff room', () => {
    const f = floorOf(buildHq(() => false, false, 'member', nav, undefined, undefined, {}, { on: true }));
    expect(f.rooms.map((r) => r.path)).toEqual([CAREER_PREP_ROOM_PATH]);
    expect(f.access).toBe('all');
    expect(f.own).toBe(true);
  });
  it('nobody Career Prep is not open for sees the floor at all (Release 1 ships dark)', () => {
    const has = (hq: ReturnType<typeof buildHq>) => hq.floors.some((f) => f.label === 'Career Prep' || f.label === 'Hiring');
    expect(has(buildHq(() => false, false, 'member', nav, undefined, undefined, {}, { on: false }))).toBe(false);
    expect(has(buildHq(() => false, false, 'member', nav))).toBe(false); // flag still loading: no flash
    expect(has(buildHq(() => false, false, 'explorer', nav, undefined, undefined, {}, { on: false }))).toBe(false);
    expect(has(buildHq(() => false, false, 'explorer', nav))).toBe(false);
    expect(has(buildHq(() => false, false, 'business', nav))).toBe(false);
  });
  it('an explorer it is on for sees the floor, only its one door, and a visitor badge', () => {
    const hq = buildHq(() => false, false, 'explorer', nav, undefined, undefined, {}, { on: true });
    expect(floorOf(hq).rooms.map((r) => r.path)).toEqual([CAREER_PREP_ROOM_PATH]);
    expect(readerLine(hq, 'explorer')).toBe('Visitor badge · 1 floor');
  });
  it('leaves everyone else\'s tower exactly as it was: same floors, same numbers, no gap', () => {
    const real = { pinned: [], groups: NAV_GROUPS };
    const without = { pinned: [], groups: NAV_GROUPS.filter((g) => g.section !== PLACEMENT_SECTION) };
    const shape = (hq: ReturnType<typeof buildHq>) => hq.floors.map((f) => `${f.num} ${f.label}`);
    for (const audience of ['member', 'explorer', 'business'] as const) {
      expect(shape(buildHq(() => false, false, audience, real, undefined, undefined, {}, { on: false })))
        .toEqual(shape(buildHq(() => false, false, audience, without)));
    }
  });

  it('staff still get the Placement floor, under its staff name', () => {
    expect(buildHq(() => true, true, 'staff', nav).floors.some((f) => f.label === 'Placement')).toBe(true);
  });
});
