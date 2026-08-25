/**
 * caseStudySyncRunStore — everything about a sync RUN: its contracts, its
 * append-only audit row, its structured logger, and the one-run-at-a-time lock
 * (spec §7.10, §38).
 *
 * WHY IT IS ITS OWN FILE. `caseStudySyncService.ts` is the conductor; this is
 * what a run IS and where it is recorded. Splitting them keeps both inside
 * CLAUDE.md's line ceiling and follows the precedent already set in this
 * directory (`caseStudyReadinessService` + `caseStudyReadinessRubric`,
 * `caseStudySnapshotBuilder` + `…Sections` + `…Input`). The dependency runs one
 * way — the service imports this, never the reverse — so no cycle is possible.
 * Nothing here imports the analyzer, the builder or the GitHub client, so a
 * caller may import the sync's CONTRACTS without pulling in its machinery.
 *
 * ── APPEND-ONLY, AND WHAT THAT MEANS EXACTLY ────────────────────────────────
 *
 * One row per attempt, forever. No sync ever deletes a run, and no sync ever
 * touches a run belonging to a different attempt. A row is written the moment
 * the sync starts (status `running`) and moved ONCE to a terminal status —
 * `success`, `partial`, `failed` or `unchanged` — by a single UPDATE guarded on
 * `WHERE id = ? AND status = 'running'`. That guard is the whole reason the
 * lifecycle is honest: a terminal row cannot be rewritten, by this process or
 * any other, because the WHERE clause no longer matches it.
 *
 * The alternative — writing the row only at the end — was rejected. The DDL
 * declares `status running` and a nullable `completed_at`, and spec §38 names
 * both `case_study.sync_started` and `case_study.sync_completed`; a sync whose
 * process dies mid-run would leave no evidence at all under the end-only shape,
 * which is precisely the case an audit trail exists for.
 *
 * ── FAILURE-FIRST (root CLAUDE.md) ──────────────────────────────────────────
 * 1. On failure: `startSyncRun` throwing means no row exists and the sync never
 *    began; `finalizeSyncRun` throwing leaves the row at `running`, which reads
 *    correctly as "started, never completed" rather than as a false success.
 * 2. Retry: NONE here. A second retry layer over Sequelize would double every
 *    write attempt during an outage and buy nothing the caller cannot do.
 * 3. Recovery: re-run the sync. Runs are independent rows, so a re-run appends
 *    a new one and the abandoned `running` row stays as the record that it was
 *    abandoned.
 * 4. Handled: a finalize that finds the row already terminal (no-op, reported),
 *    over-long error text (truncated), unbounded metadata (capped). NOT handled:
 *    the database being unavailable — that propagates, as everywhere else in
 *    this directory.
 *
 * ── PII ─────────────────────────────────────────────────────────────────────
 * `syncLog` takes a FIXED context shape. There is no spread of an arbitrary
 * object, so an enrollment id, a student email, a card id, a token or a private
 * repository's name cannot reach stdout through this function even by accident.
 * Repository identity arrives already through `repoLogIdentity()` (see the
 * service), which fails closed to an opaque handle on `unknown` visibility.
 */
import CaseStudySyncRun from '../../models/CaseStudySyncRun';
import type { CaseStudySyncStatus, CaseStudySyncTrigger } from '../../types/caseStudy';

/* ─────────────────────────────────────────────────────────────── errors ──── */

export type CaseStudySyncErrorClass =
  /** The call itself was malformed — a bad uuid, an unknown trigger. */
  | 'CaseStudySyncValidationError'
  /** No `case_studies` row with that id, so there is nothing to audit against. */
  | 'CaseStudyNotFound';

const HTTP_STATUS: Record<CaseStudySyncErrorClass, number> = {
  CaseStudySyncValidationError: 400,
  CaseStudyNotFound: 404,
};

export class CaseStudySyncError extends Error {
  public readonly error_class: CaseStudySyncErrorClass;
  public readonly http_status: number;
  public readonly details: Record<string, unknown>;

  constructor(
    error_class: CaseStudySyncErrorClass,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'CaseStudySyncError';
    this.error_class = error_class;
    this.http_status = HTTP_STATUS[error_class];
    this.details = details;
  }
}

export function isCaseStudySyncError(err: unknown): err is CaseStudySyncError {
  return err instanceof CaseStudySyncError;
}

/* ──────────────────────────────────────────────────────────── contracts ──── */

/** Spec §7.10's five counters, named the way the service thinks about them. */
export interface CaseStudySyncCounts {
  readonly reposAttempted: number;
  readonly reposSucceeded: number;
  readonly reposFailed: number;
  readonly factsExtracted: number;
  readonly candidateMetrics: number;
}

