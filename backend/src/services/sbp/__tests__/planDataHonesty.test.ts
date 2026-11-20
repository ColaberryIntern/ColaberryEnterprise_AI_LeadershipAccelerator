/**
 * The plan data a Command Center reads has to agree with what the student said.
 *
 * A cold Claude Code run of ShiftFill v2's Story 000 (2026-11-20) built a rich
 * Command Center and then listed what the DATA got wrong: no demo-target
 * release, Dana missing from the roles though five stories are "As Dana",
 * guardrails shown as approval gates with no approver (one of them a hard rule
 * with nobody to approve), and a release plan with an empty week and the last
 * release squeezed onto the final day. Each test pins one of those at its source.
 */
import { buildPlanDocument, guardrailGate, rolesFrom } from '../planDocument';
import { paceReleases } from '../stagedGeneration';
import { buildSchedule } from '../buildSchedule';
import type { BuildPlan, PlanRelease, PlanStory } from '../planContract';
import raw from './fixtures/shiftfill-e2e-plan.json';

const plan = raw as unknown as BuildPlan;

const scheduleFor = (p: BuildPlan) => buildSchedule({
  window: { cohortStart: new Date('2026-07-23T00:00:00Z'), asOf: new Date('2026-11-19T15:00:00Z') },
  releases: p.releases,
  storiesByRelease: new Map(p.releases.map((r) => [r.key, p.stories.filter((s) => s.release === r.key).map((s) => s.id)])),
});

describe('a dated plan always has a demo target', () => {
  it('names the last release when the whole plan fits the window', () => {
    const schedule = scheduleFor(plan);
    expect(schedule.demoReleaseKey).toBeNull(); // the schedule's own "everything fits"
    const doc = buildPlanDocument(plan, { schedule });
    const last = [...plan.releases].sort((a, b) => a.key.localeCompare(b.key))
      .filter((r) => plan.stories.some((s) => s.release === r.key)).pop()!.key;
    expect(doc.schedule?.demo_release_key).toBe(last);
    expect(doc.releases.filter((r) => r.is_demo_target).map((r) => r.key)).toEqual([last]);
  });

  it('an undated plan claims no demo target', () => {
    const doc = buildPlanDocument(plan, {});
    expect(doc.releases.some((r) => r.is_demo_target)).toBe(false);
  });
});

describe('roles include a person named in a story', () => {
  const story = (narrative: string) => ({ narrative } as PlanStory);

  it('reads "As Dana," as well as "As a hygienist,"', () => {
    expect(rolesFrom([story('As Dana, I want a page at 7:30.'), story('As a hygienist, I want one text.')]))
      .toEqual(['Dana', 'hygienist']);
  });

  it('never lists the system itself, however it is written', () => {
    expect(rolesFrom([story('As a system, I want x.'), story('As the platform, I want y.'), story('As the agent, I want z.')]))
      .toEqual([]);
  });
});

describe('a guardrail says whether anyone can let it through', () => {
  const roles = ['Dana', 'hygienist'];

  it('an overtime rule that Dana approves is an approval with Dana as approver', () => {
    expect(guardrailGate('The system must never offer a shift that would push someone over 40 hours without Dana approving overtime.', roles))
      .toEqual({ kind: 'approval', approver: 'Dana' });
  });

  it('"approved leave" describes the leave; the rule is hard', () => {
    expect(guardrailGate('The system must never text a hygienist who is on approved leave.', roles))
      .toEqual({ kind: 'hard_rule', approver: null });
  });

  it('a rule with no approval wording is hard', () => {
    expect(guardrailGate('The system must never share why an employee called out.', roles))
      .toEqual({ kind: 'hard_rule', approver: null });
  });

  it('an approval with nobody named says so with a null approver, not a guess', () => {
    expect(guardrailGate('Any refund must be reviewed before it is sent.', roles))
      .toEqual({ kind: 'approval', approver: null });
  });

  it('a named person not among the roles is still found', () => {
    expect(guardrailGate('Payments over 5k must be signed off by Priya.', []))
      .toEqual({ kind: 'approval', approver: 'Priya' });
  });

  it('plan.json carries kind and approver on every guardrail', () => {
    for (const g of buildPlanDocument(plan, {}).derived.guardrails) {
      expect(['approval', 'hard_rule']).toContain(g.kind);
      if (g.kind === 'hard_rule') expect(g.approver).toBeNull();
    }
  });
});

describe('releases are paced by their stories, with no empty week', () => {
  const rel = (key: string, week_start: number, week_end: number) => ({ key, name: key, goal: '', demo: '', week_start, week_end } as PlanRelease);

  it('ShiftFill v2: wk1, wk2, wk4, wk5-6 with 5/4/4/1 stories becomes contiguous', () => {
    const paced = paceReleases(
      [rel('r0', 1, 1), rel('r1', 2, 2), rel('r2', 4, 4), rel('r3', 5, 6)],
      new Map([['r0', 5], ['r1', 4], ['r2', 4], ['r3', 1]]),
    );
    expect(paced.map((r) => [r.week_start, r.week_end])).toEqual([[1, 2], [3, 4], [5, 5], [6, 6]]);
  });

  it('every release gets at least one week, and the span is never narrower than the release count', () => {
    const paced = paceReleases(
      [rel('r0', 1, 1), rel('r1', 1, 1), rel('r2', 1, 1)],
      new Map([['r0', 10], ['r1', 1], ['r2', 1]]),
    );
    expect(paced.map((r) => [r.week_start, r.week_end])).toEqual([[1, 1], [2, 2], [3, 3]]);
  });

  it('weeks are contiguous and cover the whole span for any mix', () => {
    const counts = [7, 1, 3, 12, 2, 5];
    const paced = paceReleases(
      counts.map((_, i) => rel(`r${i}`, 1, 9)),
      new Map(counts.map((c, i) => [`r${i}`, c])),
    );
    expect(paced[0].week_start).toBe(1);
    expect(paced[paced.length - 1].week_end).toBe(9);
    for (let i = 1; i < paced.length; i++) expect(paced[i].week_start).toBe(paced[i - 1].week_end + 1);
  });

  it('a plan with no stories yet is left as the model wrote it', () => {
    const rels = [rel('r0', 1, 3)];
    expect(paceReleases(rels, new Map())).toBe(rels);
  });
});
