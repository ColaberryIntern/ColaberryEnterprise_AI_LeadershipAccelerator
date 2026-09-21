/**
 * factoryReview — records a reviewer's "request changes" decision on a contract decomposition.
 *
 * A change request is a COMPANION record, never a mutation of the immutable, versioned
 * contract_process_documents (approvals live in factoryApproval's fork-on-edit + CAS ladder). This
 * keeps "send it back" out of the approval state machine entirely, mirroring how internship keeps a
 * decision out of the application row. The one DB write lazy-loads its model so importing this
 * service never triggers ORM init (the projectApprovalService lesson).
 */
export interface RequestChangesInput {
  deliveryProjectId: string;
  trackType: string;
  /** the document version the reviewer looked at (recorded, so the request is anchored to a version). */
  reviewedVersion: number;
  reason: string;
  requestedBy: string;
}

export interface ReviewRecordDto {
  id: string;
  delivery_project_id: string;
  track_type: string;
  reviewed_version: number;
  decision: string;
  reason: string | null;
  requested_by: string | null;
  created_at: string;
}

/** A blank reason is refused: a change request with no reason is not actionable (400). */
export class ReviewValidationError extends Error {
  status = 400;
  error_class = 'ValidationError';
  constructor(message: string) {
    super(message);
    this.name = 'ReviewValidationError';
  }
}

export async function requestChanges(input: RequestChangesInput): Promise<ReviewRecordDto> {
  const reason = (input.reason ?? '').trim();
  if (!reason) throw new ReviewValidationError('A reason is required to request changes.');

  const { default: ContractProcessReview } = await import('../../models/ContractProcessReview');
  const row: any = await ContractProcessReview.create({
    delivery_project_id: input.deliveryProjectId,
    track_type: input.trackType,
    reviewed_version: input.reviewedVersion,
    decision: 'changes_requested',
    reason,
    requested_by: input.requestedBy,
  });

  return {
    id: String(row.id),
    delivery_project_id: input.deliveryProjectId,
    track_type: input.trackType,
    reviewed_version: input.reviewedVersion,
    decision: 'changes_requested',
    reason,
    requested_by: input.requestedBy,
    created_at: (row?.created_at instanceof Date ? row.created_at : new Date()).toISOString(),
  };
}
