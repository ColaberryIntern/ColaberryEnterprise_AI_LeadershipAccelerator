/**
 * deliveryTrustGate — is this agent trustworthy enough to reach production?
 *
 * PURE. No I/O. Callers load the definition and its six trust requirements and pass them
 * in, so the gate is unit-testable and cannot be talked out of a refusal by a slow
 * database or a missing row.
 *
 * The rule from master plan §Gate 5: **every production-bound agent must address all six
 * INPACT dimensions** with a requirement, implementation evidence, an evaluation, an owner
 * and a status. This module is the difference between that being a documented aspiration
 * and a release gate.
 *
 * FAILS CLOSED, AND ABSENCE IS FAILURE. A missing dimension row is not "not applicable",
 * it is unaddressed. Gate 0's EVIDENCE_INTEGRATION_MAP makes the same point about
 * evidence generally: `not_run` is not `pass`, and an absent measurement must never read
 * as a passing one.
 *
 * SCOPED BY INTENT. A `design_only` agent is not gated — the framework is for agents that
 * will act in production, and applying it to a sketch would train people to fill the
 * fields in with nothing. `production_bound` is opted into explicitly (the model defaults
 * to `design_only`), so the gate is escaped by *declaring* an agent harmless, which is a
 * visible act, rather than by forgetting to declare it dangerous.
 */

import {
  INPACT_DIMENSIONS,
  isValidInpactScore,
  inpactHeadlineScore,
  type InpactDimension,
  type InpactScores,
} from '../../modules/delivery/inpact';
import type { DeliveryAgentDefinitionAttributes } from '../../models/DeliveryAgentDefinition';
import type {
  DeliveryAgentTrustRequirementAttributes,
  TrustRequirementStatus,
} from '../../models/DeliveryAgentTrustRequirement';

/** Statuses that count as the dimension having actually been proven, not just planned. */
const PROVEN: readonly TrustRequirementStatus[] = ['evaluated', 'accepted'];

export interface TrustGateFinding {
  dimension: InpactDimension | '(agent)';
  rule: string;
  detail: string;
  severity: 'blocking' | 'warning';
}

export interface TrustGateResult {
  agentName: string;
  gated: boolean;
  passes: boolean;
  findings: TrustGateFinding[];
  blockingFindings: TrustGateFinding[];
  addressedDimensions: InpactDimension[];
  missingDimensions: InpactDimension[];
  scores: InpactScores;
  /** The book's 100-point headline. Null unless all six are scored. */
  headlineScore: number | null;
}

/**
 * Evaluate one agent.
 *
 * Returns a result rather than throwing, because a release gate needs to report *every*
 * reason it refused at once. Throwing on the first would make closing the gaps an
 * iterative game of whack-a-mole against a system that already knows the full answer.
 */
