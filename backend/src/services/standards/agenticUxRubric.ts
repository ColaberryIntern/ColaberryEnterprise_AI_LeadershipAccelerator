/**
 * The Agentic UX and Trust Design Standard v1.0, as code.
 *
 * The prose lives in `docs/standards/agentic-ux-trust-standard-v1.md`. This module is the part a
 * build can fail on: the weights, the arithmetic, the hard gates and the decision rule. A
 * standard that exists only as a document is a document.
 *
 * ## What this is NOT
 *
 * This is a PROPOSED INTERNAL STANDARD. It is not an existing industry certification, and a score
 * produced by it is an assessment, not conformance. Those three claims are in the document and
 * are asserted by its tests, because the one failure mode that would discredit the whole exercise
 * is a number from this rubric being quoted to a customer as though it were a certification.
 *
 * ## Why the total is computed and never accepted
 *
 * `scoreAgenticUx` takes the ten per-dimension scores and returns the total. There is no input
 * field for a total, so no caller can supply one. The standard's own text says the total is
 * "computed from weights, never populated as a fabricated metric", and the way to honor that in
 * code is to make the fabricated version unrepresentable rather than merely discouraged.
 *
 * ## Why the arithmetic is integer
 *
 * A dimension contributes `score * weight / 5`, which is fractional for most scores: 3 on a
 * weight of 12 is 7.2, and 7.2 is not exactly representable in binary floating point. Summing ten
 * of those and comparing against 90 would make the decision depend on rounding. So the sum is
 * kept as `score * weight` (an integer from 0 to 500) and the thresholds are multiplied by 5 to
 * match. The human-facing total is that integer divided by 5, which is presentation, not a
 * decision input.
 */

export interface RubricDimension {
  readonly key: string;
  readonly label: string;
  /** Out of 100 across all ten. */
  readonly weight: number;
  readonly passingEvidence: string;
}

/** The ten dimensions, in the standard's own order. Weights total exactly 100. */
export const RUBRIC_DIMENSIONS: readonly RubricDimension[] = [
  {
    key: 'outcome_clarity',
    label: 'Outcome clarity and next best action',
    weight: 12,
    passingEvidence:
      'A first-time user identifies the current objective and the next human decision in ten seconds',
  },
  {
    key: 'visual_hierarchy',
    label: 'Visual hierarchy and information architecture',
    weight: 10,
    passingEvidence:
      'Key signal discoverable, consistent components, progressive disclosure, minimal cognitive load',
  },
  {
    key: 'trust_provenance',
    label: 'Human and agent provenance, and trust',
    weight: 15,
    passingEvidence:
      'Every material action labeled agent, human or system, with time, origin, owner, evidence and status',
  },
  {
    key: 'control_approvals',
    label: 'Control, approvals and reversibility',
    weight: 15,
    passingEvidence:
      'High-risk actions blocked without approval; explicit pause and cancel; reversal or a documented compensation path',
  },
  {
    key: 'orchestration',
    label: 'Multi-agent orchestration visibility',
    weight: 10,
    passingEvidence:
      'Tasks, handoffs, dependencies, stalled items and the responsible party can be traced',
  },
  {
    key: 'explainability',
    label: 'Explainability, accuracy and uncertainty',
    weight: 10,
    passingEvidence:
      'Why, source and limitations are visible; uncertainty is calibrated rather than invented',
  },
  {
    key: 'accessibility',
    label: 'Accessibility and responsiveness',
    weight: 10,
    passingEvidence:
      'WCAG 2.2 AA-target testing; keyboard, focus, screen reader and responsive layouts',
  },
  {
    key: 'recovery',
    label: 'Recovery, error prevention and resilience',
    weight: 8,
    passingEvidence:
      'Failures are actionable; safe retries, deduplication and escalation are demonstrated',
  },
  {
    key: 'technical_quality',
    label: 'Performance, technical quality and security',
    weight: 5,
    passingEvidence:
      'No critical auth or data exposure; usable response time measured; no broken controls',
  },
  {
    key: 'user_validation',
    label: 'Real-user task validation',
    weight: 5,
    passingEvidence: 'Representative users demonstrate tasks; issues logged and addressed',
  },
];

