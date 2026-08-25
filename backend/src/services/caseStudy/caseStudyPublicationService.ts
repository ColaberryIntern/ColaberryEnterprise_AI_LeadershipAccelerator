/**
 * caseStudyPublicationService — publish, unpublish, and the boundary around the
 * gate. T012, spec §15-17 and §35.
 *
 * THE DIVISION OF LABOUR. `caseStudyPublishGate.ts` decides;
 * `caseStudyPublicationStore.ts` reads `case_studies` and
 * `case_study_snapshots` and holds the error vocabulary; this file orchestrates
 * the two and is the ONLY place in the feature that writes anything. It writes
 * EXACTLY ONE table: `case_study_publications`. It never writes a Case Study, a
 * snapshot, a metric, an evidence row, an artifact, an `EvidenceRecord`, a
 * `PortfolioArtifact`, a `Project` or a `GitHubConnection`. The suite asserts
 * that against every Sequelize write method on all four foreign models, because
 * "we did not mean to write there" is not a property, and an assertion is.
 *
 * PUBLICATION PINS A SNAPSHOT. `published_snapshot_id` is set once, at publish,
 * from the snapshot the gate actually approved. A later sync writes a new DRAFT
 * snapshot and NOTHING in this file moves the pointer — there is no code path
 * from a sync to a publication row, and republishing is an explicit second call
 * with its own gate run (spec §17: "do not silently mutate live content"). The
 * default resolution is the highest-versioned APPROVED snapshot, never the
 * newest one, so an unreviewed draft cannot become live by being recent.
 *
 * IT NEVER TOUCHES `case_studies.status`. Publication state lives in
 * `case_study_publications.status`, and it lives there alone. Flipping the
 * canonical record to 'published' would make the gate's own first rule
 * ("status must be approved") refuse the second publish of an already-published
 * record, which would break the idempotency spec §30 requires. One fact, one
 * home.
 *
 * IDEMPOTENCY (spec §30, and CLAUDE.md's non-negotiable). Publishing the same
 * approved snapshot to the same surface twice performs NO WRITE the second time
 * and reports `unchanged`; the gate still runs, because a record whose consent
 * was revoked between the two calls must be refused the second time. Unpublish
 * is the same shape: unpublishing an already-unpublished surface, or one that
 * was never published, writes nothing and reports `unchanged`. The
 * `UNIQUE(case_study_id, surface_key)` index is the backstop for two admins
 * clicking at once, and the create/conflict/re-read loop below is bounded at
 * three attempts — never unbounded.
 *
 * UNPUBLISH IS NOT DELETE (spec §35). It sets `status = 'unpublished'` and
 * stamps `unpublished_at`. It RETAINS `published_snapshot_id`, so the record
 * still says which version was live, and it removes no snapshot, no evidence, no
 * metric and no publication row. There is no `destroy` call in this file at all.
 *
 * WHAT IS NEVER LOGGED. Log lines carry blocker CODES, never blocker messages —
 * a message can quote an organisation's name or a contributor's name, a code
 * cannot. `actor` is written to `published_by` (it is an accountability column)
 * and never logged; `published_by` is on `FORBIDDEN_PUBLIC_KEYS` for the same
 * reason. No student email, enrollment id, card id or repository identity can
 * reach a log line here: the only repository reference this feature ever
 * produces comes from `repoLogIdentity()` inside a blocker message, which fails
 * closed on `unknown` visibility, and blocker messages are not logged.
 *
 * FAILURE-FIRST. (1) On failure nothing partial is written — a publish is a
 * single INSERT or a single UPDATE, so there is no half state to unwind, and the
 * gate runs to completion BEFORE any write is attempted. (2) Retry: the
 * unique-index race only, capped at `MAX_PUBLICATION_ATTEMPTS`; a refusal is
 * never retried, because a refusal is an answer rather than an outage. (3)
 * Recovery: for a refusal, the returned blockers are the worklist; for a
 * database failure, the caller re-runs the operation, which is safe because it
 * is idempotent. (4) Handled: a missing Case Study, a snapshot id that does not
 * exist, no approved snapshot at all, a concurrent create, a repeat publish and
 * a repeat unpublish. NOT handled: the database being unavailable, which
 * propagates to the route where connection failures are already classified.
 */