export const ZERO_SYNC_COUNTS: CaseStudySyncCounts = Object.freeze({
  reposAttempted: 0,
  reposSucceeded: 0,
  reposFailed: 0,
  factsExtracted: 0,
  candidateMetrics: 0,
});

/**
 * One repository that could not be analysed. `repositoryId` is the
 * `case_study_repositories` row, which is how the admin UI identifies WHICH
 * repository failed without this row having to name a private one; `repoRef` is
 * the same opaque handle the analyzer's logs carry, so a symptom in stdout can
 * be matched to this row by eye.
 */
export interface SyncRepoError {
  readonly repositoryId: string | null;
  readonly repoRef: string;
  readonly errorClass: string;
  readonly message: string;
}

/** Bounds, so one pathological collection cannot inflate a JSONB column. */
export const MAX_RECORDED_REPO_ERRORS = 40;
export const MAX_ERROR_SUMMARY_CHARS = 500;

export type SyncLogOutcome = 'running' | 'success' | 'partial' | 'unchanged' | 'failure';

/**
 * The ONLY fields a sync log line may carry. Spec §38's list, minus everything
 * that identifies a person. There is deliberately no index signature.
 */
export interface SyncLogContext {
  case_study_id: string;
  slug?: string;
  sync_run_id?: string | null;
  snapshot_id?: string | null;
  trigger?: CaseStudySyncTrigger;
  status?: CaseStudySyncStatus;
  repos_attempted?: number;
  repos_succeeded?: number;
  repos_failed?: number;
  facts_extracted?: number;
  candidate_metrics?: number;
  content_hash?: string;
  snapshot_outcome?: string;
  snapshot_version?: number;
  /** Opaque handles only — see `repoLogIdentity()`. Never an owner/name pair. */
  repo_refs?: string[];
  unknown_provenance_fields?: number;
  readiness_score?: number;
  duration_ms?: number;
  error_class?: string;
}

/** A repository that was read but not cleanly — spec §29's degraded case. */
export interface SyncRepoIssue {
  readonly repoRef: string;
  readonly errorClass: string;
  readonly path?: string;
}

export type SyncSnapshotOutcome = 'created' | 'unchanged' | 'skipped';

export interface CaseStudySyncResult {
  readonly syncRunId: string;
  readonly caseStudyId: string;
  readonly status: Exclude<CaseStudySyncStatus, 'running'>;
  readonly trigger: CaseStudySyncTrigger;
  readonly correlationId: string;
  readonly counts: CaseStudySyncCounts;
  readonly snapshotId: string | null;
  readonly snapshotVersion: number | null;
  /** `skipped` means no snapshot was attempted — see the collapsed-read rule. */
  readonly snapshotOutcome: SyncSnapshotOutcome;
  readonly contentHash: string | null;
  readonly repoErrors: readonly SyncRepoError[];
  readonly repoIssues: readonly SyncRepoIssue[];
  readonly errorClass: string | null;
  readonly errorSummary: string | null;
  /** ADVISORY. Never a publish decision — see `caseStudyReadinessService`. */
  readonly readiness: { readonly score: number; readonly band: string } | null;
  readonly unknownProvenanceFields: readonly string[];
  readonly startedAt: string;
  readonly completedAt: string;
}

export interface SyncCaseStudyInput {
  caseStudyId: string;
  trigger?: CaseStudySyncTrigger;
  correlationId?: string;
  /** Injected in tests. Production omits it and the client uses global fetch. */
  fetchImpl?: typeof fetch;
  /** Injected in tests. Only ever produces values OUTSIDE the hashed envelope. */
  now?: () => Date;
  /**
   * `owner/name` (lowercase) ⇒ raw `case-study.json` bytes, when the caller has
   * them. `analyzeRepository` fetches the manifest to derive facts but does not
   * return its body, so today only a caller holding the bytes can have one
   * parsed. The reader bounds and validates every byte it is handed.
   */
  manifestContents?: Readonly<Record<string, string>>;
}

/** `failed` > `partial` > `unchanged` > `success`. The one place it is decided. */
export function classifySyncStatus(
  collapsed: boolean, degraded: boolean, snapshotOutcome: SyncSnapshotOutcome,
): Exclude<CaseStudySyncStatus, 'running'> {
  if (collapsed) return 'failed';
  if (degraded) return 'partial';
  return snapshotOutcome === 'unchanged' ? 'unchanged' : 'success';
}

export function errorClassOf(err: unknown): string {
  const tagged = err as { error_class?: string; name?: string };
  return tagged?.error_class ?? tagged?.name ?? 'Error';
}

/** Log-safe: never the message body of an upstream API, never a token. */
export function messageOf(err: unknown): string {
  const message = (err as { message?: unknown })?.message;
  return typeof message === 'string' && message.length ? message : errorClassOf(err);
}

