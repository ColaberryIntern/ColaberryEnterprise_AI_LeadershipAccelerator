/**
 * Blueprint approval — assembled from four approval ladders this repo already has, not a fifth.
 *
 * Each of the properties below was already solved somewhere here, just never in one place. The
 * provenance is recorded because the reasoning behind each one is worth more than the code:
 *
 *   CAS on an expected revision        factoryApproval.ts:45-57
 *   fork-on-edit, immutable snapshots  factoryApproval.ts:147
 *   a write-time validation gate       factoryApproval.ts:78-93 (assertApprovable -> factoryErrors)
 *   idempotent re-approval             deliveryContractService.ts:178-182
 *   supersede-first ordering           deliveryContractService.ts:188-190
 *   separation of duty                 govQualification.ts:311-315 (SelfApprovalError)
 *
 * THREE THINGS THIS DOES THAT THE EXISTING LADDERS DO NOT.
 *
 * 1. The hash binds TENANT as well as project and revision. `factoryApproval.contentHash()`
 *    covers only `revisionId + doc_json`, so it binds neither tenant nor actor, while the
 *    request requires every citation to resolve within the correct project/tenant and revision.
 *
 * 2. Separation of duty refuses a NULL proposer. The `govQualification` form short-circuits on a
 *    null identity, which is correct there but would be a ceremonial check here — it would pass
 *    on every row that predates the column. A manifest without `proposed_by` cannot be approved.
 *
 * 3. The read-compare-write runs inside a transaction. `factoryApproval` does it outside one with
 *    no row lock, so two concurrent approvers can both pass the application check. The unique
 *    index is the real backstop either way; the transaction means the loser fails cleanly rather
 *    than half-writing. Whether the index alone closes the race is LC-13 — a real past incident —
 *    and it is settled by a concurrent test against a real Postgres, never by argument.
 *
 * Policy: docs/project-lifecycle/approval-and-change-policy.md.
 */
import { createHash } from 'crypto';
import { Op, type Transaction } from 'sequelize';
import { sequelize } from '../../config/database';
import OperatingBlueprintManifest from '../../models/OperatingBlueprintManifest';
import BlueprintApproval from '../../models/BlueprintApproval';

export type ApprovalScope = 'documented' | 'full';

/** The approver's expected revision no longer matches. Carries the real one, so a UI can refresh. */
export class ApprovalConflictError extends Error {
  readonly currentRevision: number;
  constructor(currentRevision: number) {
    super(`Blueprint has moved to revision ${currentRevision}.`);
    this.name = 'ApprovalConflictError';
    this.currentRevision = currentRevision;
  }
}

/** The blueprint is not in an approvable state. Carries why, so the caller can list it. */
export class ApprovalGateError extends Error {
  readonly issues: ReadonlyArray<string>;
  constructor(issues: ReadonlyArray<string>) {
    super(`Blueprint is not approvable: ${issues.length} issue(s).`);
    this.name = 'ApprovalGateError';
    this.issues = issues;
  }
}

/** The proposer cannot approve their own work, and an unrecorded proposer cannot either. */
export class SelfApprovalError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'SelfApprovalError';
  }
}

/** A superseded revision can never be approved; a later one already governs. */
export class SupersededRevisionError extends Error {
  constructor(revision: number) {
    super(`Revision ${revision} has been superseded and can no longer be approved.`);
    this.name = 'SupersededRevisionError';
  }
}

/** The manifest does not exist, or does not belong to this tenant. Deliberately indistinguishable. */
export class ManifestNotFoundError extends Error {
  constructor() {
    // One message for both cases on purpose: telling a caller "it exists but not for you" is a
    // cross-tenant existence oracle.
    super('No such blueprint manifest.');
    this.name = 'ManifestNotFoundError';
  }
}

/**
 * SHA-256 over tenant + project + revision + the pinned references.
 *
 * Parts are joined with a NUL, which cannot occur in a UUID or in JSON text, so
 * ("t","p",1) and ("t","p1",...) cannot collide. That is the same domain-separation trick
 * `factoryIds.factoryId` uses, and the reason both files read as binary to plain grep.
 */
export function manifestContentHash(parts: {
  tenantId: string;
  projectId: string;
  revision: number;
  refs: unknown;
}): string {
  const canonical = [
    parts.tenantId,
    parts.projectId,
    String(parts.revision),
    JSON.stringify(parts.refs ?? null),
  ].join('\0');
  return createHash('sha256').update(canonical).digest('hex');
}

/** The project this manifest belongs to, whichever identity table it lives in. */
function projectIdOf(m: OperatingBlueprintManifest): string {
  const id = m.student_project_id ?? m.delivery_project_id;
  if (!id) throw new Error('ManifestInvariantViolation: manifest has neither project id');
  return id;
}

