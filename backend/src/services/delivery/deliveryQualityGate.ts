/**
 * deliveryQualityGate — "do we have enough evidence to trust this?"  PURE, no I/O.
 *
 * Master plan §Gate 9: **the release gate fails closed when required evidence is absent.**
 * Callers load the story contract and its evidence rows and pass them in, so the gate is
 * unit-testable and cannot be talked out of a refusal by a slow database or a missing row.
 * This is the same shape as Gate 5's `deliveryTrustGate`, for the same reason.
 *
 * ## What this module refuses to do
 *
 * **It will not infer a dimension from an evidence type.** A `test_run` can satisfy unit
 * tests, integration, acceptance or defects — so if the gate inferred, one `jest` run
 * would silently satisfy four dimensions and the report would claim integration coverage
 * that nobody wrote. Each evidence row therefore *declares* the dimension it speaks to,
 * and the gate checks that the declaration is legal against `DIMENSION_SATISFIED_BY`.
 * Inference here would be a generous lie; declaration is checkable.
 *
 * **It will not let a recorded failure pass because nobody required it.** A `fail`
 * outcome blocks whether or not its dimension was required. The alternative — a red
 * security scan sitting in the table while the release goes out because security was not
 * on the required list for this risk tier — is precisely the failure mode a quality
 * system exists to prevent. You do not get to un-know a result.
 *
 * **It will not accept evidence pinned to different code.** For SHA-pinned dimensions a
 * passing run against another commit is not evidence about this one.
 */

import {
  DIMENSION_SATISFIED_BY,
  isPostRelease,
  isQualityDimension,
  isDeliveryEvidenceType,
  isShaPinned,
  type DeliveryEvidenceOutcome,
  type DeliveryEvidenceType,
  type QualityDimension,
} from '../../modules/delivery/deliveryEvidence';
import { deliveryRiskIndex } from '../../modules/delivery/deliveryRiskLevels';
import type { DeliveryStoryContract } from './deliveryStoryContract';

/** One recorded measurement, reduced to what the gate needs. */
export interface QualityEvidenceInput {
  /** The dimension this evidence is claimed to speak to. Declared, never inferred. */
  dimension: string;
  evidenceType: string;
  outcome: DeliveryEvidenceOutcome;
  /** Commit the measurement ran against. Required for SHA-pinned dimensions. */
  subjectSha?: string | null;
  sourceRef?: string | null;
}

export type QualityGateScope = 'story' | 'release';
export type QualityGatePhase = 'pre_release' | 'post_release';

export interface QualityGateInput {
  story: DeliveryStoryContract;
  evidence: QualityEvidenceInput[];
  /** The commit the gate is being asked about. */
  candidateSha?: string | null;
  scope?: QualityGateScope;
  phase?: QualityGatePhase;
  /** True when the story changes user-facing UI. Drives the browser/visual/a11y set. */
  isUiStory?: boolean;
}

export interface QualityGateFinding {
  dimension: QualityDimension | '(story)';
  rule: string;
  detail: string;
  severity: 'blocking' | 'warning';
}

export interface RequiredDimension {
  dimension: QualityDimension;
  /** Why it is required — so a refusal explains itself instead of just saying no. */
  reason: string;
}

export interface QualityGateResult {
  storyId: string;
  scope: QualityGateScope;
  phase: QualityGatePhase;
  passes: boolean;
  required: RequiredDimension[];
  satisfied: QualityDimension[];
  findings: QualityGateFinding[];
  blockingFindings: QualityGateFinding[];
}

/** Risk tier at or above which a security scan is required. */
const SECURITY_REQUIRED_FROM = 'R3';
/** Risk tier at or above which integration evidence is required. */
const INTEGRATION_REQUIRED_FROM = 'R2';

/**
 * Which dimensions this story must evidence.
 *
 * Requirements are *derived from the contract*, not configured per project. A per-project
 * required-list would drift into "whatever we happened to run last time," which is how a
 * quality bar quietly becomes a description of current practice rather than a standard.
 */
export function requiredDimensionsFor(input: QualityGateInput): RequiredDimension[] {
  const { story } = input;
  const scope: QualityGateScope = input.scope ?? 'story';
  const phase: QualityGatePhase = input.phase ?? 'pre_release';
  const required: RequiredDimension[] = [];
  const add = (dimension: QualityDimension, reason: string) => {
    if (!required.some((r) => r.dimension === dimension)) required.push({ dimension, reason });
  };

  // Every story, always. If a story cannot evidence what it fulfils, what it promised, and
  // that its logic works, there is nothing to discuss.
  add('requirements_coverage', 'every story must show what requirement it fulfils');
  add('acceptance_coverage', 'every story promised acceptance criteria');
  add('unit_tests', 'every story ships logic that can be proven without I/O');

  const riskIndex = deliveryRiskIndex(story.riskLevel);

  if (riskIndex >= deliveryRiskIndex(INTEGRATION_REQUIRED_FROM)) {
    add('integration', `risk ${story.riskLevel} crosses a real boundary`);
  }
  if (riskIndex >= deliveryRiskIndex(SECURITY_REQUIRED_FROM)) {
    add('security', `risk ${story.riskLevel} can cause harm that a scan can catch`);
  }

  // Master plan §Gate 9: "For UI stories: Playwright; deterministic assertions;
  // screenshots; reference-to-implementation comparison."
  if (input.isUiStory) {
    add('browser', 'UI stories must work in a real browser, not only in assertions');
    add('visual_contract', 'UI stories must match the approved reference');
    add('accessibility', 'UI stories must be usable by people who do not use them the way we do');
  }

  const touchesAgents =
    (story.agentImpacts?.length ?? 0) > 0 || (story.trustDimensions?.length ?? 0) > 0;
  if (touchesAgents) {
    add('ai_evals', 'the story changes agent behaviour, which must be measured not assumed');
    add('trust_coverage', 'production-bound agents must address all six INPACT dimensions');
  }

  if (story.approvalPolicy === 'client_approval') {
    add('client_acceptance', 'the story contract requires client approval');
  }

  // Release-level concerns. Asking every story to evidence architecture drift and the
  // defect list would produce fourteen rows of ceremony per story; asking it once per
  // release is where the question is actually meaningful.
  if (scope === 'release') {
    add('architecture_drift', 'a release must still match what was designed');
    add('defects', 'a release must resolve or explicitly accept known defects');
  }

  if (phase === 'post_release') {
    add('production_reliability', 'a shipped release must be shown to keep working');
  }

  // Post-release dimensions can never gate a pre-release decision — requiring the
  // unmeasurable makes a gate unsatisfiable, and unsatisfiable gates get switched off.
  return phase === 'pre_release' ? required.filter((r) => !isPostRelease(r.dimension)) : required;
}