import { z } from 'zod';
import CaseStudyPublication from '../../models/CaseStudyPublication';
import { ensureTraceId } from '../../utils/requestContext';
import { CASE_STUDY_SURFACE_KEYS } from '../../types/caseStudy';
import { evaluateCaseStudyPublishGate } from './caseStudyPublishGate';
import {
  CaseStudyPublicationError,
  findPublicationRow,
  isUniqueViolation,
  loadCaseStudyOrThrow,
  resolveApprovedSnapshot,
  toPublishRecord,
  toPublishSnapshot,
} from './caseStudyPublicationStore';
import type { CaseStudyPublishDecision, CaseStudyPublishSnapshot } from './caseStudyPublishGate';
import type { CaseStudySurfaceKey } from '../../types/caseStudy';

/** One import site for the gate and the store, so callers need one module. */
export {
  CASE_STUDY_PUBLISH_BLOCKER_CODES,
  evaluateCaseStudyPublishGate,
  formatCaseStudyPublishBlockers,
} from './caseStudyPublishGate';
export type {
  CaseStudyPublishBlocker,
  CaseStudyPublishBlockerCode,
  CaseStudyPublishDecision,
  CaseStudyPublishGateInput,
  CaseStudyPublishRecord,
  CaseStudyPublishSnapshot,
} from './caseStudyPublishGate';
export { CaseStudyPublicationError, isCaseStudyPublicationError } from './caseStudyPublicationStore';
export type { CaseStudyPublicationErrorClass } from './caseStudyPublicationStore';

/** The version race is bounded. CLAUDE.md: infinite retry loops are prohibited. */
export const MAX_PUBLICATION_ATTEMPTS = 3;

/* ──────────────────────────────────────────────────────────── contracts ──── */

export interface PublishCaseStudyInput {
  readonly caseStudyId: string;
  /** All four surfaces are accepted here and only `enterprise` survives the gate. */
  readonly surfaceKey: CaseStudySurfaceKey;
  /** Pin this exact snapshot. Omitted ⇒ the highest-versioned APPROVED one. */
  readonly snapshotId?: string;
  /** Written to `published_by`. Never logged. */
  readonly actor: string;
  readonly correlationId?: string;
}

export interface PublishCaseStudyResult {
  /** `unchanged` is the idempotent outcome: same snapshot, same surface, no write. */
  readonly outcome: 'unchanged' | 'published';
  readonly publicationId: string;
  readonly caseStudyId: string;
  readonly surfaceKey: CaseStudySurfaceKey;
  /** The pinned version. A later draft never moves this. */
  readonly publishedSnapshotId: string;
  readonly snapshotVersion: number;
  readonly publishedAt: string | null;
}

export interface UnpublishCaseStudyInput {
  readonly caseStudyId: string;
  readonly surfaceKey: CaseStudySurfaceKey;
  readonly actor: string;
  readonly correlationId?: string;
}

export interface UnpublishCaseStudyResult {
  readonly outcome: 'unchanged' | 'unpublished';
  /** `null` only when no publication row has ever existed for this surface. */
  readonly publicationId: string | null;
  /** RETAINED on unpublish (spec §35). The record still says what was live. */
  readonly publishedSnapshotId: string | null;
  readonly unpublishedAt: string | null;
}

const surfaceEnum = z.enum(CASE_STUDY_SURFACE_KEYS);

const publishSchema = z.object({
  caseStudyId: z.string().trim().min(1).max(64),
  surfaceKey: surfaceEnum,
  snapshotId: z.string().trim().min(1).max(64).optional(),
  actor: z.string().trim().min(1).max(255),
  correlationId: z.string().min(1).max(200).optional(),
});

const unpublishSchema = z.object({
  caseStudyId: z.string().trim().min(1).max(64),
  surfaceKey: surfaceEnum,
  actor: z.string().trim().min(1).max(255),
  correlationId: z.string().min(1).max(200).optional(),
});

/** Zod v4: `error.issues`, never `.errors`. */
function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown, what: string): T {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  const detail = parsed.error.issues
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
  throw new CaseStudyPublicationError('ValidationError', `Invalid ${what}: ${detail}`, {
    details: { issues: parsed.error.issues.length },
  });
}

/* ───────────────────────────────────────────────────────────── logging ───── */

/** FIXED shape. There is no spread of an arbitrary object that could carry a
 *  name, an email or a repository identity into stdout. */
interface PublicationLogContext {
  case_study_id: string;
  surface_key: string;
  snapshot_id?: string;
  snapshot_version?: number;
  publication_id?: string;
  blocker_count?: number;
  /** Codes, never messages: a message can quote a client's name, a code cannot. */
  blocker_codes?: readonly string[];
  attempt?: number;
  duration_ms?: number;
  error_class?: string;
}

