/**
 * The three ShiftFill v4 weak spots (2026-11-20, project 34032fbd), each reduced
 * to the smallest input that reproduces it:
 *
 *   1. "fill gaps within 30 minutes" pulled into r0 on the word "call-out",
 *      while r4's demo still promised it;
 *   2. one story "As a scheduler" where every other said Dana;
 *   3. the verdict calling r2-r4 post-class roadmap while their due dates and
 *      week numbers packed them inside the build window.
 */
import { pullGuardsForward } from '../stagedGeneration';
import { adoptNamedPerson } from '../planPeople';
import { buildSchedule } from '../buildSchedule';
import { buildPlanDocument } from '../planDocument';
import { BuildPlan, PlanRequirement, PlanStory } from '../planContract';

const req = (id: string, kind: PlanRequirement['kind'], statement: string): PlanRequirement => ({
  id, kind, statement, priority: 'must', cluster: 'c',
});
const story = (id: string, release: string, narrative: string, over: Partial<PlanStory> = {}): PlanStory => ({
  id, release, title: id, narrative, fulfills: [], owner_agent: 'x',
  acceptance: ['Given a, when b, then c.'], task_guidance: 'g', failure_paths: ['f'], ...over,
});

describe('a target is not pulled ahead of the behaviour it measures', () => {
  const R = [
    req('REQ-001', 'FUNC', "The system must read call-out texts or emails and open a 'gap' for the office."),
    req('REQ-003', 'FUNC', 'The system must send text offers in waves of three people.'),
    req('REQ-008', 'SAFE', 'The system must never text a hygienist who is on approved leave.'),
    req('REQ-012', 'NFR', 'The system must fill gaps within 30 minutes of the call-out on 9 mornings out of 10.'),
  ];

  it('leaves the 30-minute target where the outline put it, next to its demo', () => {
    const m = new Map([['REQ-001', 'r0'], ['REQ-003', 'r1'], ['REQ-008', 'r4'], ['REQ-012', 'r4']]);
    pullGuardsForward(R, m);
    expect(m.get('REQ-012')).toBe('r4');
  });

  it('still pulls the guardrail in the same plan forward', () => {
    const m = new Map([['REQ-001', 'r0'], ['REQ-003', 'r1'], ['REQ-008', 'r4'], ['REQ-012', 'r4']]);
    pullGuardsForward(R, m);
    // Shares "text" with both behaviours; it lands with the earliest, never later than r1.
    expect(['r0', 'r1']).toContain(m.get('REQ-008'));
  });
});

describe('one person, one name', () => {
  const SOURCE = 'Dana fills hygienist shift gaps. 14 hygienists get offers by text.';
  const dana = (id: string) => story(id, 'r0', `As Dana, I want ${id}, so that it lands.`);

  it('turns the scheduler nobody mentioned into Dana, everywhere in the story', () => {
    const v4 = story('STORY-017', 'r0', 'As a scheduler, I want gaps filled within 30 minutes, so that staffing holds.', {
      acceptance: ['Given a gap is not filled in 30 minutes, Then an alert is sent to the scheduler'],
      task_guidance: 'Alert the scheduler when the window is exceeded.',
    });
    const [, out] = adoptNamedPerson([dana('STORY-001'), v4], SOURCE);
    expect(out.narrative).toBe('As Dana, I want gaps filled within 30 minutes, so that staffing holds.');
    expect(out.acceptance[0]).toBe('Given a gap is not filled in 30 minutes, Then an alert is sent to Dana');
    expect(out.task_guidance).toBe('Alert Dana when the window is exceeded.');
  });

  it('keeps a role the student actually named', () => {
    const h = story('STORY-008', 'r2', 'As a hygienist, I want one text, so that I can reply YES.');
    expect(adoptNamedPerson([dana('STORY-001'), h], SOURCE)[1]).toBe(h);
  });

  it('treats "As a system" as not a user', () => {
    const s = story('STORY-018', 'r0', 'As a system, I want to handle flu-season volume, so that no gap is missed.');
    expect(adoptNamedPerson([dana('STORY-001'), s], SOURCE)[1].narrative)
      .toBe('As Dana, I want to handle flu-season volume, so that no gap is missed.');
  });

  it('does nothing when two people are named, because the title could be either', () => {
    const stories = [dana('STORY-001'), story('STORY-002', 'r0', 'As Priya, I want x, so y.'),
      story('STORY-003', 'r0', 'As a scheduler, I want z, so w.')];
    expect(adoptNamedPerson(stories, SOURCE)[2].narrative).toMatch(/^As a scheduler/);
  });

  it('is idempotent', () => {
    const once = adoptNamedPerson([dana('STORY-001'), story('STORY-002', 'r0', 'As a scheduler, I want z, so w.')], SOURCE);
    expect(adoptNamedPerson(once, SOURCE)).toEqual(once);
  });
});

