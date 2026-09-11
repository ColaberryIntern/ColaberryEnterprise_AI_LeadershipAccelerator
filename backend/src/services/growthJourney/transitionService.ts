import { GrowthJourneyTransition } from '../../models';
import type { GrowthJourneyTransitionAttributes, GrowthJourneyTransitionType } from '../../models/GrowthJourneyTransition';
import { computeIdempotencyKey } from '../inboxCase/textNormalization';
import { isUniqueViolation } from '../../utils/uniqueViolation';

/**
 * The one writer of programme/path transitions (Phase 2, T227). Append-only:
 * this file names the transition model and therefore never calls update or
 * destroy — the guard test scans for those names in any file that does.
 *
 * Kept apart from the routing actions on purpose: the action that assigns a
 * path has to change an ENROLMENT's `path_id` (enrolments are not append-only),
 * and a file allowed to do that must not also hold the append-only model.
 */

export interface TransitionArgs {
  tenantId: string;
  brandId: string;
  programId: string | null;
  subjectRef: string;
  leadId: number | null;
  enrollmentId: string | null;
  type: Exclude<GrowthJourneyTransitionType, 'brand_referral_requested'>;
  from: Record<string, unknown> | null;
  to: Record<string, unknown>;
  reason: string;
  evidence?: string[];
  /** `routing_rule:<raw payload id>` | `human:<admin id>` | `classifier` */
  requestedBy: string;
}

export async function recordTransition(args: TransitionArgs): Promise<{ row: GrowthJourneyTransition; replayed: boolean }> {
  const row: GrowthJourneyTransitionAttributes = {
    tenant_id: args.tenantId,
    brand_id: args.brandId,
    program_id: args.programId,
    subject_ref: args.subjectRef,
    lead_id: args.leadId,
    enrollment_id: args.enrollmentId,
    transition_type: args.type,
    from_value: args.from,
    to_value: args.to,
    status: 'applied',
    reason: args.reason,
    evidence: args.evidence ?? [],
    requested_by: args.requestedBy,
    // Keyed on what changed and who asked: the same assignment replayed is one row.
    idempotency_key: computeIdempotencyKey([args.subjectRef, args.brandId, args.type, JSON.stringify(args.to), args.requestedBy]),
  };
  try {
    return { row: await GrowthJourneyTransition.create(row), replayed: false };
  } catch (err: unknown) {
    if (!isUniqueViolation(err)) throw err;
    const existing = await GrowthJourneyTransition.findOne({ where: { idempotency_key: row.idempotency_key } });
    if (!existing) throw err;
    return { row: existing, replayed: true };
  }
}
