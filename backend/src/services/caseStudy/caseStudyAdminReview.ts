/**
 * caseStudyAdminReview — the four review-desk operations behind
 * `/api/admin/case-studies/:id/*`: apply a human override, approve a snapshot,
 * read the sync history, and preview what publication would produce.
 *
 * SPLIT FROM `caseStudyAdminService` for the line ceiling, not for a second
 * concept — the same reason `caseStudyPublish{Gate,Rules,ClaimScan}` are three
 * files. That module owns the `case_studies` row; this one owns the snapshot a
 * human is reviewing. Both share `CaseStudyAdminError`, so a route maps one
 * error type.
 *
 * NOTHING HERE AUTHORISES A PUBLICATION. `previewSurfaceProjection` calls
 * `evaluateCaseStudyPublication`, which is the SAME code path `publishCaseStudy`
 * takes — deliberately, so a preview cannot tell an admin a record is ready when
 * the gate would refuse it. `approveSnapshot` marks a version reviewed; the gate
 * still runs in full on every publish, including a re-publish, because consent
 * can be withdrawn between two clicks.
 *
 * READINESS IS ADVISORY. It is reported beside the gate decision and never
 * consulted by it — see `caseStudyReadinessService`'s own header.
 *
 * FAILURE-FIRST. (1) An override that cannot be applied writes nothing and says
 * which path failed; an approval that races another admin loses on the
 * `status: 'draft'` predicate and reports `unchanged` rather than rewriting a
 * decision. (2) No retries: `persistCaseStudySnapshot` owns the bounded version
 * race, and everything else is a single write. (3) Recovery is the admin screen
 * — every error names a field. (4) Not handled: a database outage (500).
 */
import { z } from 'zod';
// The SAME projection the public API renders with — never a second renderer.
// See `caseStudyAdminPreview.ts` for why that matters and why it lives there.
import { projectPreviewDetail } from './caseStudyAdminPreview';
import type { CaseStudySurfacePreview } from './caseStudyAdminPreview';
// The SAME surface view the public detail response carries — never a second one.
import { surfaceView } from './caseStudySurfaceView';
import { getCaseStudySurfaceProfile } from './caseStudySurfaceProfiles';
import CaseStudySnapshot from '../../models/CaseStudySnapshot';
import CaseStudySyncRun from '../../models/CaseStudySyncRun';
import { ensureTraceId } from '../../utils/requestContext';
import { hashCanonical } from '../../utils/canonicalHash';
import { applyOverrides } from './caseStudySnapshotOverrides';
import { persistCaseStudySnapshot } from './caseStudySnapshotStore';
import { evaluateCaseStudyPublication } from './caseStudyPublicationService';
import { scoreCaseStudyReadiness } from './caseStudyReadinessService';
import type { CaseStudyReadinessReport } from './caseStudyReadinessService';
import {
  CaseStudyAdminError, loadCaseStudyRow, toSnapshotSummary,
} from './caseStudyAdminStore';
import type { CaseStudySnapshotSummary } from './caseStudyAdminStore';
import type { CaseStudyProvenance } from '../../types/caseStudyProvenance';
import type {
  CaseStudySnapshotContent, CaseStudyStatus, CaseStudySurfaceKey,
} from '../../types/caseStudy';
import { CASE_STUDY_SURFACE_KEYS } from '../../types/caseStudy';

/* ──────────────────────────────────────────────────────────── contracts ──── */

export interface ApplyOverrideResult {
  readonly outcome: 'unchanged' | 'created';
  readonly snapshotId: string;
  readonly version: number;
  readonly contentHash: string;
  /** The path, echoed back so the UI can confirm what it edited. */
  readonly path: string;
}

export interface ApproveSnapshotResult {
  readonly outcome: 'unchanged' | 'approved';
  readonly snapshot: CaseStudySnapshotSummary;
  /** Supersedes any previously approved version, so "the approved one" is one. */
  readonly supersededSnapshotIds: readonly string[];
  readonly caseStudyStatus: CaseStudyStatus;
}

