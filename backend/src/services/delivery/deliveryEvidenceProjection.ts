/**
 * deliveryEvidenceProjection — the one-way rule. PURE, no I/O.
 *
 * Master plan §2.5: *"Do not create duplicate progression or duplicate evidence for the
 * same event."* Gate 0's EVIDENCE_INTEGRATION_MAP answered it with a projection that runs
 * in exactly one direction:
 *
 *   delivery_evidence ──(builder credit only)──▶ evidence_records
 *
 * This module decides *whether* a delivery evidence row should project and *what* the
 * progression row would be. It deliberately performs no writes: Gate 11 owns the
 * Experience Ledger and the actual insert. Separating the decision from the write is what
 * lets the rule be tested exhaustively without a database, which matters because the rule
 * is the whole safety property.
 *
 * ## Why it is one-way
 *
 * Reversing it would let a student's prompt-lab submission become evidence that a client
 * project met its quality bar. That is not a hypothetical confusion — both tables carry
 * "evidence" in the name and both are keyed by idempotency. The direction is the control.
 *
 * ## Why the same idempotency key
 *
 * A replayed execution callback must produce at most one row on *each* side. Reusing the
 * delivery row's key (rather than minting a second one) makes that structural: two
 * replays collide on the same unique index in both tables.
 */

import type { EvidenceSource } from '../../models/EvidenceRecord';
import type {
  DeliveryEvidenceOutcome,
  DeliveryEvidenceType,
} from '../../modules/delivery/deliveryEvidence';

/**
 * Delivery evidence types that represent work a builder authored.
 *
 * Deliberately narrow. A passing security scan is real evidence about the *release*, but
 * it is not something a builder authored, and awarding progression credit for it would
 * inflate the ledger with work nobody did. Gate 11 can widen this with a reason; it
 * should not widen by default.
 */
const BUILDER_CREDIT_TYPES: Record<string, EvidenceSource> = {
  commit: 'github_commit',
  pull_request: 'github_pr',
};

export interface ProjectionInput {
  evidenceType: DeliveryEvidenceType;
  outcome: DeliveryEvidenceOutcome;
  idempotencyKey: string;
  sourceRef?: string | null;
  /** The builder's enrollment, when they hold one. Absent for client-side builders. */
  builderEnrollmentId?: string | null;
  /** Competency weights supplied by the caller; the projection does not invent them. */
  competencyWeights?: Array<{ domain_id: string; weight: number }> | null;
  builderXp?: number | null;
}

export interface ProjectedEvidenceRecord {
  enrollment_id: string;
  source_type: EvidenceSource;
  source_ref: string | null;
  competency_weights: Array<{ domain_id: string; weight: number }>;
  builder_xp: number;
  validated: boolean;
  /** The SAME key as the delivery row. See the module header. */
  idempotency_key: string;
}

export type ProjectionDecision =
  | { projects: true; record: ProjectedEvidenceRecord }
  | { projects: false; reason: string };

/**
 * Decide whether one delivery evidence row projects into progression.
 *
 * Every `projects: false` carries a reason rather than a bare boolean, because "no row was
 * written" is otherwise indistinguishable from "the projection silently broke."
 */
export function projectDeliveryEvidence(input: ProjectionInput): ProjectionDecision {
  const sourceType = BUILDER_CREDIT_TYPES[input.evidenceType];
  if (!sourceType) {
    return {
      projects: false,
      reason:
        `'${input.evidenceType}' is not builder-authored work; progression credit is for ` +
        'what a builder did, not for everything measured about a release.',
    };
  }

  if (input.outcome !== 'pass') {
    return {
      projects: false,
      reason: `outcome is '${input.outcome}'; only 'pass' earns progression credit.`,
    };
  }

  // A client-side builder with no enrollment is a SUPPORTED outcome, not an error. Gate 0
  // called this out specifically: the delivery row still exists and still counts toward
  // the quality gate; there is simply no progression ledger to credit.
  if (!input.builderEnrollmentId) {
    return {
      projects: false,
      reason: 'builder holds no enrollment; delivery evidence stands on its own.',
    };
  }

  return {
    projects: true,
    record: {
      enrollment_id: input.builderEnrollmentId,
      source_type: sourceType,
      source_ref: input.sourceRef ?? null,
      competency_weights: input.competencyWeights ?? [],
      builder_xp: input.builderXp ?? 0,
      validated: true,
      idempotency_key: input.idempotencyKey,
    },
  };
}

/**
 * The reverse direction, stated in code so it cannot be added by accident.
 *
 * A function that exists only to refuse looks odd until you consider the alternative: the
 * rule living only in a comment, where a future caller looking for
 * `projectStudentEvidenceToDelivery` finds nothing and writes it.
 */
export function projectProgressionToDelivery(): never {
  throw new Error(
    'Student progression evidence never becomes delivery evidence. The projection is ' +
      'one-way by design (master plan §2.5); see deliveryEvidenceProjection.ts.',
  );
}
