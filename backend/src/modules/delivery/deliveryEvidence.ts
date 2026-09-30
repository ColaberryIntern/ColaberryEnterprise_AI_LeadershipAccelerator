/**
 * deliveryEvidence — the Quality OS vocabulary. PURE, no I/O.
 *
 * Master plan §Gate 9 asks one question:
 *
 *   > Do we have enough evidence to trust this story/release?
 *
 * A question like that is only answerable if "enough" is written down somewhere a test
 * can read. This module is that somewhere: fourteen quality dimensions, fourteen evidence
 * types, and the mapping between them. `deliveryQualityGate.ts` does the deciding.
 *
 * ## Three rules that shape everything below
 *
 * **1. Absence is failure, never "not applicable."** `not_run` is not `pass`. Gate 5's
 * trust gate already took this line and Gate 0's EVIDENCE_INTEGRATION_MAP restates it: an
 * unmeasured thing must never read as a passing one. The most dangerous release report is
 * the one that looks green because nobody looked.
 *
 * **2. Evidence is pinned to a commit, or it is not evidence.** A test run from three
 * commits ago proves something about code that is no longer the candidate. Dimensions
 * below are split into code-derived (must match the candidate SHA) and judgement-derived
 * (a human decision about scope, which does not expire on the next commit).
 *
 * **3. Post-release evidence cannot gate a pre-release decision.** Production reliability
 * is real evidence and it is measured *after* deploy. Requiring it before release would
 * make the gate unsatisfiable, and an unsatisfiable gate gets switched off — which is how
 * a control becomes a checkbox.
 */

/** Master plan §Gate 9's evidence types, normalized to snake_case. */
export type DeliveryEvidenceType =
  | 'commit'
  | 'pull_request'
  | 'test_run'
  | 'browser_run'
  | 'screenshot'
  | 'visual_diff'
  | 'security_scan'
  | 'accessibility_scan'
  | 'ai_eval'
  | 'architecture_review'
  | 'design_approval'
  | 'client_acceptance'
  | 'deployment_verification'
  | 'operational_metric';

export const DELIVERY_EVIDENCE_TYPES: readonly DeliveryEvidenceType[] = [
  'commit',
  'pull_request',
  'test_run',
  'browser_run',
  'screenshot',
  'visual_diff',
  'security_scan',
  'accessibility_scan',
  'ai_eval',
  'architecture_review',
  'design_approval',
  'client_acceptance',
  'deployment_verification',
  'operational_metric',
];

export function isDeliveryEvidenceType(value: string): value is DeliveryEvidenceType {
  return (DELIVERY_EVIDENCE_TYPES as readonly string[]).includes(value);
}

/**
 * Outcomes.
 *
 * `not_run` exists deliberately rather than being modelled as an absent row. A recorded
 * `not_run` says "we looked and chose not to measure," which is auditable; an absent row
 * says nothing at all. Both fail the gate — but only one of them is a decision.
 */
export type DeliveryEvidenceOutcome = 'pass' | 'fail' | 'partial' | 'not_run';

export const DELIVERY_EVIDENCE_OUTCOMES: readonly DeliveryEvidenceOutcome[] = [
  'pass',
  'fail',
  'partial',
  'not_run',
];

/** The only outcome that satisfies a required dimension. */
export function isSatisfyingOutcome(outcome: DeliveryEvidenceOutcome): boolean {
  return outcome === 'pass';
}

/** Master plan §Gate 9's fourteen quality dimensions. */
export type QualityDimension =
  | 'requirements_coverage'
  | 'acceptance_coverage'
  | 'unit_tests'
  | 'integration'
  | 'browser'
  | 'visual_contract'
  | 'security'
  | 'accessibility'
  | 'ai_evals'
  | 'trust_coverage'
  | 'architecture_drift'
  | 'defects'
  | 'client_acceptance'
  | 'production_reliability';

export const QUALITY_DIMENSIONS: readonly QualityDimension[] = [
  'requirements_coverage',
  'acceptance_coverage',
  'unit_tests',
  'integration',
  'browser',
  'visual_contract',
  'security',
  'accessibility',
  'ai_evals',
  'trust_coverage',
  'architecture_drift',
  'defects',
  'client_acceptance',
  'production_reliability',
];

export function isQualityDimension(value: string): value is QualityDimension {
  return (QUALITY_DIMENSIONS as readonly string[]).includes(value);
}