export interface ApproveBlueprintInput {
  tenantId: string;
  manifestId: string;
  /** The revision the approver believes they are approving. The CAS compares against this. */
  expectedRevision: number;
  scope: ApprovalScope;
  /** From the authenticated session. NEVER from a request body. */
  approvedBy: string;
  approvedByRole?: string | null;
  rationale?: string | null;
  selectedDesignRef?: string | null;
  /** Blocking reasons the caller's prerequisite check produced, if any. */
  gateIssues?: ReadonlyArray<string>;
}

export interface ApproveBlueprintResult {
  approval: BlueprintApproval;
  /**
   * True when this revision was already approved and the ORIGINAL record is being returned.
   * Re-stamping would quietly change who approved what, and when.
   */
  alreadyApproved: boolean;
}

/**
 * Approve one exact blueprint revision.
 *
 * Ordering is deliberate and each step is a refusal the caller maps to its own status:
 * not-found (404) -> superseded (409) -> CAS mismatch (409 + currentRevision) -> gate (422 +
 * issues) -> separation of duty (403) -> idempotent hit (200 with the original) -> write.
 */
export async function approveBlueprint(input: ApproveBlueprintInput): Promise<ApproveBlueprintResult> {
  return sequelize.transaction(async (tx: Transaction) => {
    // Tenant is part of the lookup, not a check applied afterwards. A row check that runs after
    // an unscoped read has already leaked the row's existence.
    const manifest = await OperatingBlueprintManifest.findOne({
      where: { id: input.manifestId, tenant_id: input.tenantId },
      transaction: tx,
    });
    if (!manifest) throw new ManifestNotFoundError();

    if (manifest.status === 'superseded') {
      throw new SupersededRevisionError(manifest.revision);
    }

    if (manifest.revision !== input.expectedRevision) {
      throw new ApprovalConflictError(manifest.revision);
    }

    if (input.gateIssues && input.gateIssues.length > 0) {
      throw new ApprovalGateError(input.gateIssues);
    }

    // Separation of duty. A null proposer refuses: without one there is nothing to compare the
    // approver against, and passing would make the check ceremonial.
    if (!manifest.proposed_by) {
      throw new SelfApprovalError(
        'No proposer is recorded on this blueprint, so the approver cannot be shown to differ from it.',
      );
    }
    if (manifest.proposed_by === input.approvedBy) {
      throw new SelfApprovalError(`${input.approvedBy} proposed this blueprint and cannot also approve it.`);
    }

    // Idempotency. A retried approval returns the ORIGINAL approver and timestamp.
    const existing = await BlueprintApproval.findOne({
      where: { manifest_id: manifest.id, revision: manifest.revision },
      transaction: tx,
    });
    if (existing) {
      return { approval: existing, alreadyApproved: true };
    }

    const hash = manifest.content_sha256 ?? manifestContentHash({
      tenantId: manifest.tenant_id,
      projectId: projectIdOf(manifest),
      revision: manifest.revision,
      refs: manifest.refs_json,
    });

    // Supersede-first. If this fails, nothing has been approved yet, and the previously approved
    // revision keeps governing — strictly better than two approved revisions with no way to tell
    // which is current.
    const projectScope = manifest.student_project_id
      ? { student_project_id: manifest.student_project_id }
      : { delivery_project_id: manifest.delivery_project_id };
    await OperatingBlueprintManifest.update(
      { status: 'superseded', superseded_by_id: manifest.id },
      {
        where: {
          tenant_id: manifest.tenant_id,
          ...projectScope,
          status: 'approved',
          id: { [Op.ne]: manifest.id },
        },
        transaction: tx,
      },
    );

    const approval = await BlueprintApproval.create(
      {
        tenant_id: manifest.tenant_id,
        manifest_id: manifest.id,
        revision: manifest.revision,
        content_sha256: hash,
        scope: input.scope,
        approved_by: input.approvedBy,
        approved_by_role: input.approvedByRole ?? null,
        rationale: input.rationale ?? null,
        selected_design_ref: input.selectedDesignRef ?? null,
      },
      { transaction: tx },
    );

    await manifest.update({ status: 'approved', content_sha256: hash }, { transaction: tx });

    return { approval, alreadyApproved: false };
  });
}

/** The HTTP status each refusal maps to, so routes do not each re-derive it. */
export function approvalErrorStatus(err: unknown): number {
  if (err instanceof ManifestNotFoundError) return 404;
  if (err instanceof ApprovalConflictError) return 409;
  if (err instanceof SupersededRevisionError) return 409;
  if (err instanceof ApprovalGateError) return 422;
  if (err instanceof SelfApprovalError) return 403;
  return 500;
}
