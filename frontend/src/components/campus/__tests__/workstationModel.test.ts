/**
 * Campus C19 (round 3 §2.3 + v6 D1 "Workstation copy"): the workstation's pure parts.
 *  - where it stands (the page it came from, else the kind's building) and its trail words ("Your desk", "Your seat");
 *  - "All of ‹section›" honors Workplace names;
 *  - the bench: a story's release in order with the current story "On your desk", done ones say how (commit vs you), skipped ones
 *    left off; a lesson's bench is today's plan matched by card id; at most BENCH_MAX tickets with the current one in view.
 */
import { BENCH_MAX, bareTitle, planBench, storyBench, storyTitle, workstationBuilding, workstationPlace } from '../workstation/workstationModel';
import type { ProjectTask } from '../../../pages/portal/projects/projectsStore';
import type { PlanStop } from '../campusPlan';

const task = (n: number, o: Partial<ProjectTask> = {}): ProjectTask => ({ id: `t${n}`, storyId: `STORY-00${n}`, title: `Story ${n}`, state: 'todo', due: 'up', ...o });
const route = (t: ProjectTask) => `/portal/projects/workspace/p1/${t.storyId}`;
const stop = (n: number, o: Partial<PlanStop> = {}): PlanStop => ({
  key: `k${n}`, title: `Item ${n}`, route: `/portal/runtime/c${n}`, buildingId: 'lecture', done: false, type: 'lesson', label: 'Deep Dive',
  minutes: 6, points: 15, ref: `card:c${n}`, ...o,
} as PlanStop);

describe('where a workstation stands', () => {
  it('uses the building of the page it was opened from when that building has a workstation', () => {
    expect(workstationBuilding('/portal/projects', 'lecture')).toBe('studio');
    expect(workstationBuilding('/portal/classroom', 'studio')).toBe('lecture');
  });
  it('falls back to the kind\'s own building for no origin, a building without a workstation, or an unknown path', () => {
    expect(workstationBuilding(null, 'studio')).toBe('studio');
    expect(workstationBuilding('/portal/schedule', 'lecture')).toBe('lecture');
    expect(workstationBuilding('/somewhere/else', 'lecture')).toBe('lecture');
  });
  it('reads the spot words and the section name, honoring Workplace names', () => {
    const studio = workstationPlace('studio', false);
    expect(studio).toMatchObject({ buildingId: 'studio', spot: 'Your desk', section: 'Project Studio', sectionRoute: '/portal/projects' });
    expect(workstationPlace('lecture', false).spot).toBe('Your seat');
    expect(workstationPlace('testing', false).spot).toBe('Your booth');
    expect(workstationPlace('lecture', false).section).toBe('Classroom');
    expect(workstationPlace('lecture', true).section).toBe('Training Room');
  });
});

describe('story titles', () => {
  it('says the story id once, whether or not the plan title already starts with it', () => {
    expect(storyTitle('STORY-001', 'A client books')).toBe('STORY-001 · A client books');
    expect(storyTitle('STORY-001', 'STORY-001 · A client books')).toBe('STORY-001 · A client books');
    expect(storyTitle(undefined, 'Demo prep')).toBe('Demo prep');
  });
  it('the bench drops a leading id, since the ticket tag carries it', () => {
    expect(bareTitle('STORY-001', 'STORY-001 · A client books')).toBe('A client books');
    expect(bareTitle('STORY-001', 'STORY-001: A client books')).toBe('A client books');
    expect(bareTitle('STORY-001', 'A client books')).toBe('A client books');
    expect(storyBench([task(1, { title: 'STORY-001 · Booking' })], 't1', route)[0].title).toBe('Booking');
  });
});

describe("a story's bench", () => {
  it('lists the release in order: done by commit, done by you, on your desk, queued; the current one has no route', () => {
    const b = storyBench([task(0, { state: 'done', verifiedAt: '2026-10-20' }), task(1, { state: 'done' }), task(2), task(3)], 't2', route);
    expect(b.map((t) => [t.tag, t.state, t.note])).toEqual([
      ['STORY-000', 'done', 'Done by commit'], ['STORY-001', 'done', 'Done'], ['STORY-002', 'active', 'On your desk'], ['STORY-003', 'queued', 'Queued'],
    ]);
    expect(b[2].route).toBeNull();
    expect(b[3].route).toBe('/portal/projects/workspace/p1/STORY-003');
  });
  it('a story the server verified reads done even when the local board still says todo', () => {
    expect(storyBench([task(0, { verifiedAt: '2026-10-20' }), task(1)], 't1', route)[0].state).toBe('done');
  });
  it('leaves skipped stories off the cork', () => {
    expect(storyBench([task(0, { state: 'skipped' }), task(1)], 't1', route).map((t) => t.key)).toEqual(['t1']);
  });
  it('holds at most BENCH_MAX tickets and keeps the current one in view with one before it', () => {
    const many = Array.from({ length: 12 }, (_, i) => task(i));
    const b = storyBench(many, 't4', route);
    expect(b).toHaveLength(BENCH_MAX);
    expect(b[0].key).toBe('t3');
    expect(b.find((t) => t.state === 'active')?.key).toBe('t4');
    // near the end the window stops at the last ticket rather than running short
    expect(storyBench(many, 't10', route).map((t) => t.key)).toEqual(['t6', 't7', 't8', 't9', 't10', 't11']);
    expect(storyBench(many, 't0', route)[0].key).toBe('t0');
  });
});

describe("a lesson's bench", () => {
  it("is today's plan with this card on your desk (matched by its card ref) and done steps done", () => {
    const b = planBench([stop(1, { done: true }), stop(2), stop(3)], 'c2');
    expect(b.map((t) => t.state)).toEqual(['done', 'active', 'queued']);
    expect(b[1].note).toBe('On your desk');
    expect(b[0].route).toBe('/portal/runtime/c1');
    expect(b[1].route).toBeNull();
  });
  it('matches by route when the plan step carries no card ref', () => {
    expect(planBench([stop(1, { ref: null })], 'c1')[0].state).toBe('active');
  });
  it('is empty with no plan, so the shell shows only the card itself', () => {
    expect(planBench(null, 'c1')).toEqual([]);
    expect(planBench([], 'c1')).toEqual([]);
  });
});
