import { GrowthJourneyExecution } from '../../../models';
import type { GrowthJourneyExecutionAttributes, GrowthJourneyExecutionStatus } from '../../../models/GrowthJourneyExecution';
import { contextFromAdminRequest } from '../../../modules/tenancy/adminScopeBridge';
import { requireBrandAccessAudited } from '../../../modules/tenancy/tenantAccessGuards';
import { TenantAccessError, type PlatformRequestContext } from '../../../modules/tenancy/tenantAuthorization';
import { assertTransition, recordReceiptTransition } from './receiptTransitions';

/**
 * REVIEW's second half (Phase 5 T509): a human's approve or reject on a
 * journey proposal, applied to the receipt it points at.
 *
 * ─── THE ORDER IS THE POINT ─────────────────────────────────────────────────
 *
 *   1  an identity. No admin (the conversational path passes none) is
 *      `not_authorized`, and the proposal stays pending - nothing here
 *      widens an anonymous caller into an approver.
 *   2  the receipt. A proposal whose receipt is gone is `receipt_not_found`.
 *   3  brand access, RECORDED either way: the context is built for the
 *      receipt's TENANT only (asking the builder for the brand would refuse
 *      out-of-scope callers before anything is recorded - the T509 verifier's
 *      finding), and `requireBrandAccessAudited` decides the brand and writes
 *      the access decision, allowed or denied, so a review can see who tried
 *      to approve what, and whether they could.
 *   4  the receipt is `pending_review` AT THE WRITE: the flip is a conditional
 *      update (`where: { id, status: 'pending_review' }`), so two approvers, or
 *      an approver and the reconciler, cannot both move it; the loser reads
 *      `not_pending` and the proposal records the approval with
 *      `applied: false`. The ledger row is written only after the update
 *      succeeded.
 *
 * APPROVAL NEVER SENDS. It flips `pending_review -> approved` and writes the
 * ledger row; the adapter (T510/T511) re-runs every gate before anything
 * leaves. `approved_by` is the approver's platform identity id - an id, never
 * an address.
 */

export type ExecutionReviewOutcome =
  | { outcome: 'approved' | 'rejected'; receipt: GrowthJourneyExecution }
  | { outcome: 'not_authorized' }
  | { outcome: 'receipt_not_found' }
  | { outcome: 'not_pending'; status: string };

export interface ReviewerIdentity {
  id?: string;
  email?: string;
  role?: string;
}

const RESOURCE_TYPE = 'growth_journey_execution';

async function authorize(receipt: GrowthJourneyExecution, admin: ReviewerIdentity | undefined, action: 'approve' | 'reject'): Promise<PlatformRequestContext | null> {
  if (!admin) return null;
  const tenantId = String(receipt.get('tenant_id'));
  const brandId = String(receipt.get('brand_id'));
  // Tenant only: the builder confines a brand-restricted operator to their brands (`authorizedBrandIds`,
  // `brandId`), and the audited guard below is what judges the receipt's brand against them - and records it.
  const ctx: PlatformRequestContext = await contextFromAdminRequest(admin, { requestedTenantId: tenantId });
  try {
    await requireBrandAccessAudited(ctx, tenantId, brandId, { resourceType: RESOURCE_TYPE, action, resourceId: String(receipt.get('id')), actorEmail: admin.email ?? null });
  } catch (err: unknown) {
    if (err instanceof TenantAccessError) return null;
    throw err;
  }
  return ctx;
}

async function review(receiptId: string, admin: ReviewerIdentity | undefined, action: 'approve' | 'reject'): Promise<ExecutionReviewOutcome> {
  if (!admin) return { outcome: 'not_authorized' };
  const receipt = await GrowthJourneyExecution.findOne({ where: { id: receiptId } });
  if (!receipt) return { outcome: 'receipt_not_found' };
  const ctx = await authorize(receipt, admin, action);
  if (!ctx) return { outcome: 'not_authorized' };

  const status = String(receipt.get('status'));
  if (status !== 'pending_review') return { outcome: 'not_pending', status };
  const to: GrowthJourneyExecutionStatus = action === 'approve' ? 'approved' : 'rejected';
  assertTransition('pending_review', to);
  const now = new Date();
  const actor = `admin:${ctx.platformIdentityId ?? 'unknown'}`;
  const patch: Partial<GrowthJourneyExecutionAttributes> = action === 'approve'
    ? { status: to, status_reason: 'approved_by_review', approved_by: actor, approved_at: now }
    : { status: to, status_reason: 'rejected_by_review' };
  // Conditional on the status at the write, not at the read above: the database decides who moved it.
  const [moved] = await GrowthJourneyExecution.update(patch, { where: { id: receiptId, status: 'pending_review' } });
  if (moved === 0) {
    const now_ = await GrowthJourneyExecution.findOne({ where: { id: receiptId } });
    return { outcome: 'not_pending', status: String(now_?.get('status') ?? 'unknown') };
  }
  await recordReceiptTransition(String(receipt.get('id')), { tenant_id: String(receipt.get('tenant_id')), brand_id: String(receipt.get('brand_id')) }, 'pending_review', to, `${to}_by_review`, {
    decision_id: String(receipt.get('decision_id')), proposal_id: (receipt.get('proposal_id') as string | null) ?? null,
  }, actor);
  const updated = await GrowthJourneyExecution.findOne({ where: { id: receiptId } });
  return { outcome: to, receipt: updated ?? receipt };
}

/** Approve: `pending_review -> approved`. Never enrols. */
export const applyExecutionApproval = (receiptId: string, admin: ReviewerIdentity | undefined): Promise<ExecutionReviewOutcome> => review(receiptId, admin, 'approve');

/** Reject: `pending_review -> rejected`, a terminal status; the person's open slot is released. */
export const applyExecutionRejection = (receiptId: string, admin: ReviewerIdentity | undefined): Promise<ExecutionReviewOutcome> => review(receiptId, admin, 'reject');