export interface CaseStudySyncRunSummary {
  readonly id: string;
  readonly trigger: string;
  readonly status: string;
  readonly reposAttempted: number;
  readonly reposSucceeded: number;
  readonly reposFailed: number;
  readonly factsExtracted: number;
  readonly candidateMetrics: number;
  readonly snapshotId: string | null;
  readonly correlationId: string | null;
  readonly errorClass: string | null;
  readonly errorSummary: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly metadata: Record<string, unknown>;
}

export interface CaseStudySyncRunPage {
  readonly items: readonly CaseStudySyncRunSummary[];
  readonly limit: number;
  readonly offset: number;
}

/**
 * `CaseStudySurfacePreview` MOVED to `caseStudyAdminPreview.ts` — the module
 * that already owns the preview concept — when adding its `surface` field took
 * this file past CLAUDE.md's 500-line hard ceiling. Re-exported so every
 * existing importer keeps its import path.
 */
export type { CaseStudySurfacePreview };

export const MAX_SYNC_RUN_LIMIT = 100;
export const DEFAULT_SYNC_RUN_LIMIT = 20;

/* ─────────────────────────────────────────────────────────────── logging ──── */

interface ReviewLogContext {
  case_study_id: string;
  snapshot_id?: string;
  version?: number;
  surface_key?: string;
  /** The dotted PATH, never the value — a value can quote a client. */
  path?: string;
  allowed?: boolean;
  blocker_codes?: readonly string[];
  run_count?: number;
  error_class?: string;
}

/** Structured, per `services/artifacts/artifactRepoSync.ts:92-102`. */
function log(event: string, outcome: string, correlationId: string, ctx: ReviewLogContext): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'case-study-admin-review',
    event,
    correlation_id: correlationId,
    outcome,
    context: ctx,
  }));
}

/* ─────────────────────────────────────────────────────────────── schemas ──── */

const uuid = z.uuid();
const correlation = z.string().min(1).max(200).optional();
const actor = z.string().trim().min(1).max(255);

const overrideSchema = z.object({
  caseStudyId: uuid,
  /**
   * UNTRUSTED. `parseProvenancePath` is the real gate — it refuses
   * `__proto__`, `constructor` and `prototype` and accepts only identifiers and
   * `[digits]`. This length cap only stops an absurd path reaching it.
   */
  path: z.string().trim().min(1).max(300),
  value: z.unknown(),
  note: z.string().trim().min(1).max(500).optional(),
  actor,
  correlationId: correlation,
});

const approveSchema = z.object({
  caseStudyId: uuid, snapshotId: uuid, actor, correlationId: correlation,
});

const syncRunsSchema = z.object({
  caseStudyId: uuid,
  limit: z.number().int().min(1).max(MAX_SYNC_RUN_LIMIT).optional(),
  offset: z.number().int().min(0).optional(),
  correlationId: correlation,
});

const previewSchema = z.object({
  caseStudyId: uuid,
  surfaceKey: z.enum(CASE_STUDY_SURFACE_KEYS),
  snapshotId: uuid.optional(),
  correlationId: correlation,
});

/** Zod v4: `error.issues`. `.errors` was removed in v4 and reads as undefined. */
function validate<S extends z.ZodType>(schema: S, input: unknown, what: string): z.infer<S> {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  const detail = parsed.error.issues
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
  throw new CaseStudyAdminError('ValidationError', `Malformed ${what}: ${detail}`, {
    issue_count: parsed.error.issues.length,
  });
}

const iso = (v: Date | string | null | undefined): string | null =>
  (v ? new Date(v).toISOString() : null);

async function latestSnapshotRow(caseStudyId: string): Promise<CaseStudySnapshot | null> {
  return CaseStudySnapshot.findOne({
    where: { case_study_id: caseStudyId }, order: [['version', 'DESC']],
  });
}

