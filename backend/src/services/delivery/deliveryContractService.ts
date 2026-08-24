/**
 * deliveryContractService — versioned delivery contracts with frozen approval snapshots.
 *
 * THE ONE PROPERTY THIS FILE EXISTS TO GUARANTEE: what was agreed stays readable exactly
 * as it was agreed.
 *
 * A working contract row keeps changing as a project evolves. If approval were a status
 * flag on that same mutable row, "the client approved this" would decay into "the client
 * approved something, and here is what the row says now" — which is worthless in the
 * exact situations a contract exists for: a dispute, an audit, or a case study.
 *
 * So approval freezes a copy into `approved_snapshot`, and a change to an approved
 * contract creates version N+1 rather than editing N. Master plan §24 lists "design
 * approval can be silently overwritten" as a stop condition; the same reasoning applies
 * to the contract that governs the design.
 *
 * IDEMPOTENT. Approving twice returns the first approval unchanged rather than
 * re-freezing a snapshot with a later timestamp (master plan §15: "same approval retry ⇒
 * one approval").
 */

import { Op } from 'sequelize';
import DeliveryContract, {
  type ContractStatus,
  type DataSensitivity,
} from '../../models/DeliveryContract';

/** The fields frozen at approval. Deliberately explicit rather than a spread of the row. */
const SNAPSHOT_FIELDS = [
  'business_outcome',
  'primary_users',
  'success_measures',
  'scope_in',
  'scope_out',
  'constraints',
  'data_sensitivity',
  'delivery_class',
  'acceptance_owner_identity_id',
  'technical_owner_identity_id',
  'client_responsibilities',
  'required_approvals',
  'required_delivery_profile',
  'definition_of_done',
  'operational_expectations',
  'change_policy',
] as const;

export class ContractError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`delivery contract: ${reason}`);
    this.name = 'ContractError';
    this.reason = reason;
  }
}

/**
 * Build the frozen snapshot from a contract row.
 *
 * An explicit field list, not `{ ...row.toJSON() }`. A spread would silently start
 * capturing any column added later — including ids, timestamps, and whatever internal
 * bookkeeping arrives in six months — and the snapshot is the thing a client may later be
 * shown. What goes into it should be a decision, not a consequence.
 */
export function buildSnapshot(contract: DeliveryContract): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (const field of SNAPSHOT_FIELDS) {
    snapshot[field] = (contract as unknown as Record<string, unknown>)[field] ?? null;
  }
  snapshot.version = contract.version;
  snapshot.delivery_project_id = contract.delivery_project_id;
  return snapshot;
}

/** The current (highest-version) contract for a project, approved or not. */
export async function getCurrentContract(
  deliveryProjectId: string,
): Promise<DeliveryContract | null> {
  return DeliveryContract.findOne({
    where: { delivery_project_id: deliveryProjectId },
    order: [['version', 'DESC']],
  });
}

/** The most recent APPROVED contract — what actually governs the project today. */
export async function getGoverningContract(
  deliveryProjectId: string,
): Promise<DeliveryContract | null> {
  return DeliveryContract.findOne({
    where: { delivery_project_id: deliveryProjectId, status: 'approved' },
    order: [['version', 'DESC']],
  });
}

export interface DraftContractInput {
  deliveryProjectId: string;
  businessOutcome?: string | null;
  primaryUsers?: string | null;
  successMeasures?: Record<string, any> | null;
  scopeIn?: Record<string, any> | null;
  scopeOut?: Record<string, any> | null;
  constraints?: Record<string, any> | null;
  dataSensitivity?: DataSensitivity;
  deliveryClass?: string | null;
  acceptanceOwnerIdentityId?: string | null;
  technicalOwnerIdentityId?: string | null;
  clientResponsibilities?: Record<string, any> | null;
  requiredApprovals?: Record<string, any> | null;
  requiredDeliveryProfile?: string | null;
  definitionOfDone?: Record<string, any> | null;
  operationalExpectations?: Record<string, any> | null;
  changePolicy?: string | null;
}