/**
 * Evaluate the gate.
 *
 * Returns every finding rather than the first, so someone fixing a release sees the whole
 * list instead of discovering it one run at a time.
 */
export function evaluateQualityGate(input: QualityGateInput): QualityGateResult {
  const scope: QualityGateScope = input.scope ?? 'story';
  const phase: QualityGatePhase = input.phase ?? 'pre_release';
  const findings: QualityGateFinding[] = [];
  const add = (
    dimension: QualityGateFinding['dimension'],
    rule: string,
    detail: string,
    severity: QualityGateFinding['severity'] = 'blocking',
  ) => findings.push({ dimension, rule, detail, severity });

  const required = requiredDimensionsFor({ ...input, scope, phase });

  // --- Validate the evidence rows themselves before trusting any of them. -------------
  const usable: Array<QualityEvidenceInput & { dimension: QualityDimension; evidenceType: DeliveryEvidenceType }> = [];

  for (const row of input.evidence ?? []) {
    if (!isQualityDimension(row.dimension)) {
      add('(story)', 'unknown_dimension', `'${row.dimension}' is not a quality dimension.`);
      continue;
    }
    if (!isDeliveryEvidenceType(row.evidenceType)) {
      add(row.dimension, 'unknown_evidence_type', `'${row.evidenceType}' is not an evidence type.`);
      continue;
    }
    // The declaration must be legal. Without this check a screenshot could claim to be a
    // security scan, and the gate would count it.
    if (!DIMENSION_SATISFIED_BY[row.dimension].includes(row.evidenceType)) {
      add(
        row.dimension,
        'evidence_type_mismatch',
        `'${row.evidenceType}' cannot satisfy '${row.dimension}'. Accepted: ` +
          `${DIMENSION_SATISFIED_BY[row.dimension].join(', ')}.`,
      );
      continue;
    }
    usable.push({ ...row, dimension: row.dimension, evidenceType: row.evidenceType });
  }

  // --- A recorded failure blocks, required or not. ------------------------------------
  for (const row of usable) {
    if (row.outcome === 'fail') {
      add(
        row.dimension,
        'recorded_failure',
        `A ${row.evidenceType} for '${row.dimension}' recorded 'fail'` +
          `${row.sourceRef ? ` (${row.sourceRef})` : ''}. A known failure blocks whether or ` +
          'not its dimension was required.',
      );
    }
  }

  // --- Every required dimension must have passing, current evidence. ------------------
  const satisfied: QualityDimension[] = [];

  for (const { dimension, reason } of required) {
    const rows = usable.filter((r) => r.dimension === dimension);

    if (rows.length === 0) {
      add(dimension, 'missing_evidence', `No evidence recorded for '${dimension}' — ${reason}.`);
      continue;
    }

    const passing = rows.filter((r) => r.outcome === 'pass');
    if (passing.length === 0) {
      const outcomes = [...new Set(rows.map((r) => r.outcome))].join(', ');
      add(
        dimension,
        'evidence_not_passing',
        `'${dimension}' has evidence but none of it passes (${outcomes}). ` +
          "'not_run' and 'partial' are not 'pass'.",
      );
      continue;
    }

    if (isShaPinned(dimension) && input.candidateSha) {
      const current = passing.filter((r) => r.subjectSha === input.candidateSha);
      if (current.length === 0) {
        const seen = [...new Set(passing.map((r) => r.subjectSha ?? 'unpinned'))].join(', ');
        add(
          dimension,
          'stale_evidence',
          `'${dimension}' passes only against ${seen}, not the candidate ` +
            `${input.candidateSha}. A measurement of other code is not evidence about this one.`,
        );
        continue;
      }
    }

    satisfied.push(dimension);
  }

  // --- Author-declared evidence types, from the Gate 7 story contract. ----------------
  for (const declared of input.story.evidenceRequired ?? []) {
    if (!isDeliveryEvidenceType(declared)) {
      add(
        '(story)',
        'unknown_evidence_requirement',
        `Story declares evidence '${declared}', which is not a known evidence type.`,
      );
      continue;
    }
    const has = usable.some((r) => r.evidenceType === declared && r.outcome === 'pass');
    if (!has) {
      add(
        '(story)',
        'declared_evidence_missing',
        `Story contract declares '${declared}' as required evidence; no passing row exists.`,
      );
    }
  }

  const blockingFindings = findings.filter((f) => f.severity === 'blocking');

  return {
    storyId: input.story.storyId,
    scope,
    phase,
    passes: blockingFindings.length === 0,
    required,
    satisfied,
    findings,
    blockingFindings,
  };
}