/** Structured, per `services/artifacts/artifactRepoSync.ts:92-102`. */
function log(
  event: string, outcome: string, correlationId: string, ctx: PublicationLogContext,
): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'case-study-publication',
    event,
    correlation_id: correlationId,
    outcome,
    context: ctx,
  }));
}

/* ────────────────────────────────────────────────────────── the operations ── */

/**
 * Run the gate against live data WITHOUT writing anything.
 *
 * This is what an admin screen calls to render "what is still blocking this",
 * and it is the same code path `publishCaseStudy` takes — not a second
 * implementation that could drift from the first and tell an admin a record is
 * ready when the gate would refuse it.
 */
export async function evaluateCaseStudyPublication(
  input: PublishCaseStudyInput,
): Promise<CaseStudyPublishDecision> {
  const data = parseOrThrow(publishSchema, input, 'publish input');
  const record = await loadCaseStudyOrThrow(data.caseStudyId);
  const snapshot = await resolveApprovedSnapshot(data.caseStudyId, data.snapshotId);
  return evaluateCaseStudyPublishGate({
    surfaceKey: data.surfaceKey,
    caseStudy: toPublishRecord(record),
    snapshot: toPublishSnapshot(snapshot),
  });
}

/**
 * Publish one Case Study to one surface, or refuse with every reason at once.
 *
 * @throws CaseStudyPublicationError('ValidationError' | 'CaseStudyNotFound'
 *   | 'SnapshotNotFound' | 'PublishBlocked' | 'ConcurrentUpdate')
 */
export async function publishCaseStudy(
  input: PublishCaseStudyInput,
): Promise<PublishCaseStudyResult> {
  const started = Date.now();
  const correlationId = ensureTraceId(input?.correlationId);
  const data = parseOrThrow(publishSchema, input, 'publish input');

  const record = await loadCaseStudyOrThrow(data.caseStudyId);
  const snapshotRow = await resolveApprovedSnapshot(data.caseStudyId, data.snapshotId);
  const snapshot = toPublishSnapshot(snapshotRow);

  // THE GATE RUNS FIRST, ALWAYS, AND ON EVERY CALL — including a repeat publish
  // of a record that is already live. Consent can be withdrawn between two
  // clicks, and a second publish must be refused when it has been.
  const decision = evaluateCaseStudyPublishGate({
    surfaceKey: data.surfaceKey,
    caseStudy: toPublishRecord(record),
    snapshot,
  });
  const base: PublicationLogContext = {
    case_study_id: data.caseStudyId,
    surface_key: data.surfaceKey,
    snapshot_id: snapshot?.id,
    snapshot_version: snapshot?.version,
  };
  if (!decision.allowed) {
    log('case_study.publish', 'blocked', correlationId, {
      ...base,
      blocker_count: decision.blockers.length,
      blocker_codes: decision.codes,
      duration_ms: Date.now() - started,
      error_class: 'PublishBlocked',
    });
    throw new CaseStudyPublicationError('PublishBlocked', decision.summary, {
      blockers: decision.blockers,
      details: { codes: decision.codes, blocker_count: decision.blockers.length },
    });
  }

  // The gate allowed it, so a snapshot exists — rule 2 refuses when it does not.
  const approved = snapshot as CaseStudyPublishSnapshot;

  for (let attempt = 1; attempt <= MAX_PUBLICATION_ATTEMPTS; attempt += 1) {
    const existing = await findPublicationRow(data.caseStudyId, data.surfaceKey);

    // THE IDEMPOTENCY GATE. Same surface, same pinned snapshot, already live ⇒
    // no write, however many times an admin clicks Publish.
    if (existing && existing.status === 'published'
      && existing.published_snapshot_id === approved.id) {
      log('case_study.publish', 'unchanged', correlationId, {
        ...base, publication_id: existing.id, attempt, duration_ms: Date.now() - started,
      });
      return {
        outcome: 'unchanged',
        publicationId: existing.id,
        caseStudyId: data.caseStudyId,
        surfaceKey: data.surfaceKey,
        publishedSnapshotId: approved.id,
        snapshotVersion: approved.version,
        publishedAt: existing.published_at ? new Date(existing.published_at).toISOString() : null,
      };
    }

    const publishedAt = new Date();
    if (existing) {
      // Re-publishing after an unpublish, or moving the pin to a newly approved
      // version. `unpublished_at` is cleared because the row is STATE, not
      // history: leaving it set would make the row claim both things at once.
      await existing.update({
        status: 'published',
        published_snapshot_id: approved.id,
        published_by: data.actor,
        published_at: publishedAt,
        unpublished_at: null,
      });
      log('case_study.publish', 'success', correlationId, {
        ...base, publication_id: existing.id, attempt, duration_ms: Date.now() - started,
      });
      return {
        outcome: 'published',
        publicationId: existing.id,
        caseStudyId: data.caseStudyId,
        surfaceKey: data.surfaceKey,
        publishedSnapshotId: approved.id,
        snapshotVersion: approved.version,
        publishedAt: publishedAt.toISOString(),
      };
    }

    try {
      const created = await CaseStudyPublication.create({
        case_study_id: data.caseStudyId,
        surface_key: data.surfaceKey,
        status: 'published',
        published_snapshot_id: approved.id,
        published_by: data.actor,
        published_at: publishedAt,
      });
      log('case_study.publish', 'success', correlationId, {
        ...base, publication_id: created.id, attempt, duration_ms: Date.now() - started,
      });
      return {
        outcome: 'published',
        publicationId: created.id,
        caseStudyId: data.caseStudyId,
        surfaceKey: data.surfaceKey,
        publishedSnapshotId: approved.id,
        snapshotVersion: approved.version,
        publishedAt: publishedAt.toISOString(),
      };
    } catch (err) {
      // Another admin created the row between the read and the insert.
      // `UNIQUE(case_study_id, surface_key)` caught it; re-read and take the
      // update branch. Bounded, so a permanently failing constraint surfaces
      // instead of spinning.
      if (!isUniqueViolation(err) || attempt === MAX_PUBLICATION_ATTEMPTS) {
        log('case_study.publish', 'failure', correlationId, {
          ...base, attempt, duration_ms: Date.now() - started,
          error_class: isUniqueViolation(err) ? 'ConcurrentUpdate' : 'DatabaseError',
        });
        if (isUniqueViolation(err)) {
          throw new CaseStudyPublicationError('ConcurrentUpdate',
            `Another publication of ${data.surfaceKey} for this Case Study is in flight; retry`);
        }
        throw err;
      }
    }
  }

  /* istanbul ignore next — the loop either returns or throws on its last attempt. */
  throw new CaseStudyPublicationError('ConcurrentUpdate', 'publication attempts exhausted');
}