describe('the roadmap is dated after the demo, and the weeks follow the dates', () => {
  // 18 stories against a 7-week window is "over", exactly like ShiftFill v4.
  const releases = [0, 1, 2, 3, 4].map((i) => ({ key: `r${i}`, name: `R${i}`, week_start: i + 1, week_end: i + 1 }));
  const counts = [6, 3, 4, 3, 2];
  const storiesByRelease = new Map<string, string[]>();
  let n = 0;
  counts.forEach((c, i) => storiesByRelease.set(`r${i}`, Array.from({ length: c }, () => `STORY-${String(++n).padStart(3, '0')}`)));
  const window = { cohortStart: new Date('2026-09-03T00:00:00Z'), asOf: new Date('2026-11-20T00:00:00Z') };
  const sched = (roadmapAfterDemo?: boolean) => buildSchedule({ window, releases, storiesByRelease, roadmapAfterDemo });

  it('dates every roadmap story after demo day, a week apart', () => {
    const s = sched(true);
    expect(s.roadmapReleaseKeys.length).toBeGreaterThan(0);
    const road = s.tasks.filter((t) => s.roadmapReleaseKeys.includes(t.releaseKey));
    expect(road.every((t) => t.dueOn > s.demoDay)).toBe(true);
    const gaps = road.slice(1).map((t, i) => (t.dueOn.getTime() - road[i].dueOn.getTime()) / 86_400_000);
    expect(new Set(gaps)).toEqual(new Set([7]));
    expect(s.verdict).toMatch(/dated after demo day/);
  });

  it('spreads the committed releases over the whole build window', () => {
    const s = sched(true);
    const committed = s.tasks.filter((t) => !s.roadmapReleaseKeys.includes(t.releaseKey));
    const last = Math.max(...committed.map((t) => t.dueOn.getTime()));
    expect(committed.every((t) => t.dueOn <= s.buildEnd)).toBe(true);
    expect(last).toBe(s.buildEnd.getTime());
  });

  it('leaves the gov path, which does not ask for it, exactly as it was', () => {
    const s = sched();
    expect(s.tasks.every((t) => t.dueOn <= s.buildEnd)).toBe(true);
  });

  it('plan.json marks the roadmap and reads its weeks from the dates', () => {
    const s = sched(true);
    const plan: BuildPlan = {
      project_name: 'ShiftFill', descriptor: 'd', requirements: [],
      releases: releases.map((r) => ({ ...r, goal: 'g', demo: 'd' })),
      stories: [...storiesByRelease.entries()].flatMap(([rel, ids]) => ids.map((id) => story(id, rel, 'As Dana, I want x, so y.'))),
    };
    const doc = buildPlanDocument(plan, { schedule: s });
    const road = doc.releases.filter((r) => r.is_roadmap);
    expect(road.map((r) => r.key)).toEqual(s.roadmapReleaseKeys);
    expect(road.every((r) => r.week_start > doc.schedule!.build_weeks)).toBe(true);
    expect(doc.releases.filter((r) => !r.is_roadmap).every((r) => r.week_end <= doc.schedule!.build_weeks)).toBe(true);
  });
});