function requireSnapshot(row: CaseStudySnapshot | null, caseStudyId: string): CaseStudySnapshot {
  if (row) return row;
  throw new CaseStudyAdminError('SnapshotNotFound',
    'This Case Study has no snapshot yet. Run a sync before reviewing it.',
    { case_study_id: caseStudyId });
}

/* ─────────────────────────────────────────────────────────── the operations ─ */

/**
 * Apply one human edit to the latest snapshot and record who made it (spec §34).
 *
 * The edit lands as a NEW snapshot version rather than a mutation of the one
 * under review, so the version a reviewer already approved is never rewritten
 * underneath them, and `case_study_snapshots` stays the append-only record the
 * publish gate pins against.
 *
 * The write is provenance tier `human_override`, which is index 0 of
 * `CASE_STUDY_PROVENANCE_PRECEDENCE`. That is what makes the next repo sync
 * carry the edit forward instead of overwriting it: `overridesFromSnapshot`
 * reads exactly these entries back out of the previous version.
 *
 * A path whose parent does not exist is REFUSED, not conjured — same rule as
 * `applyOverrides`, surfaced here as a 400 naming the path.
 */
export async function applyHumanOverride(input: unknown): Promise<ApplyOverrideResult> {
  const data = validate(overrideSchema, input, 'override request');
  const correlationId = ensureTraceId(data.correlationId);
  await loadCaseStudyRow(data.caseStudyId);

  const row = requireSnapshot(await latestSnapshotRow(data.caseStudyId), data.caseStudyId);
  const content = (row.content ?? {}) as unknown as CaseStudySnapshotContent;
  const recordedAt = new Date().toISOString();

  const application = applyOverrides(content, [{
    path: data.path, value: data.value, actor: data.actor, recordedAt,
    ...(data.note ? { note: data.note } : {}),
  }]);

  if (application.applied.length === 0) {
    log('case_study.override_applied', 'failure', correlationId, {
      case_study_id: data.caseStudyId, snapshot_id: row.id, path: data.path,
      error_class: 'ValidationError',
    });
    throw new CaseStudyAdminError('ValidationError',
      `The path "${data.path}" does not exist in this snapshot, so the edit was not applied. `
      + 'Edit a field the snapshot already carries.',
      { path: data.path, ignored: application.ignored });
  }

  const sourceCommitMap = (row.source_commit_map ?? {}) as Record<string, string>;
  const provenance: CaseStudyProvenance = {
    ...((row.provenance ?? {}) as CaseStudyProvenance),
    ...application.entries,
  };
  // The SAME hasher and the SAME envelope the builder uses
  // (`caseStudySnapshotBuilder.ts:260`), or an override would produce a hash the
  // next sync could never match and every sync would look changed forever.
  const contentHash = hashCanonical({ content: application.content, sourceCommitMap });

  const persisted = await persistCaseStudySnapshot({
    caseStudyId: data.caseStudyId,
    status: 'draft',
    correlationId,
    draft: {
      content: application.content,
      provenance,
      sourceCommitMap,
      contentHash,
      generatedAt: recordedAt,
      generatedBy: 'human_edit',
      appliedOverrides: application.applied,
      ignoredOverrides: application.ignored,
    },
  });

  log('case_study.override_applied', persisted.outcome === 'created' ? 'success' : 'unchanged',
    correlationId, {
      case_study_id: data.caseStudyId, snapshot_id: persisted.snapshotId,
      version: persisted.version, path: data.path,
    });

  return {
    outcome: persisted.outcome,
    snapshotId: persisted.snapshotId,
    version: persisted.version,
    contentHash: persisted.contentHash,
    path: data.path,
  };
}

/**
 * Approve one snapshot version — the human act the whole pipeline exists to
 * support (spec §17: sync creates a DRAFT; approval is separate and manual).
 *
 * Three things happen together, because any two of them without the third would
 * leave the record making a claim nobody signed: the version is marked
 * `approved` with its approver, every previously approved version is
 * `superseded` so "the approved snapshot" is unambiguous, and the
 * `case_studies` row moves to `approved` with the same approver — which is what
 * the publish gate's rule 1 reads.
 *
 * IDEMPOTENT. Approving an already-approved version writes nothing and reports
 * `unchanged`, so a retried click cannot re-stamp an approval date.
 */