function toRow(input: DraftContractInput): Record<string, unknown> {
  return {
    delivery_project_id: input.deliveryProjectId,
    business_outcome: input.businessOutcome ?? null,
    primary_users: input.primaryUsers ?? null,
    success_measures: input.successMeasures ?? null,
    scope_in: input.scopeIn ?? null,
    scope_out: input.scopeOut ?? null,
    constraints: input.constraints ?? null,
    // Defaults to `internal`, never `public`. A contract nobody has classified must not
    // become publishable by omission (Gate 15's Case Study adapter reads this).
    data_sensitivity: input.dataSensitivity ?? 'internal',
    delivery_class: input.deliveryClass ?? null,
    acceptance_owner_identity_id: input.acceptanceOwnerIdentityId ?? null,
    technical_owner_identity_id: input.technicalOwnerIdentityId ?? null,
    client_responsibilities: input.clientResponsibilities ?? null,
    required_approvals: input.requiredApprovals ?? null,
    required_delivery_profile: input.requiredDeliveryProfile ?? null,
    definition_of_done: input.definitionOfDone ?? null,
    operational_expectations: input.operationalExpectations ?? null,
    change_policy: input.changePolicy ?? null,
  };
}

/**
 * Create version 1, or a new draft version when the current one is already approved.
 *
 * An existing DRAFT is updated in place rather than versioned — versioning every keystroke
 * would bury the versions that represent real agreements under dozens that represent
 * typing.
 */
export async function draftContract(input: DraftContractInput): Promise<DeliveryContract> {
  const current = await getCurrentContract(input.deliveryProjectId);

  if (current && current.status === 'draft') {
    await current.update(toRow(input));
    return current;
  }

  const nextVersion = current ? current.version + 1 : 1;
  return DeliveryContract.create({
    ...toRow(input),
    version: nextVersion,
    status: 'draft',
  } as any);
}

export interface ApproveContractInput {
  contractId: string;
  approvedByIdentityId: string;
}

/**
 * Approve a contract, freezing its snapshot.
 *
 * Supersedes any previously approved version, so exactly one governs at a time.
 */
export async function approveContract(
  input: ApproveContractInput,
): Promise<{ contract: DeliveryContract; alreadyApproved: boolean }> {
  const contract = await DeliveryContract.findByPk(input.contractId);
  if (!contract) throw new ContractError('not_found');

  // Idempotent: a retried approval returns the original, with its original approver and
  // timestamp. Re-freezing would quietly change who approved what, and when.
  if (contract.status === 'approved') {
    return { contract, alreadyApproved: true };
  }

  if (contract.status === 'superseded') {
    throw new ContractError('cannot_approve_superseded_version');
  }

  // Mark older approved versions superseded first. If this fails, nothing has been
  // approved yet — better to leave the previous contract governing than to end up with
  // two approved versions and no way to tell which one is current.
  await DeliveryContract.update(
    { status: 'superseded' as ContractStatus },
    {
      where: {
        delivery_project_id: contract.delivery_project_id,
        status: 'approved',
        id: { [Op.ne]: contract.id },
      },
    },
  );

  await contract.update({
    status: 'approved',
    approved_snapshot: buildSnapshot(contract),
    approved_by_identity_id: input.approvedByIdentityId,
    approved_at: new Date(),
  });

  return { contract, alreadyApproved: false };
}

/**
 * What an approved contract actually committed to — the snapshot, not the live row.
 *
 * Callers that want "what does the contract say" for any client-facing or evidentiary
 * purpose must use this rather than reading the row's columns, which is why it exists as
 * a named function instead of leaving people to remember the distinction.
 */
export function approvedTerms(contract: DeliveryContract): Record<string, unknown> | null {
  if (contract.status !== 'approved' || !contract.approved_snapshot) return null;
  return contract.approved_snapshot;
}

/**
 * Has the working row drifted from what was approved?
 *
 * Drift is not an error — a draft of the next version legitimately differs. It is a
 * signal that the live row and the agreement are no longer the same thing, which is
 * exactly when someone is most likely to read one and believe the other.
 */
export function hasDriftedFromApproval(contract: DeliveryContract): boolean {
  const snapshot = approvedTerms(contract);
  if (!snapshot) return false;
  return SNAPSHOT_FIELDS.some((field) => {
    const live = (contract as unknown as Record<string, unknown>)[field] ?? null;
    return JSON.stringify(live) !== JSON.stringify(snapshot[field] ?? null);
  });
}
