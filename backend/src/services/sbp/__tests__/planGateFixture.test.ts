/**
 * The gate, graded against the REAL pilot plan.
 *
 * `fixtures/pilot-dryrun-plan.json` is verbatim output from the pilot run on
 * 2026-08-09 for project 248d9d63 (Sponsor Dashboard). It is the plan a human
 * looked at and rejected. These tests assert the gate rejects it for the same
 * reasons a human did — and, just as importantly, that it does NOT reject the
 * genuine stories sitting alongside the bad ones.
 *
 * A rule that fires on the fixture but also on a good story is worse than no
 * rule, because it trains the repair loop to mangle working plans. Two earlier
 * revisions of these rules did exactly that and were caught in plan audit.
 */
import { gatePlan, GateRule } from '../planGate';
import { BuildPlan, PlanRequirement } from '../planContract';
import raw from './fixtures/pilot-dryrun-plan.json';

const pilot = raw as unknown as BuildPlan;

/** The four stories a human judged to be layers, not vertical slices. */
const LAYERS = ['STORY-008', 'STORY-009', 'STORY-011', 'STORY-012'];

/**
 * Two genuine slices that sit closest to the layers and are the likeliest
 * false positives — STORY-004 is narrated "As a system…", and STORY-010 shares
 * requirement REQ-014 with the scaffold STORY-012.
 */
const GENUINE = ['STORY-004', 'STORY-010'];

/**
 * The pilot generator had no CONSTRAINT kind, so it typed "connect to Postgres"
 * (REQ-011) and "use Mandrill" (REQ-012) as FUNC/must. This models what the
 * corrected generator emits: the same plan, with those two typed as constraints.
 */
function withConstraintsTyped(plan: BuildPlan): BuildPlan {
  return {
    ...plan,
    requirements: plan.requirements.map((r: PlanRequirement) =>
      r.id === 'REQ-011' || r.id === 'REQ-012' ? { ...r, kind: 'CONSTRAINT' as const } : r,
    ),
  };
}

const subjectsFor = (plan: BuildPlan, rule: GateRule): string[] =>
  gatePlan(plan).violations.filter((v) => v.rule === rule).map((v) => v.subject!).filter(Boolean);

/** Every rule that flags a story as not-a-vertical-slice. */
const layerRulesFor = (plan: BuildPlan): Set<string> =>
  new Set(
    gatePlan(plan).violations
      .filter((v) => v.rule === 'story_is_layer' || v.rule === 'story_redundant_scaffold')
      .map((v) => v.subject!),
  );

describe('the real pilot plan is rejected', () => {
  it('fails the gate', () => {
    expect(gatePlan(pilot).ok).toBe(false);
  });

  it('is the plan we think it is — 12 stories over 5 releases, 6 in r0', () => {
    expect(pilot.stories).toHaveLength(12);
    expect(pilot.releases).toHaveLength(5);
    expect(pilot.stories.filter((s) => s.release === 'r0')).toHaveLength(6);
  });
});

describe('release balance (T3)', () => {
  // 6 of 12 over 5 releases: mean 2.4, ceiling 4.8. A ">50%" rule would NOT
  // fire here, because 6/12 is exactly 50%. That is why the rule is 2x mean.
  it('rejects the 6-in-r0 skew', () => {
    expect(subjectsFor(pilot, 'release_unbalanced')).toContain('r0');
  });

  it('also rejects the committed run’s 8-in-r0 skew', () => {
    const committed: BuildPlan = {
      ...pilot,
      stories: pilot.stories.map((s, i) => ({ ...s, release: i < 8 ? 'r0' : `r${i - 7}` })),
    };
    expect(subjectsFor(committed, 'release_unbalanced')).toContain('r0');
  });

  it('accepts an evenly spread plan', () => {
    const balanced: BuildPlan = {
      ...pilot,
      stories: pilot.stories.map((s, i) => ({ ...s, release: `r${i % 5}` })),
    };
    expect(subjectsFor(balanced, 'release_unbalanced')).toEqual([]);
  });

  it('flags a release with no stories', () => {
    const empty: BuildPlan = {
      ...pilot,
      stories: pilot.stories.map((s) => ({ ...s, release: 'r0' })),
    };
    expect(subjectsFor(empty, 'release_empty')).toContain('r4');
  });
});

describe('layer detection (T2)', () => {
  const typed = withConstraintsTyped(pilot);

  it('catches the constraint-only layers, STORY-008 and STORY-009', () => {
    const flagged = layerRulesFor(typed);
    expect(flagged).toContain('STORY-008');   // fulfils only REQ-011 (Postgres)
    expect(flagged).toContain('STORY-009');   // fulfils only REQ-012 (Mandrill)
  });

  it('catches the redundant scaffold STORY-012, which adds no requirement of its own', () => {
    expect(subjectsFor(typed, 'story_redundant_scaffold')).toContain('STORY-012');
  });

  it('catches STORY-011 upstream, by rejecting the unfalsifiable requirement it exists to satisfy', () => {
    // REQ-018: "…in compliance with relevant regulations" — untestable.
    expect(subjectsFor(typed, 'requirement_unfalsifiable')).toContain('REQ-018');
    const story011 = pilot.stories.find((s) => s.id === 'STORY-011')!;
    expect(story011.fulfills).toEqual(['REQ-018']);
  });

  it('rejects all four layer stories, one way or another', () => {
    const result = gatePlan(typed);
    const flaggedStories = layerRulesFor(typed);
    const flaggedReqs = new Set(
      result.violations.filter((v) => v.rule === 'requirement_unfalsifiable').map((v) => v.subject!),
    );
    for (const id of LAYERS) {
      const story = pilot.stories.find((s) => s.id === id)!;
      const caughtDirectly = flaggedStories.has(id);
      const caughtViaRequirement = (story.fulfills ?? []).every((r) => flaggedReqs.has(r));
      expect(caughtDirectly || caughtViaRequirement).toBe(true);
    }
  });

  // The reason two earlier rule sets were rejected in plan audit.
  it.each(GENUINE)('does NOT flag the genuine slice %s', (id) => {
    expect(layerRulesFor(typed).has(id)).toBe(false);
  });

  it('flags no genuine slice at all — only the four known layers', () => {
    const flagged = [...layerRulesFor(typed)].sort();
    expect(flagged).toEqual(['STORY-008', 'STORY-009', 'STORY-012']);
  });
});

describe('the rules are load-bearing, not decorative', () => {
  it('re-typing REQ-011/012 as CONSTRAINT is what makes rule 1 fire', () => {
    // Untyped (as the pilot actually emitted it) STORY-008/009 escape rule 1 —
    // which is precisely why the pilot shipped them.
    const untyped = layerRulesFor(pilot);
    expect(untyped.has('STORY-008')).toBe(false);
    expect(layerRulesFor(withConstraintsTyped(pilot)).has('STORY-008')).toBe(true);
  });

  it('the >=2 subsumption threshold is what spares STORY-010', () => {
    // STORY-010 and STORY-012 share REQ-014. A rule of "adds nothing new"
    // would flag both; requiring subsumption of >=2 other stories flags only
    // the scaffold.
    const typed = withConstraintsTyped(pilot);
    const scaffolds = subjectsFor(typed, 'story_redundant_scaffold');
    expect(scaffolds).toContain('STORY-012');
    expect(scaffolds).not.toContain('STORY-010');
  });
});