export async function approveSnapshot(input: unknown): Promise<ApproveSnapshotResult> {
  const data = validate(approveSchema, input, 'snapshot approval');
  const correlationId = ensureTraceId(data.correlationId);
  const record = await loadCaseStudyRow(data.caseStudyId);

  const row = await CaseStudySnapshot.findOne({
    where: { id: data.snapshotId, case_study_id: data.caseStudyId },
  });
  if (!row) {
    log('case_study.snapshot_approved', 'failure', correlationId, {
      case_study_id: data.caseStudyId, snapshot_id: data.snapshotId,
      error_class: 'SnapshotNotFound',
    });
    throw new CaseStudyAdminError('SnapshotNotFound',
      'That snapshot does not belong to this Case Study.',
      { case_study_id: data.caseStudyId, snapshot_id: data.snapshotId });
  }

  if (row.status === 'approved') {
    log('case_study.snapshot_approved', 'unchanged', correlationId, {
      case_study_id: data.caseStudyId, snapshot_id: row.id, version: row.version,
    });
    return {
      outcome: 'unchanged',
      snapshot: toSnapshotSummary(row),
      supersededSnapshotIds: [],
      caseStudyStatus: record.status as CaseStudyStatus,
    };
  }

  const previouslyApproved = await CaseStudySnapshot.findAll({
    where: { case_study_id: data.caseStudyId, status: 'approved' },
  });
  const superseded: string[] = [];
  for (const prior of previouslyApproved ?? []) {
    if (prior.id === row.id) continue;
    await prior.update({ status: 'superseded' } as never);
    superseded.push(prior.id);
  }

  const approvedAt = new Date();
  await row.update({
    status: 'approved', approved_by: data.actor, approved_at: approvedAt,
  } as never);
  await record.update({
    status: 'approved', approved_by: data.actor, approved_at: approvedAt,
  } as never);

  log('case_study.snapshot_approved', 'success', correlationId, {
    case_study_id: data.caseStudyId, snapshot_id: row.id, version: row.version,
  });

  return {
    outcome: 'approved',
    snapshot: toSnapshotSummary(row),
    supersededSnapshotIds: superseded,
    caseStudyStatus: 'approved',
  };
}

/**
 * The sync history for one Case Study, newest first (spec §51 "inspect sync
 * warnings"). Append-only rows written by `caseStudySyncRunStore`; this reads
 * and never writes.
 */
export async function listSyncRuns(input: unknown): Promise<CaseStudySyncRunPage> {
  const data = validate(syncRunsSchema, input, 'sync run query');
  const correlationId = ensureTraceId(data.correlationId);
  const limit = data.limit ?? DEFAULT_SYNC_RUN_LIMIT;
  const offset = data.offset ?? 0;
  await loadCaseStudyRow(data.caseStudyId);

  const found = await CaseStudySyncRun.findAll({
    where: { case_study_id: data.caseStudyId },
    order: [['started_at', 'DESC']], limit, offset,
  });
  const items: CaseStudySyncRunSummary[] = (found ?? []).map((r) => ({
    id: r.id,
    trigger: r.trigger,
    status: r.status,
    reposAttempted: r.repos_attempted ?? 0,
    reposSucceeded: r.repos_succeeded ?? 0,
    reposFailed: r.repos_failed ?? 0,
    factsExtracted: r.facts_extracted ?? 0,
    candidateMetrics: r.candidate_metrics ?? 0,
    snapshotId: r.snapshot_id ?? null,
    correlationId: r.correlation_id ?? null,
    errorClass: r.error_class ?? null,
    errorSummary: r.error_summary ?? null,
    startedAt: iso(r.started_at),
    completedAt: iso(r.completed_at),
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
  }));

  log('case_study.sync_runs_listed', 'success', correlationId, {
    case_study_id: data.caseStudyId, run_count: items.length,
  });
  return { items, limit, offset };
}

