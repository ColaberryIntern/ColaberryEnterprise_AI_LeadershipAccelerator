import {
  FUNNEL_STAGES,
  COUNTABLE_STAGES,
  assertEveryStageHasAnEvidencedTrigger,
  assertAbsentStagesAreDeclared,
  assertStagesAreOrderedAndDense,
  assertOpensAreNotEngagement,
} from '../funnelStages';

/**
 * C8.4 acceptance: "Every stage has a written definition and an evidenced trigger."
 *
 * The ticket's own success metric is that two people independently count the pipeline
 * the same way, so these assertions are about ambiguity as much as correctness: a stage
 * whose trigger does not name a queryable thing is a stage two readers will count
 * differently.
 */
describe('the funnel is ten ordered stages, each with a definition', () => {
  it('has ten stages, densely numbered, with unique keys', () => {
    expect(FUNNEL_STAGES).toHaveLength(10);
    expect(() => assertStagesAreOrderedAndDense()).not.toThrow();
  });

  it('gives every stage a definition a second reader could apply', () => {
    for (const s of FUNNEL_STAGES) {
      expect(s.definition.length).toBeGreaterThan(25);
      expect(s.label.length).toBeGreaterThan(0);
    }
  });

  it('gives every stage an evidenced trigger naming its own source', () => {
    expect(assertEveryStageHasAnEvidencedTrigger()).toBe(10);
  });

  it('declares a stage with no source rather than inferring it', () => {
    expect(() => assertAbsentStagesAreDeclared()).not.toThrow();
    const absent = FUNNEL_STAGES.filter((s) => s.evidence === 'absent');
    expect(absent.map((s) => s.key)).toEqual(['demo_delivered', 'pilot_running']);
    for (const s of absent) expect(s.trigger).toMatch(/^NONE/);
  });

  it('separates "no source" from "source exists but is empty"', () => {
    // The distinction C8.2 established and this ticket depends on: an empty table is a
    // measured zero with an unfilled pipe, not a missing capability.
    const empty = FUNNEL_STAGES.filter((s) => s.evidence === 'empty');
    // `mapped` joined this list on 2026-10-24 when C8.3's deploy landed: the column
    // is live and empty, where it had been declared undeployed.
    expect(empty.map((s) => s.key))
      .toEqual(['mapped', 'pilot_proposed', 'contract', 'expansion']);
    for (const s of empty) expect(s.source).toBeTruthy();
  });
});

describe('an open is not engagement, and neither is a click', () => {
  it('triggers Engaged on a reply or an answered call only', () => {
    const engaged = FUNNEL_STAGES.find((s) => s.key === 'engaged')!;
    expect(engaged.trigger).toContain('replied');
    expect(engaged.trigger).toContain('answered');
    expect(engaged.trigger).not.toContain('opened');
    expect(engaged.trigger).not.toContain('clicked');
  });

  it('records the exclusion and the number it would have produced', () => {
    // The decision has to stay legible, because the looser rule is the tempting one and
    // it changes the headline by a factor of 400.
    const engaged = FUNNEL_STAGES.find((s) => s.key === 'engaged')!;
    expect(engaged.excludes).toMatch(/13,892/);
    expect(engaged.excludes).toMatch(/5,837/);
    expect(engaged.excludes).toMatch(/Privacy Protection|scanner/);
  });

  it('FAILS the build if a later edit folds opens into engagement', () => {
    expect(() => assertOpensAreNotEngagement()).not.toThrow();
  });

  it('does not count a bounce as contact', () => {
    // A bounce is evidence the send failed. An account whose only record is a bounce has
    // not been contacted, and counting it would inflate the top of the funnel by 440.
    const contacted = FUNNEL_STAGES.find((s) => s.key === 'contacted')!;
    expect(contacted.trigger).not.toContain('bounced');
    expect(contacted.excludes).toMatch(/bounced/);
  });
});

describe('the stages that overstate the funnel if read loosely', () => {
  it('calls stage 5 "Meeting booked", not "Meeting"', () => {
    // Nothing records a commercial meeting as HELD; the completed_at columns in the
    // schema belong to build, cert and internship-interview sessions.
    const s = FUNNEL_STAGES.find((x) => x.key === 'meeting_booked')!;
    expect(s.label).toBe('Meeting booked');
    expect(s.definition).toMatch(/not yet held/i);
    expect(s.excludes).toMatch(/HELD/);
  });

  it('refuses to treat the two active delivery_engagements as running pilots', () => {
    // Both have no start, no end, no lead and no metadata, and one is named
    // "demo engagement". Counting them would overstate the bottom of the funnel by two.
    const s = FUNNEL_STAGES.find((x) => x.key === 'pilot_running')!;
    expect(s.evidence).toBe('absent');
    expect(s.excludes).toMatch(/demo engagement/);
  });

  it('does not let gov_proposal_response stand in for a priced proposal', () => {
    const s = FUNNEL_STAGES.find((x) => x.key === 'pilot_proposed')!;
    expect(s.excludes).toMatch(/gov_proposal_response/);
  });

  it('does not let free-text company stand in for the account join', () => {
    const s = FUNNEL_STAGES.find((x) => x.key === 'mapped')!;
    expect(s.excludes).toMatch(/Colaberry/);
  });
});

describe('what is countable today is stated, not implied', () => {
  it('splits the ten stages into countable, undeployed and absent, with none left over', () => {
    // Asserted by KEY rather than by length: a count that drifts tells you something is
    // wrong, and the keys tell you what.
    expect(COUNTABLE_STAGES.map((s) => s.key)).toEqual([
      'target', 'mapped', 'contacted', 'engaged', 'meeting_booked',
      'pilot_proposed', 'contract', 'expansion',
    ]);
    const byState = (state: string) =>
      FUNNEL_STAGES.filter((s) => s.evidence === state).map((s) => s.key);
    // Nothing is undeployed any more: C8.3's deploy landed on 2026-10-24. The
    // `undeployed` state stays in the type because it is the honest answer
    // whenever merged code has not reached production, which recurs.
    expect(byState('undeployed')).toEqual([]);
    expect(byState('absent')).toEqual(['demo_delivered', 'pilot_running']);
    // 8 countable + 0 undeployed + 2 absent accounts for all ten.
    expect(COUNTABLE_STAGES.length + 0 + 2).toBe(FUNNEL_STAGES.length);
  });

  it('records that mapped moved from undeployed to empty when the deploy landed', () => {
    // It read `undeployed` when C8.4 shipped, which was true then. The deploy landed
    // on 2026-10-24. The SERVICE always decided this dynamically from the live
    // schema, so behavior never depended on the label - but a stale label on a board
    // whose whole subject is honest measurement is a defect of its own.
    const mapped = FUNNEL_STAGES.find((s) => s.key === 'mapped')!;
    expect(mapped.evidence).toBe('empty');
    expect(mapped.rationale).toMatch(/deploy landed on 2026-10-24/);
  });
});