/**
 * Remove a Case Study from a public surface. Spec §35: archive and unpublish,
 * never destructive delete.
 *
 * Deletes nothing. Keeps `published_snapshot_id`, so the row still records which
 * version was live, and touches no snapshot, evidence, metric or artifact.
 * Repeating it is a no-op that reports `unchanged`.
 */
export async function unpublishCaseStudy(
  input: UnpublishCaseStudyInput,
): Promise<UnpublishCaseStudyResult> {
  const started = Date.now();
  const correlationId = ensureTraceId(input?.correlationId);
  const data = parseOrThrow(unpublishSchema, input, 'unpublish input');

  const existing = await findPublicationRow(data.caseStudyId, data.surfaceKey);
  const base: PublicationLogContext = {
    case_study_id: data.caseStudyId,
    surface_key: data.surfaceKey,
    publication_id: existing?.id,
  };

  // Nothing was ever published here, or it is already unpublished. Both are
  // "the surface is not public", which is the state being asked for.
  if (!existing || existing.status === 'unpublished') {
    log('case_study.unpublish', 'unchanged', correlationId, {
      ...base, duration_ms: Date.now() - started,
    });
    return {
      outcome: 'unchanged',
      publicationId: existing?.id ?? null,
      publishedSnapshotId: existing?.published_snapshot_id ?? null,
      unpublishedAt: existing?.unpublished_at
        ? new Date(existing.unpublished_at).toISOString() : null,
    };
  }

  const unpublishedAt = new Date();
  // `published_snapshot_id` is deliberately NOT cleared, and no row is removed.
  await existing.update({ status: 'unpublished', unpublished_at: unpublishedAt });
  log('case_study.unpublish', 'success', correlationId, {
    ...base, duration_ms: Date.now() - started,
  });
  return {
    outcome: 'unpublished',
    publicationId: existing.id,
    publishedSnapshotId: existing.published_snapshot_id ?? null,
    unpublishedAt: unpublishedAt.toISOString(),
  };
}