/**
 * What publishing this Case Study to this surface would produce, and every
 * reason it would be refused — without writing anything (spec §34).
 *
 * THE DECISION IS THE REAL ONE. `evaluateCaseStudyPublication` is the same
 * function `publishCaseStudy` calls, against live data, so this cannot drift
 * into telling an admin a record is ready when the gate would refuse it. Its
 * `blockers` are returned verbatim: each names a field and its value, which is
 * what makes them actionable.
 *
 * TWO VIEWS, DELIBERATELY. `snapshot` carries the raw stored content — the
 * approved version when one exists, the latest draft otherwise, with `source`
 * saying which, because an admin reviewing a candidate needs to see the draft
 * they are about to approve. `projection` carries what a VISITOR would see,
 * rendered by `projectPreviewDetail` → `projectPublicDetail`: the same function
 * the public API calls, never a second renderer. Spec §34's "same public
 * renderer/projection contract as production" is therefore satisfied by
 * construction rather than by two code paths that merely look alike.
 *
 * The difference between the two views is the point of the screen. The
 * projection is where private repositories are dropped and pending metrics
 * become structurally unrepresentable, so an admin comparing them can see
 * exactly what will and will not reach the public — and cannot approve
 * something on the strength of content the public will never be shown.
 *
 * `caseStudyAdminPreview.test.ts` pins this by deep-equality against
 * `projectPublicDetail` on the same content, so a future divergence fails
 * rather than drifting.
 */
export async function previewSurfaceProjection(input: unknown): Promise<CaseStudySurfacePreview> {
  const data = validate(previewSchema, input, 'preview request');
  const correlationId = ensureTraceId(data.correlationId);
  const record = await loadCaseStudyRow(data.caseStudyId);

  const approved = data.snapshotId
    ? await CaseStudySnapshot.findOne({
      where: { id: data.snapshotId, case_study_id: data.caseStudyId },
    })
    : await CaseStudySnapshot.findOne({
      where: { case_study_id: data.caseStudyId, status: 'approved' },
      order: [['version', 'DESC']],
    });
  const shown = approved ?? await latestSnapshotRow(data.caseStudyId);
  const source: CaseStudySurfacePreview['source'] = approved
    ? 'approved_snapshot' : (shown ? 'latest_draft' : 'none');

  const decision = await evaluateCaseStudyPublication({
    caseStudyId: data.caseStudyId,
    surfaceKey: data.surfaceKey,
    ...(data.snapshotId ? { snapshotId: data.snapshotId } : {}),
    // `evaluateCaseStudyPublication` writes nothing and never reads `actor`
    // beyond validating it; a preview has no publisher.
    actor: 'preview',
    correlationId,
  });

  let readiness: CaseStudyReadinessReport | null = null;
  if (shown) {
    try {
      readiness = scoreCaseStudyReadiness({
        content: (shown.content ?? {}) as unknown as CaseStudySnapshotContent,
        status: record.status as CaseStudyStatus,
        snapshotStatus: shown.status as 'draft' | 'approved' | 'superseded',
      });
    } catch {
      readiness = null; // advisory: a scoring failure must not break a preview
    }
  }

  log('case_study.surface_previewed', 'success', correlationId, {
    case_study_id: data.caseStudyId, surface_key: data.surfaceKey,
    snapshot_id: shown?.id, allowed: decision.allowed, blocker_codes: decision.codes,
  });

  return {
    surfaceKey: data.surfaceKey,
    surface: surfaceView(getCaseStudySurfaceProfile(data.surfaceKey)),
    snapshot: shown ? toSnapshotSummary(shown) : null,
    source,
    decision,
    readiness,
    projection: shown ? projectPreviewDetail(record.slug, shown, data.surfaceKey) : null,
  };
}