export function evaluateAgentTrust(
  agent: DeliveryAgentDefinitionAttributes,
  requirements: DeliveryAgentTrustRequirementAttributes[],
): TrustGateResult {
  const agentName = agent.name ?? '(unnamed)';
  const findings: TrustGateFinding[] = [];
  const add = (
    dimension: TrustGateFinding['dimension'],
    rule: string,
    detail: string,
    severity: TrustGateFinding['severity'] = 'blocking',
  ) => findings.push({ dimension, rule, detail, severity });

  const gated = agent.deployment_intent === 'production_bound';

  const byDimension = new Map<string, DeliveryAgentTrustRequirementAttributes>();
  for (const req of requirements) {
    // Last write wins on a duplicate, but the unique index makes that unreachable in the
    // database; this only matters for hand-built inputs in tests and imports.
    byDimension.set(req.dimension, req);
  }

  const scores: InpactScores = {};
  for (const dimension of INPACT_DIMENSIONS) {
    const raw = byDimension.get(dimension)?.score;
    if (isValidInpactScore(raw)) scores[dimension] = raw;
  }

  const addressed: InpactDimension[] = [];
  const missing: InpactDimension[] = [];

  for (const dimension of INPACT_DIMENSIONS) {
    const req = byDimension.get(dimension);

    if (!req) {
      missing.push(dimension);
      if (gated) {
        add(
          dimension,
          'dimension_unaddressed',
          `No trust requirement recorded. Absence is not "not applicable".`,
        );
      }
      continue;
    }

    const gaps: string[] = [];
    if (!req.requirement?.trim()) gaps.push('requirement');
    if (!req.implementation_evidence?.trim()) gaps.push('implementation_evidence');
    if (!req.evaluation?.trim()) gaps.push('evaluation');
    if (!req.owner_identity_id) gaps.push('owner');

    if (gaps.length > 0) {
      missing.push(dimension);
      if (gated) {
        add(
          dimension,
          'dimension_incomplete',
          `Missing: ${gaps.join(', ')}. Master plan §Gate 5 requires all five.`,
        );
      }
    } else if (!PROVEN.includes(req.status ?? 'not_started')) {
      // Specified and implemented is not the same as evaluated. "We built it" without
      // "and we checked it" is exactly the gap the framework exists to close.
      missing.push(dimension);
      if (gated) {
        add(
          dimension,
          'dimension_not_evaluated',
          `Status is '${req.status}'. A dimension must reach 'evaluated' or 'accepted'.`,
        );
      }
    } else {
      addressed.push(dimension);
    }

    if (req.score !== null && req.score !== undefined && !isValidInpactScore(req.score)) {
      add(
        dimension,
        'invalid_inpact_score',
        `Score ${req.score} is outside the book's 1-6 scale.`,
        gated ? 'blocking' : 'warning',
      );
    }
  }

  // Agent-level contract checks. These are not INPACT dimensions, but an agent with no
  // owner or no boundary cannot be operated regardless of how well it scores.
  if (gated) {
    if (!agent.business_owner_identity_id && !agent.human_owner_identity_id) {
      add('(agent)', 'no_owner', 'A production-bound agent needs an accountable human.');
    }
    if (!agent.autonomy_boundary?.trim()) {
      add('(agent)', 'no_autonomy_boundary', 'No limit set on what this agent may do alone.');
    }
    if (!agent.evaluation_suite) {
      add('(agent)', 'no_evaluation_suite', 'Nothing declared to re-check this agent over time.');
    }
    if (!Array.isArray(agent.prohibited_actions) || agent.prohibited_actions.length === 0) {
      // Defining what an agent must never do is a different exercise from defining what
      // it may do, and skipping it is how the "may" list silently becomes the whole world.
      add(
        '(agent)',
        'no_prohibited_actions',
        'Nothing is declared off-limits.',
        'warning',
      );
    }
    if (agent.status !== 'approved' || agent.approved_version == null) {
      add('(agent)', 'definition_not_approved', 'Production-bound agents run the APPROVED version.');
    } else if (agent.approved_version !== agent.version) {
      // The working definition has moved ahead of what was approved. Running it would
      // silently widen the agent's authority beyond what anyone signed off.
      add(
        '(agent)',
        'approved_version_stale',
        `Working version ${agent.version} differs from approved ${agent.approved_version}.`,
      );
    }
  }

  const blockingFindings = findings.filter((f) => f.severity === 'blocking');

  return {
    agentName,
    gated,
    // A non-gated agent always passes: the gate is for production-bound agents, and
    // reporting a design sketch as failing would train people to ignore this.
    passes: !gated || blockingFindings.length === 0,
    findings,
    blockingFindings,
    addressedDimensions: addressed,
    missingDimensions: [...new Set(missing)],
    scores,
    headlineScore: inpactHeadlineScore(scores),
  };
}

export interface ProjectTrustCoverage {
  totalAgents: number;
  productionBoundAgents: number;
  passingAgents: number;
  blockedAgents: string[];
  results: TrustGateResult[];
  passes: boolean;
}

/**
 * Gate 9's "Trust Before Intelligence coverage" for a whole release.
 *
 * A release is blocked if ANY production-bound agent fails. Trust does not average out
 * across a fleet — one agent acting outside its boundary is not offset by five that
 * behave.
 */
export function assessProjectTrustCoverage(
  agents: Array<{
    agent: DeliveryAgentDefinitionAttributes;
    requirements: DeliveryAgentTrustRequirementAttributes[];
  }>,
): ProjectTrustCoverage {
  const results = agents.map(({ agent, requirements }) =>
    evaluateAgentTrust(agent, requirements),
  );
  const productionBound = results.filter((r) => r.gated);
  const blocked = productionBound.filter((r) => !r.passes);

  return {
    totalAgents: results.length,
    productionBoundAgents: productionBound.length,
    passingAgents: productionBound.filter((r) => r.passes).length,
    blockedAgents: blocked.map((r) => r.agentName),
    results,
    passes: blocked.length === 0,
  };
}