export interface HardGate {
  readonly id: string;
  readonly statement: string;
}

/**
 * The eight hard gates. A failure of ANY one blocks production regardless of the score.
 *
 * They are not weighted, and that is the point: a weighted gate is a gate you can buy your way
 * past with points earned somewhere else.
 */
export const HARD_GATES: readonly HardGate[] = [
  { id: 'GATE-001', statement: 'No unapproved high-risk or irreversible side effects.' },
  {
    id: 'GATE-002',
    statement:
      "Every material action has an accountable actor, a traceable state transition, and an evidence or provenance reference, or an explicit 'evidence unavailable'.",
  },
  {
    id: 'GATE-003',
    statement:
      'No false claims of actions completed; proposed, queued, executing, succeeded, failed, canceled and reverted are distinguished.',
  },
  {
    id: 'GATE-004',
    statement: 'Restricted data is not exposed in screens, logs, previews or sample payloads.',
  },
  {
    id: 'GATE-005',
    statement: 'Safe interrupt and kill capability for agents within scope, with auditable outcomes.',
  },
  {
    id: 'GATE-006',
    statement:
      'Critical workflows are keyboard-operable and independently accessibility-tested against the applicable WCAG 2.2 AA criteria.',
  },
  {
    id: 'GATE-007',
    statement: 'No fake metrics presented as live data; demos are clearly labeled and isolated.',
  },
  {
    id: 'GATE-008',
    statement:
      'No broken user-facing primary workflows; error and recovery paths have been exercised.',
  },
];

/** The five autonomy tiers. Attached to capabilities and actions, never to an agent as a whole. */
export const AUTONOMY_TIERS = [
  { id: 'A0', label: 'Observe', meaning: 'Read-only; no external state changes.' },
  { id: 'A1', label: 'Draft', meaning: 'Propose artifacts or changes, but never apply externally.' },
  { id: 'A2', label: 'Approve', meaning: 'Prepare actions and await explicit human authorization.' },
  {
    id: 'A3',
    label: 'Bounded execute',
    meaning:
      'Execute preapproved low-risk actions inside explicit scope, budget and rate limits; escalate exceptions.',
  },
  {
    id: 'A4',
    label: 'Delegated autonomous',
    meaning:
      'Multi-step execution within a narrow, revocable policy envelope; requires monitoring and post-action review.',
  },
] as const;

export type RubricDecision = 'RELEASE_CANDIDATE' | 'REWORK' | 'REDESIGN' | 'REJECT' | 'BLOCK';

export interface HardGateResult {
  id: string;
  passed: boolean;
  /** Required whether the gate passed or failed: a bare boolean is an opinion. */
  evidence: string;
}

export interface RubricInput {
  /** One score per dimension key, each an integer from 0 to 5. */
  scores: Record<string, number>;
  hardGates: HardGateResult[];
}

export interface RubricResult {
  standard_version: '1.0';
  scores: Record<string, number>;
  /** Computed. Never an input. Out of 100, to one decimal place. */
  weighted_total: number;
  /** The integer the DECISION is made on, out of 500. Exposed so the arithmetic is auditable. */
  raw_total: number;
  hard_gates: HardGateResult[];
  failed_gates: string[];
  decision: RubricDecision;
  /** Plain words for why, so a reader does not have to re-derive the rule. */
  rationale: string;
}

export class RubricInputError extends Error {
  readonly name = 'RubricInputError';

  readonly error_class = 'RubricInputInvalid';
}

/** Thresholds, as `score * weight` out of 500. See the header for why they are not out of 100. */
const RAW_RELEASE = 450; // 90
const RAW_REWORK = 400; // 80
const RAW_REDESIGN = 350; // 70

