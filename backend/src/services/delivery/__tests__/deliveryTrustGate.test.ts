/**
 * Contract tests for the Trust Before Intelligence release gate.
 *
 * The property under test: a production-bound agent cannot reach production without all
 * six INPACT dimensions addressed and evaluated. Absence is failure, not "not applicable".
 */
import { INPACT_DIMENSIONS } from '../../../modules/delivery/inpact';
import type { DeliveryAgentDefinitionAttributes } from '../../../models/DeliveryAgentDefinition';
import type { DeliveryAgentTrustRequirementAttributes } from '../../../models/DeliveryAgentTrustRequirement';
import { assessProjectTrustCoverage, evaluateAgentTrust } from '../deliveryTrustGate';

const agent = (
  overrides: Partial<DeliveryAgentDefinitionAttributes> = {},
): DeliveryAgentDefinitionAttributes => ({
  delivery_project_id: 'p1',
  name: 'Invoice Router',
  purpose: 'Routes invoices to the right approver.',
  business_owner_identity_id: 'owner-1',
  human_owner_identity_id: 'op-1',
  autonomy_boundary: 'R2',
  prohibited_actions: ['issue_payment'],
  evaluation_suite: { cases: 12 },
  deployment_intent: 'production_bound',
  status: 'approved',
  version: 1,
  approved_version: 1,
  ...overrides,
});

const complete = (
  dimension: string,
  overrides: Partial<DeliveryAgentTrustRequirementAttributes> = {},
): DeliveryAgentTrustRequirementAttributes => ({
  agent_definition_id: 'a1',
  dimension,
  requirement: `${dimension} requirement`,
  implementation_evidence: 'Built and wired.',
  evaluation: 'Covered by eval suite case 3.',
  owner_identity_id: 'owner-1',
  status: 'evaluated',
  score: 5,
  ...overrides,
});

const allSix = () => INPACT_DIMENSIONS.map((d) => complete(d));

describe('a fully addressed production agent passes', () => {
  it('passes with all six dimensions evaluated', () => {
    const result = evaluateAgentTrust(agent(), allSix());
    expect(result.gated).toBe(true);
    expect(result.passes).toBe(true);
    expect(result.blockingFindings).toEqual([]);
    expect(result.addressedDimensions).toHaveLength(6);
    expect(result.missingDimensions).toEqual([]);
  });

  it('reports the book’s 100-point headline when all six are scored', () => {
    // All fives out of six: 30/36 -> 83.
    expect(evaluateAgentTrust(agent(), allSix()).headlineScore).toBe(83);
  });

  it('headline is null when a score is missing', () => {
    const reqs = allSix();
    reqs[0] = complete(INPACT_DIMENSIONS[0], { score: null });
    expect(evaluateAgentTrust(agent(), reqs).headlineScore).toBeNull();
  });
});

describe('absence is failure, not "not applicable"', () => {
  it('a missing dimension blocks', () => {
    const reqs = allSix().filter((r) => r.dimension !== 'permitted');
    const result = evaluateAgentTrust(agent(), reqs);

    expect(result.passes).toBe(false);
    expect(result.missingDimensions).toContain('permitted');
    expect(result.blockingFindings.map((f) => f.rule)).toContain('dimension_unaddressed');
  });

  it('NO trust requirements at all blocks with six findings', () => {
    const result = evaluateAgentTrust(agent(), []);
    expect(result.passes).toBe(false);
    expect(result.missingDimensions).toHaveLength(6);
    expect(
      result.blockingFindings.filter((f) => f.rule === 'dimension_unaddressed'),
    ).toHaveLength(6);
  });

  it('reports EVERY reason at once rather than the first', () => {
    // Closing gaps shouldn't be whack-a-mole against a system that knows the full answer.
    const result = evaluateAgentTrust(agent({ business_owner_identity_id: null, human_owner_identity_id: null }), []);
    expect(result.blockingFindings.length).toBeGreaterThan(6);
  });
});

describe('the five required fields per dimension', () => {
  it.each([
    ['requirement', { requirement: null }],
    ['implementation_evidence', { implementation_evidence: '  ' }],
    ['evaluation', { evaluation: null }],
    ['owner', { owner_identity_id: null }],
  ])('a dimension missing %s blocks', (_label, patch) => {
    const reqs = allSix();
    reqs[2] = complete(INPACT_DIMENSIONS[2], patch as any);
    const result = evaluateAgentTrust(agent(), reqs);

    expect(result.passes).toBe(false);
    expect(result.blockingFindings.map((f) => f.rule)).toContain('dimension_incomplete');
  });

  it('"specified" or "implemented" is NOT enough — it must be evaluated', () => {
    // "We built it" without "and we checked it" is the exact gap the framework closes.
    const reqs = allSix();
    reqs[1] = complete(INPACT_DIMENSIONS[1], { status: 'implemented' });
    const result = evaluateAgentTrust(agent(), reqs);

    expect(result.passes).toBe(false);
    expect(result.blockingFindings.map((f) => f.rule)).toContain('dimension_not_evaluated');
  });

  it('"accepted" counts as proven', () => {
    const reqs = INPACT_DIMENSIONS.map((d) => complete(d, { status: 'accepted' }));
    expect(evaluateAgentTrust(agent(), reqs).passes).toBe(true);
  });

  it('a score outside the book’s 1-6 scale blocks a gated agent', () => {
    const reqs = allSix();
    reqs[0] = complete(INPACT_DIMENSIONS[0], { score: 9 });
    const result = evaluateAgentTrust(agent(), reqs);
    expect(result.blockingFindings.map((f) => f.rule)).toContain('invalid_inpact_score');
  });
});