export const repoKey = (owner: string, name: string): string =>
  `${owner.toLowerCase()}/${name.toLowerCase()}`;

/* ─────────────────────────────────────────────────── single-process lock ──── */

/**
 * Serialise syncs of the SAME record inside this process, so a double-clicked
 * admin button cannot run two builds against the same "latest snapshot" read.
 * The second caller waits, then observes the first caller's snapshot and returns
 * `unchanged` — one snapshot row, two audit rows, which is what the ledger
 * should say happened.
 *
 * A guard, not THE guarantee. Across processes the authority is the database's
 * `cs_snapshots_unique_case_version` index, which `caseStudySnapshotStore`
 * already handles by re-reading and returning `unchanged`.
 */
const chains = new Map<string, Promise<unknown>>();

export async function withCaseStudySyncLock<T>(caseStudyId: string, fn: () => Promise<T>): Promise<T> {
  const prior = chains.get(caseStudyId) ?? Promise.resolve();
  // `.then(fn, fn)`: a prior sync that rejected must not block the next one.
  const run = prior.then(fn, fn);
  const settled = run.then(() => undefined, () => undefined);
  chains.set(caseStudyId, settled);
  try {
    return await run;
  } finally {
    if (chains.get(caseStudyId) === settled) chains.delete(caseStudyId);
  }
}

/* ────────────────────────────────────────────────────────────── logging ──── */

/** Structured, per `services/artifacts/artifactRepoSync.ts:92-102`. */
export function syncLog(
  event: string,
  outcome: SyncLogOutcome,
  correlationId: string,
  ctx: SyncLogContext,
): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'case-study-sync',
    event,
    correlation_id: correlationId,
    outcome,
    context: ctx,
  }));
}

/* ───────────────────────────────────────────────────────────── internals ──── */

/** Sequelize instance or a plain row — both are acceptable. */
function plainId(row: unknown): string {
  const candidate = row as { get?: (o: { plain: true }) => { id?: string }; id?: string };
  if (typeof candidate?.get === 'function') return String(candidate.get({ plain: true })?.id ?? '');
  return String(candidate?.id ?? '');
}

/** Sequelize types JSONB as `Record<string, any>`; the cast is confined here. */
function asJsonb(value: unknown): Record<string, any> {
  return value as Record<string, any>;
}

export function truncateErrorSummary(text: string | null | undefined): string | null {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  return trimmed.length > MAX_ERROR_SUMMARY_CHARS
    ? `${trimmed.slice(0, MAX_ERROR_SUMMARY_CHARS - 1)}…`
    : trimmed;
}

/* ───────────────────────────────────────────────────────── public surface ──── */

export interface StartSyncRunInput {
  readonly caseStudyId: string;
  readonly trigger: CaseStudySyncTrigger;
  readonly correlationId: string;
  readonly startedAt: Date;
}

/**
 * Open the audit row. Status `running`, `completed_at` null — the state that
 * says "this attempt began and has not reported back".
 */
export async function startSyncRun(input: StartSyncRunInput): Promise<string> {
  const row = await CaseStudySyncRun.create({
    case_study_id: input.caseStudyId,
    trigger: input.trigger,
    status: 'running',
    correlation_id: input.correlationId,
    started_at: input.startedAt,
    completed_at: null,
    metadata: {},
  });
  return plainId(row);
}

export interface FinalizeSyncRunInput {
  readonly syncRunId: string;
  readonly status: Exclude<CaseStudySyncStatus, 'running'>;
  readonly counts: CaseStudySyncCounts;
  readonly snapshotId?: string | null;
  readonly errorClass?: string | null;
  readonly errorSummary?: string | null;
  readonly completedAt: Date;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Move the row from `running` to its terminal state, exactly once.
 *
 * The `status: 'running'` predicate is the append-only guarantee in executable
 * form: a row that already reported cannot be rewritten, so a duplicated
 * finalize (a retry, a double-await, a second process) updates zero rows and is
 * reported as such rather than silently rewriting history.
 */
export async function finalizeSyncRun(input: FinalizeSyncRunInput): Promise<{ updated: boolean }> {
  const [affected] = await CaseStudySyncRun.update(
    {
      status: input.status,
      repos_attempted: input.counts.reposAttempted,
      repos_succeeded: input.counts.reposSucceeded,
      repos_failed: input.counts.reposFailed,
      facts_extracted: input.counts.factsExtracted,
      candidate_metrics: input.counts.candidateMetrics,
      snapshot_id: input.snapshotId ?? null,
      error_class: input.errorClass ?? null,
      error_summary: truncateErrorSummary(input.errorSummary),
      completed_at: input.completedAt,
      metadata: asJsonb(input.metadata ?? {}),
    },
    { where: { id: input.syncRunId, status: 'running' } },
  );
  return { updated: Number(affected) > 0 };
}
