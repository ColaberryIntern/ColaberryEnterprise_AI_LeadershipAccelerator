import { planBreakdown } from '../enterprisePlanFunnel';

/**
 * R23 Phase 5 — the plan breakdown, tested as the pure function it was extracted into.
 *
 * It was inside `enterpriseFlow` until this phase, where every one of these cases would have
 * needed a mocked database query to reach. The arithmetic belongs at the unit tier, which is
 * what the extraction bought beyond getting that file back under its size ceiling.
 */

const rows = (...services: Array<string | null>) => services.map((service) => ({ service }));

const count = (b: ReturnType<typeof planBreakdown>, key: string): number =>
  b.stages.find((s) => s.key === key)?.count ?? -1;

describe('the breakdown is a partition of the rows', () => {
  it('puts every row in exactly one bucket', () => {
    const b = planBreakdown(rows(
      'build', 'build', 'guide', 'train', 'not_sure', '', null, 'something else',
    ));

    expect(b.byPlan.get('build')).toBe(2);
    expect(b.byPlan.get('guide')).toBe(1);
    expect(b.byPlan.get('train')).toBe(1);
    expect(b.notSure).toBe(1);
    expect(b.unrecorded).toBe(2);
    expect(b.unreadable).toBe(1);

    const total = ['plan_build', 'plan_guide', 'plan_train', 'plan_not_sure', 'plan_unattributed']
      .reduce((sum, key) => sum + count(b, key), 0);
    expect(total).toBe(8);
  });

  it('reports zero rows as five zeros and no caveat at all', () => {
    const b = planBreakdown([]);

    expect(b.stages).toHaveLength(5);
    for (const stage of b.stages) expect(stage.count).toBe(0);
    // Not "0 inquiries cannot be attributed". With no rows there is nothing to warn about,
    // and a caveat here would be noise on a stream that is simply new.
    expect(b.caveats).toEqual([]);
  });

  it('keeps the plans in the site\'s own order, then the answer, then the gap', () => {
    // A breakdown whose plans appear in a different order from the pricing page makes a
    // reader check whether they are looking at the same three things.
    expect(planBreakdown([]).stages.map((s) => s.key)).toEqual([
      'plan_build', 'plan_guide', 'plan_train', 'plan_not_sure', 'plan_unattributed',
    ]);
  });

  it('treats an absent plan as zero, never as unknown', () => {
    const b = planBreakdown(rows('train'));
    expect(b.byPlan.get('build')).toBeUndefined();
    expect(count(b, 'plan_build')).toBe(0);
  });
});

describe('a recorded "not sure" is kept out of the gap', () => {
  it('counts it on its own stage and not on the unattributed one', () => {
    const b = planBreakdown(rows('not_sure', 'Not sure yet', 'not sure at all'));
    expect(b.notSure).toBe(3);
    expect(count(b, 'plan_not_sure')).toBe(3);
    expect(count(b, 'plan_unattributed')).toBe(0);
  });

  it('raises no caveat for it, because an answer is not a caveat', () => {
    expect(planBreakdown(rows('not_sure', 'not_sure')).caveats).toEqual([]);
  });

  it('says in the definition that it is an answer rather than a gap', () => {
    const def = planBreakdown(rows('not_sure')).stages.find((s) => s.key === 'plan_not_sure')!.definition;
    expect(def).toMatch(/1 inquiry\(ies\) chose "Not sure yet"/);
    expect(def).toMatch(/recorded answer, not a gap/i);
  });
});

describe('the gap says which gap it is', () => {
  it('counts the two kinds apart in its own definition', () => {
    const b = planBreakdown(rows('', '', 'mystery text'));
    expect(count(b, 'plan_unattributed')).toBe(3);
    const def = b.stages.find((s) => s.key === 'plan_unattributed')!.definition;
    expect(def).toMatch(/2 inquiry\(ies\) carry no service answer/);
    expect(def).toMatch(/1 carry text matching none of the three plans/);
  });

  it('raises one caveat per distinct problem, and only for the problems present', () => {
    expect(planBreakdown(rows('')).caveats).toHaveLength(1);
    expect(planBreakdown(rows('')).caveats[0]).toMatch(/no service answer at all/i);

    expect(planBreakdown(rows('mystery text')).caveats).toHaveLength(1);
    expect(planBreakdown(rows('mystery text')).caveats[0]).toMatch(/matching none of the three plans/i);

    expect(planBreakdown(rows('', 'mystery text')).caveats).toHaveLength(2);
    expect(planBreakdown(rows('build')).caveats).toEqual([]);
  });

  it('attributes a legacy display word rather than calling it a gap', () => {
    // Every row recorded before this phase posted the label. If those read as unattributed,
    // the board would report the history as unmeasured the day the form changed.
    const b = planBreakdown(rows('Build', 'Guide', 'Train'));
    expect(count(b, 'plan_unattributed')).toBe(0);
    expect(b.byPlan.get('build')).toBe(1);
    expect(b.byPlan.get('guide')).toBe(1);
    expect(b.byPlan.get('train')).toBe(1);
  });
});

describe('the copy carries the rules a reader needs', () => {
  it('says the plan counts are not cumulative', () => {
    for (const key of ['plan_build', 'plan_guide', 'plan_train']) {
      expect(planBreakdown([]).stages.find((s) => s.key === key)!.definition)
        .toMatch(/not cumulative reach/i);
    }
  });

  it('never advertises with the one word the TWC rule forbids', () => {
    // 40 TAC 807.172(d). The tree-wide ratchet covers source files; this covers the strings
    // this module GENERATES, which is where a count interpolated into copy could smuggle it.
    const everything = planBreakdown(rows('build', '', 'x')).stages
      .map((s) => `${s.label} ${s.definition}`)
      .concat(planBreakdown(rows('')).caveats)
      .join(' ');
    expect(everything.toLowerCase()).not.toMatch(/\bfree\b/);
  });

  it('carries no em dash or en dash, which product copy may not use', () => {
    const everything = planBreakdown(rows('build', '', 'x')).stages
      .map((s) => `${s.label} ${s.definition}`)
      .concat(planBreakdown(rows('', 'x')).caveats)
      .join(' ');
    expect(everything).not.toMatch(/[–—]/);
  });
});