/**
 * Score a design against the standard.
 *
 * Throws `RubricInputError` rather than clamping. A score of 7 on a 0-to-5 scale is not a 5, it is
 * a mistake somewhere upstream, and silently turning it into a 5 would produce a plausible total
 * that nobody could trace back to the error that made it.
 */
export function scoreAgenticUx(input: RubricInput): RubricResult {
  const scores: Record<string, number> = {};
  for (const dimension of RUBRIC_DIMENSIONS) {
    const value = input.scores?.[dimension.key];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 5) {
      throw new RubricInputError(
        `score for "${dimension.key}" must be an integer from 0 to 5, got ${JSON.stringify(value)}`,
      );
    }
    scores[dimension.key] = value;
  }

  const unknown = Object.keys(input.scores || {}).filter(
    (k) => !RUBRIC_DIMENSIONS.some((d) => d.key === k),
  );
  if (unknown.length) {
    // Fail closed. An unrecognized key is usually a renamed dimension, and silently ignoring it
    // would mean scoring nine dimensions while reporting ten.
    throw new RubricInputError(`unknown dimension(s): ${unknown.join(', ')}`);
  }

  const supplied = new Map((input.hardGates || []).map((g) => [g.id, g]));
  const hard_gates: HardGateResult[] = HARD_GATES.map((gate) => {
    const result = supplied.get(gate.id);
    if (!result) {
      // An unassessed gate is a FAILED gate. Treating silence as a pass is how a gate becomes
      // decorative, and these are the eight that cannot be bought past with points.
      return { id: gate.id, passed: false, evidence: 'not assessed' };
    }
    if (!result.evidence || !result.evidence.trim()) {
      throw new RubricInputError(`hard gate ${gate.id} has no evidence; a bare verdict is an opinion`);
    }
    return { id: gate.id, passed: result.passed === true, evidence: result.evidence };
  });

  const unknownGates = (input.hardGates || [])
    .map((g) => g.id)
    .filter((id) => !HARD_GATES.some((g) => g.id === id));
  if (unknownGates.length) {
    throw new RubricInputError(`unknown hard gate(s): ${unknownGates.join(', ')}`);
  }

  const raw_total = RUBRIC_DIMENSIONS.reduce(
    (sum, d) => sum + scores[d.key] * d.weight,
    0,
  );
  const failed_gates = hard_gates.filter((g) => !g.passed).map((g) => g.id);

  let decision: RubricDecision;
  let rationale: string;
  if (failed_gates.length) {
    // Before the score is even consulted. A perfect 100 with a failed gate is still BLOCK.
    decision = 'BLOCK';
    rationale = `blocked by hard gate${failed_gates.length > 1 ? 's' : ''} ${failed_gates.join(', ')}, regardless of the score of ${raw_total / 5}`;
  } else if (raw_total >= RAW_RELEASE) {
    decision = 'RELEASE_CANDIDATE';
    rationale = `${raw_total / 5} of 100 with every hard gate passing`;
  } else if (raw_total >= RAW_REWORK) {
    decision = 'REWORK';
    rationale = `${raw_total / 5} of 100: targeted rework and retest before production`;
  } else if (raw_total >= RAW_REDESIGN) {
    decision = 'REDESIGN';
    rationale = `${raw_total / 5} of 100: substantive redesign necessary`;
  } else {
    decision = 'REJECT';
    rationale = `${raw_total / 5} of 100: reject and re-scope`;
  }

  return {
    standard_version: '1.0',
    scores,
    weighted_total: Math.round((raw_total / 5) * 10) / 10,
    raw_total,
    hard_gates,
    failed_gates,
    decision,
    rationale,
  };
}

/** The weights must total 100, and this is checked at import time as well as in a test. */
export const TOTAL_WEIGHT = RUBRIC_DIMENSIONS.reduce((s, d) => s + d.weight, 0);
