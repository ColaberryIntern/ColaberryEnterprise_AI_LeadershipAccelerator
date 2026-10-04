import { requirementCoverage, coverageSummary } from '../requirementCoverage';
import type { ProjectUnderstanding, UnderstandingItem, UnderstandingDimension } from '../projectUnderstanding';
import type { BuildPlan, PlanRequirement } from '../../sbp/planContract';

/**
 * Stated against planned.
 *
 *     "I want to show all the requirements through this process."
 *     (Ali, 2026-09-29, after Swati's detailed requirements came back short)
 *
 * The two source cuts are fixed, but neither proves the model complied. Every
 * gate rule reads the plan against ITSELF — `must_uncovered` means "a
 * requirement IN THE PLAN has no story" — so a requirement that never entered
 * is invisible to all seventeen. This is the only thing looking across the
 * boundary, and these pin what it may and may not claim.
 */

const item = (
  dimension: UnderstandingDimension, value: string, over: Partial<UnderstandingItem> = {},
): UnderstandingItem => ({
  dimension, value, classification: 'FACT', provenance: 'customer_stated', ...over,
} as UnderstandingItem);

const understanding = (items: UnderstandingItem[]): ProjectUnderstanding => ({
  title: 'Bid qualification assistant', proposed_surfaces: [], items,
});

const req = (id: string, from?: string[]): PlanRequirement => ({
  id, statement: `${id} does a thing.`, kind: 'FUNC', priority: 'must', cluster: 'Core',
  ...(from ? { from_dimensions: from } : {}),
} as PlanRequirement);

const plan = (requirements: PlanRequirement[]): BuildPlan => ({
  project_name: 'Bid qualification assistant', descriptor: 'd',
  requirements, releases: [], stories: [],
} as unknown as BuildPlan);

describe('what the customer said is carried through verbatim', () => {
  it('reports every stated item, not a count', () => {
    // The whole point: Ali reads the requirements himself. A number tells him
    // something is missing and never what.
    const u = understanding([
      item('constraints', 'Must never auto-submit a bid without a human.'),
      item('constraints', 'Runs inside our VPC.'),
      item('systems', 'Sam.gov and Bonfire.'),
    ]);
    const c = requirementCoverage({ understanding: u, plan: plan([req('REQ-001', ['constraints'])]) });

    expect(c.stated_items).toBe(3);
    const constraints = c.dimensions.find((d) => d.dimension === 'constraints')!;
    expect(constraints.stated).toEqual([
      'Must never auto-submit a bid without a human.',
      'Runs inside our VPC.',
    ]);
  });

  it('skips dimensions the customer never filled in', () => {
    const c = requirementCoverage({
      understanding: understanding([item('systems', 'Sam.gov.')]),
      plan: plan([req('REQ-001', ['systems'])]),
    });
    expect(c.dimensions.map((d) => d.dimension)).toEqual(['systems']);
  });
});

describe('an area nothing cites', () => {
  it('is named, which is the first place to look for a lost requirement', () => {
    const u = understanding([
      item('constraints', 'Never auto-submit.'),
      item('approval_points', 'A director signs off over $50k.'),
    ]);
    // The plan cites constraints and says nothing about approval_points.
    const c = requirementCoverage({ understanding: u, plan: plan([req('REQ-001', ['constraints'])]) });

    expect(c.unaccounted_dimensions).toEqual(['approval_points']);
    expect(c.dimensions.find((d) => d.dimension === 'approval_points')!.unaccounted).toBe(true);
    expect(c.dimensions.find((d) => d.dimension === 'constraints')!.unaccounted).toBe(false);
  });

  it('is clean when every area produced something', () => {
    // Honesty runs both ways: a false alarm sends someone hunting a
    // requirement that is present.
    const u = understanding([item('constraints', 'a'), item('systems', 'b')]);
    const c = requirementCoverage({
      understanding: u,
      plan: plan([req('REQ-001', ['constraints']), req('REQ-002', ['systems'])]),
    });
    expect(c.unaccounted_dimensions).toEqual([]);
  });

  it('accuses nothing before a plan exists', () => {
    // Pre-decomposition, nothing is unaccounted for — it simply has not been
    // decomposed yet. Reporting it as a gap would cry wolf on every intake.
    const c = requirementCoverage({
      understanding: understanding([item('constraints', 'a')]), plan: null,
    });
    expect(c.unaccounted_dimensions).toEqual([]);
    expect(c.planned_requirements).toBe(0);
  });
});

describe('requirements the model added on its own', () => {
  it('separates them from what the customer asked for', () => {
    const c = requirementCoverage({
      understanding: understanding([item('constraints', 'a')]),
      plan: plan([req('REQ-001', ['constraints']), req('REQ-002')]),
    });
    expect(c.requirements_without_provenance).toEqual(['REQ-002']);
  });

  it('does not treat missing provenance as a fault', () => {
    // Provenance is optional and absence means "unknown", never "caused by
    // nothing" — so an unprovenanced requirement must not make an area read as
    // unaccounted.
    const c = requirementCoverage({
      understanding: understanding([item('constraints', 'a')]),
      plan: plan([req('REQ-001', ['constraints']), req('REQ-002')]),
    });
    expect(c.unaccounted_dimensions).toEqual([]);
  });
});

describe('what the intake could not carry', () => {
  it('is passed straight through, never dropped a second time', () => {
    const dropped = [{ dimension: 'constraints', value: 'A very long one.', reason: 'clipped' }];
    const c = requirementCoverage({
      understanding: understanding([item('constraints', 'a')]),
      plan: plan([req('REQ-001', ['constraints'])]),
      dropped,
    });
    expect(c.dropped).toEqual(dropped);
  });
});

describe('the one-line summary', () => {
  it('says what was measured, not something stronger', () => {
    const u = understanding([item('constraints', 'a'), item('approval_points', 'b')]);
    const line = coverageSummary(requirementCoverage({
      understanding: u, plan: plan([req('REQ-001', ['constraints'])]),
    }));
    // "areas cited", never "requirements covered": dimensions are the honest
    // granularity, and the sentence has to resist being read as item-level.
    expect(line).toContain('2 things said across 2 areas became 1 requirements');
    expect(line).toContain('1 of 2 areas are cited');
    expect(line).toContain('nothing cites: approval_points');
  });

  it('says so plainly when there is no plan', () => {
    expect(coverageSummary(requirementCoverage({
      understanding: understanding([item('constraints', 'a')]), plan: null,
    }))).toBe('No plan yet.');
  });

  it('mentions intake losses when there were any', () => {
    const line = coverageSummary(requirementCoverage({
      understanding: understanding([item('constraints', 'a')]),
      plan: plan([req('REQ-001', ['constraints'])]),
      dropped: [{ dimension: 'constraints', value: 'x', reason: 'clipped' }],
    }));
    expect(line).toContain('1 item(s) could not be carried at intake');
  });
});