describe('agent-level contract checks', () => {
  it('no accountable human blocks', () => {
    const result = evaluateAgentTrust(
      agent({ business_owner_identity_id: null, human_owner_identity_id: null }),
      allSix(),
    );
    expect(result.blockingFindings.map((f) => f.rule)).toContain('no_owner');
  });

  it('either owner alone is sufficient', () => {
    expect(
      evaluateAgentTrust(agent({ business_owner_identity_id: null }), allSix()).passes,
    ).toBe(true);
  });

  it('no evaluation suite blocks', () => {
    const result = evaluateAgentTrust(agent({ evaluation_suite: null }), allSix());
    expect(result.blockingFindings.map((f) => f.rule)).toContain('no_evaluation_suite');
  });

  it('an unapproved definition blocks', () => {
    const result = evaluateAgentTrust(agent({ status: 'draft', approved_version: null }), allSix());
    expect(result.blockingFindings.map((f) => f.rule)).toContain('definition_not_approved');
  });

  it('a working version ahead of the approved one blocks', () => {
    // Running it would silently widen the agent's authority past what was signed off.
    const result = evaluateAgentTrust(agent({ version: 3, approved_version: 1 }), allSix());
    expect(result.blockingFindings.map((f) => f.rule)).toContain('approved_version_stale');
  });

  it('no prohibited actions WARNS rather than blocks', () => {
    // Worth surfacing — the "may" list silently becoming the whole world — but not worth
    // refusing a release over.
    const result = evaluateAgentTrust(agent({ prohibited_actions: [] }), allSix());
    const finding = result.findings.find((f) => f.rule === 'no_prohibited_actions');
    expect(finding!.severity).toBe('warning');
    expect(result.passes).toBe(true);
  });
});

describe('the gate is scoped to production-bound agents', () => {
  it.each(['design_only', 'internal_tool'] as const)('%s is not gated', (intent) => {
    // Applying the framework to a sketch trains people to fill the fields with nothing.
    const result = evaluateAgentTrust(agent({ deployment_intent: intent }), []);
    expect(result.gated).toBe(false);
    expect(result.passes).toBe(true);
    expect(result.blockingFindings).toEqual([]);
  });

  it('still reports which dimensions are unaddressed on an ungated agent', () => {
    // Not gated is not the same as not tracked — the team can still see the gaps.
    const result = evaluateAgentTrust(agent({ deployment_intent: 'design_only' }), []);
    expect(result.missingDimensions).toHaveLength(6);
  });

  it('the gate is escaped by DECLARING an agent harmless, a visible act', () => {
    const gated = evaluateAgentTrust(agent(), []);
    const notGated = evaluateAgentTrust(agent({ deployment_intent: 'design_only' }), []);
    expect(gated.passes).toBe(false);
    expect(notGated.passes).toBe(true);
  });
});

describe('project-level coverage for the release gate', () => {
  it('one failing production agent blocks the whole release', () => {
    // Trust does not average across a fleet.
    const coverage = assessProjectTrustCoverage([
      { agent: agent({ name: 'Good' }), requirements: allSix() },
      { agent: agent({ name: 'Bad' }), requirements: [] },
    ]);

    expect(coverage.passes).toBe(false);
    expect(coverage.blockedAgents).toEqual(['Bad']);
    expect(coverage.productionBoundAgents).toBe(2);
    expect(coverage.passingAgents).toBe(1);
  });

  it('design-only agents do not block a release', () => {
    const coverage = assessProjectTrustCoverage([
      { agent: agent({ name: 'Good' }), requirements: allSix() },
      { agent: agent({ name: 'Sketch', deployment_intent: 'design_only' }), requirements: [] },
    ]);

    expect(coverage.passes).toBe(true);
    expect(coverage.totalAgents).toBe(2);
    expect(coverage.productionBoundAgents).toBe(1);
  });

  it('a project with no agents passes', () => {
    expect(assessProjectTrustCoverage([]).passes).toBe(true);
  });
});
