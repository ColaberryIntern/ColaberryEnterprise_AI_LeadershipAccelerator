/**
 * caseStudyPublicationStore — the publish path's error vocabulary, and every
 * database READ it makes.
 *
 * READ `caseStudyPublicationService.ts` FIRST; it carries the doctrine. This is
 * the leaf it and the routes above it import, split out for CLAUDE.md's 500-line
 * ceiling on the same precedent as `caseStudySnapshotBuilder` + `…Sections` and
 * `caseStudyReadinessService` + `…Rubric`. The dependency runs one way: this
 * file imports the gate's TYPES and the models; nothing here imports the
 * service.
 *
 * THERE IS NO WRITE IN THIS FILE. No `create`, no `update`, no `upsert`, no
 * `destroy`. Reads and the row-to-domain mapping live here; the single table the
 * feature writes (`case_study_publications`) is written only in the service, in
 * two places, both after the gate has allowed it. Keeping the read side free of
 * writes is what makes "the admin preview cannot accidentally publish" a
 * property of the file layout rather than a promise in a comment.
 *
 * FAILURE-FIRST. (1) A missing Case Study or a snapshot id that belongs to
 * another Case Study raises a tagged 404 before any decision is attempted, so
 * nothing downstream has to cope with a null it did not expect. (2) No retry —
 * these are single reads; a transport failure propagates to the route, where
 * connection errors are already classified. (3) Recovery: the caller supplies a
 * correct id, or approves a snapshot. (4) Not handled: the database being
 * unavailable.
 */
import CaseStudy from '../../models/CaseStudy';
import CaseStudyPublication from '../../models/CaseStudyPublication';
import CaseStudySnapshot from '../../models/CaseStudySnapshot';
import type { CaseStudyPublishBlocker, CaseStudyPublishRecord, CaseStudyPublishSnapshot } from './caseStudyPublishGate';
import type {
  CaseStudyBuilderIdentityMode,
  CaseStudyOrganizationIdentityMode,
  CaseStudySnapshotContent,
  CaseStudySnapshotStatus,
  CaseStudyStatus,
} from '../../types/caseStudy';
import type { CaseStudyProvenance } from '../../types/caseStudyProvenance';

/* ─────────────────────────────────────────────────────────────── errors ──── */

export type CaseStudyPublicationErrorClass =
  | 'ValidationError'
  | 'CaseStudyNotFound'
  | 'SnapshotNotFound'
  | 'PublishBlocked'
  | 'ConcurrentUpdate';

/**
 * Tagged, in the shape `workLedger/workLedgerService.ts:53-59` established: a
 * stable `error_class`, an http status, and the structured detail a route needs
 * in order to render something better than "cannot publish".
 */
export class CaseStudyPublicationError extends Error {
  public readonly error_class: CaseStudyPublicationErrorClass;
  public readonly http_status: number;
  public readonly blockers: readonly CaseStudyPublishBlocker[];
  public readonly details: Record<string, unknown>;

  constructor(
    error_class: CaseStudyPublicationErrorClass,
    message: string,
    options: {
      blockers?: readonly CaseStudyPublishBlocker[];
      details?: Record<string, unknown>;
    } = {},
  ) {
    super(message);
    this.name = 'CaseStudyPublicationError';
    this.error_class = error_class;
    this.http_status = error_class === 'CaseStudyNotFound' || error_class === 'SnapshotNotFound'
      ? 404
      : error_class === 'ConcurrentUpdate' ? 409 : 400;
    this.blockers = Object.freeze([...(options.blockers ?? [])]);
    this.details = Object.freeze({ ...(options.details ?? {}) });
  }
}

export function isCaseStudyPublicationError(err: unknown): err is CaseStudyPublicationError {
  return err instanceof CaseStudyPublicationError;
}

export const isUniqueViolation = (err: unknown): boolean =>
  (err as { name?: string })?.name === 'SequelizeUniqueConstraintError';

/* ─────────────────────────────────────────────────────────────── mapping ──── */

/**
 * A DB row carries plain strings where the domain has unions. The cast is
 * confined to this boundary and is SAFE IN THE FAIL-CLOSED DIRECTION: an
 * unrecognised status is simply not `'approved'` and an unrecognised identity
 * mode is simply not `'named'`, so malformed data blocks rather than passes.
 */
export function toPublishRecord(row: CaseStudy): CaseStudyPublishRecord {
  return {
    id: row.id,
    status: row.status as CaseStudyStatus,
    organizationIdentityMode: row.organization_identity_mode as CaseStudyOrganizationIdentityMode,
    organizationNamingConsent: row.organization_naming_consent === true,
    organizationDisplayName: row.organization_display_name ?? null,
    builderIdentityMode: row.builder_identity_mode as CaseStudyBuilderIdentityMode,
    builderNamingConsent: row.builder_naming_consent === true,
    archivedAt: row.archived_at ? new Date(row.archived_at).toISOString() : null,
  };
}

export function toPublishSnapshot(row: CaseStudySnapshot | null): CaseStudyPublishSnapshot | null {
  if (!row) return null;
  return {
    id: row.id,
    version: row.version,
    status: row.status as CaseStudySnapshotStatus,
    approvedBy: row.approved_by ?? null,
    approvedAt: row.approved_at ? new Date(row.approved_at).toISOString() : null,
    content: (row.content ?? {}) as unknown as CaseStudySnapshotContent,
    provenance: (row.provenance ?? {}) as unknown as CaseStudyProvenance,
  };
}

/* ───────────────────────────────────────────────────────────────── reads ──── */

export async function loadCaseStudyOrThrow(caseStudyId: string): Promise<CaseStudy> {
  const row = await CaseStudy.findByPk(caseStudyId);
  if (!row) {
    throw new CaseStudyPublicationError('CaseStudyNotFound',
      `Case Study ${caseStudyId} was not found`);
  }
  return row;
}

/**
 * The APPROVED snapshot, highest version first — never simply the latest.
 *
 * A draft written by this morning's sync must not become live by being recent;
 * that is the whole reason `published_snapshot_id` exists. An explicitly
 * requested snapshot is looked up scoped to its Case Study, so an id from
 * another record raises a 404 rather than silently resolving to nothing and
 * being reported as "no approved snapshot exists".
 */
export async function resolveApprovedSnapshot(
  caseStudyId: string, snapshotId?: string,
): Promise<CaseStudySnapshot | null> {
  if (snapshotId) {
    const pinned = await CaseStudySnapshot.findOne({
      where: { id: snapshotId, case_study_id: caseStudyId },
    });
    if (!pinned) {
      throw new CaseStudyPublicationError('SnapshotNotFound',
        `Snapshot ${snapshotId} does not belong to Case Study ${caseStudyId}`);
    }
    return pinned;
  }
  return CaseStudySnapshot.findOne({
    where: { case_study_id: caseStudyId, status: 'approved' },
    order: [['version', 'DESC']],
  });
}

/** `UNIQUE(case_study_id, surface_key)` means this is at most one row. */
export const findPublicationRow = (caseStudyId: string, surfaceKey: string) =>
  CaseStudyPublication.findOne({
    where: { case_study_id: caseStudyId, surface_key: surfaceKey },
  });