export const QUALITY_DIMENSION_MEANINGS: Record<QualityDimension, string> = {
  requirements_coverage: 'Every requirement in scope is implemented by something.',
  acceptance_coverage: 'Every promised acceptance criterion has been checked.',
  unit_tests: 'Pure logic is proven without I/O.',
  integration: 'The pieces work together against real boundaries.',
  browser: 'The workflow works in a real browser, not just in assertions.',
  visual_contract: 'What shipped matches the approved reference.',
  security: 'No known vulnerability, secret, or unguarded route ships.',
  accessibility: 'The interface is usable by people who do not use it the way we do.',
  ai_evals: 'Agent behaviour is measured, not assumed.',
  trust_coverage: 'All six INPACT dimensions are addressed for production-bound agents.',
  architecture_drift: 'What was built still matches what was designed.',
  defects: 'Known defects are resolved or explicitly accepted.',
  client_acceptance: 'The client agreed this is what they asked for.',
  production_reliability: 'It kept working after it shipped.',
};

/**
 * Which evidence types can satisfy which dimension.
 *
 * A dimension with no matching evidence type could never pass, so this map is also the
 * proof that the vocabulary is coherent — a test asserts every dimension has at least one
 * satisfier.
 */
export const DIMENSION_SATISFIED_BY: Record<QualityDimension, readonly DeliveryEvidenceType[]> = {
  requirements_coverage: ['pull_request', 'commit'],
  acceptance_coverage: ['test_run', 'browser_run', 'client_acceptance'],
  unit_tests: ['test_run'],
  integration: ['test_run'],
  browser: ['browser_run'],
  visual_contract: ['visual_diff', 'screenshot'],
  security: ['security_scan'],
  accessibility: ['accessibility_scan'],
  ai_evals: ['ai_eval'],
  trust_coverage: ['ai_eval', 'architecture_review'],
  architecture_drift: ['architecture_review'],
  defects: ['test_run', 'browser_run'],
  client_acceptance: ['client_acceptance'],
  production_reliability: ['deployment_verification', 'operational_metric'],
};

/**
 * Dimensions whose evidence is only meaningful against a specific commit.
 *
 * A passing test run pinned to SHA `abc` says nothing about SHA `def`. Everything here is
 * re-measured when the code moves; everything NOT here is a human judgement about scope,
 * which does not become false because someone pushed a commit.
 *
 * `client_acceptance` is deliberately absent. Re-requiring a client's sign-off on every
 * commit would mean either badgering them or, far more likely, quietly dropping the
 * requirement — and a control that gets dropped is worse than one that was never claimed.
 * Scope changes are caught by Gate 10's change-impact flow, not by SHA pinning.
 */
export const SHA_PINNED_DIMENSIONS: readonly QualityDimension[] = [
  'requirements_coverage',
  'acceptance_coverage',
  'unit_tests',
  'integration',
  'browser',
  'visual_contract',
  'security',
  'accessibility',
  'ai_evals',
  'defects',
];

export function isShaPinned(dimension: QualityDimension): boolean {
  return SHA_PINNED_DIMENSIONS.includes(dimension);
}

/**
 * Dimensions that can only be measured after a release is live.
 *
 * Requiring these before release would make the pre-release gate unsatisfiable. They are
 * required at a different phase, not exempt from evidence.
 */
export const POST_RELEASE_DIMENSIONS: readonly QualityDimension[] = ['production_reliability'];

export function isPostRelease(dimension: QualityDimension): boolean {
  return POST_RELEASE_DIMENSIONS.includes(dimension);
}

/**
 * The idempotency key for a delivery evidence row.
 *
 * Master plan §15 requires that a replayed execution callback produce no duplicate
 * evidence. `evidence_records` already solved this with a unique `idempotency_key`, so
 * this copies the pattern verbatim rather than inventing a second one.
 *
 * The source ref is part of the key because two test runs of the same dimension on the
 * same story ARE different evidence when they ran against different commits — collapsing
 * them would silently discard the newer measurement.
 */
export function deliveryEvidenceKey(input: {
  deliveryProjectId: string;
  storyId?: string | null;
  evidenceType: DeliveryEvidenceType;
  sourceRef: string;
}): string {
  return [
    'delivery_evidence',
    input.deliveryProjectId,
    input.storyId ?? 'no_story',
    input.evidenceType,
    input.sourceRef,
  ].join(':');
}
