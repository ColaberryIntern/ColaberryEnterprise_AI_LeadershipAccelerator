/**
 * caseStudySnapshotStore — write a built snapshot, or discover that there is
 * nothing to write.
 *
 * THIS IS WHERE THE HASH EARNS ITS KEEP. `caseStudySnapshotBuilder` produces a
 * content hash that is stable under re-runs; this module turns that into the
 * property spec §30 actually asks for — "sync outcome unchanged". If the latest
 * snapshot for a Case Study already carries the incoming hash, NO ROW IS
 * WRITTEN and the caller is told `unchanged`. Otherwise the content genuinely
 * differs and a new immutable version is appended, exactly as `build_plans`
 * does: a regeneration is a new version, never an overwrite (spec §17 — "do not
 * silently mutate live content"; a published snapshot stays pinned while a new
 * draft waits for review).
 *
 * WHY IT COMPARES AGAINST THE LATEST, NOT AGAINST ANY HISTORICAL VERSION. If a
 * repository is reverted so its content matches version 3 while version 7 is
 * current, that IS a change and deserves a new version — the reviewer needs to
 * see a diff against what is live, not be told "nothing happened" because the
 * bytes existed once before. `idx_cs_snapshots_case_hash` supports either query;
 * this is a semantic choice, not a performance one.
 *
 * FAILURE-FIRST. (1) On failure nothing partial is written — a snapshot is a
 * single INSERT, so there is no half state to unwind. (2) Retry: the version
 * race only, capped at three attempts, never unbounded. (3) Recovery: the
 * caller re-runs the sync; because the operation is idempotent, a re-run of an
 * already-written snapshot returns `unchanged`. (4) Handled: the concurrent
 * `(case_study_id, version)` unique-index race, an empty history, and a
 * malformed hash. NOT handled: the database being unavailable — that propagates
 * to the route, where connection failures are already classified.
 */
import { z } from 'zod';
import CaseStudySnapshot from '../../models/CaseStudySnapshot';
import { ensureTraceId } from '../../utils/requestContext';
import type { CaseStudySnapshotDraft } from './caseStudySnapshotInput';
import type { CaseStudySnapshotStatus } from '../../types/caseStudy';

/** The version race is bounded. CLAUDE.md: infinite retry loops are prohibited. */
export const MAX_VERSION_ATTEMPTS = 3;

export interface PersistSnapshotInput {
  readonly caseStudyId: string;
  readonly draft: CaseStudySnapshotDraft;
  /** Sync creates a DRAFT (spec §17). Approval is a separate, human step. */
  readonly status?: CaseStudySnapshotStatus;
  readonly correlationId?: string;
}

export interface PersistedSnapshot {
  /** `unchanged` is the idempotent outcome: identical content, no new row. */
  readonly outcome: 'unchanged' | 'created';
  readonly snapshotId: string;
  readonly version: number;
  readonly contentHash: string;
  readonly status: CaseStudySnapshotStatus;
  /** True only when the unique index, not the hash check, prevented the write. */
  readonly race: boolean;
}

const inputSchema = z.object({
  caseStudyId: z.string().trim().min(1).max(64),
  status: z.enum(['draft', 'approved', 'superseded']).optional(),
  correlationId: z.string().min(1).max(200).optional(),
  draft: z.object({
    contentHash: z.string().regex(/^[0-9a-f]{64}$/, 'content_hash must be 64 lowercase hex characters'),
    generatedAt: z.string().min(1).max(40),
    generatedBy: z.enum(['repo_sync', 'platform_sync', 'human_edit']),
  }).loose(),
});

interface StoreLogContext {
  case_study_id: string;
  content_hash: string;
  version?: number;
  snapshot_id?: string;
  attempt?: number;
  race?: boolean;
  error_class?: string;
}

/** Structured, per `services/artifacts/artifactRepoSync.ts:92-102`. */
function log(event: string, outcome: string, correlationId: string, ctx: StoreLogContext): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'case-study-snapshot',
    event,
    correlation_id: correlationId,
    outcome,
    context: ctx,
  }));
}

/**
 * Sequelize types a JSONB column as `Record<string, any>`, and TypeScript will
 * not widen an interface to an index signature. The cast is confined to this
 * boundary; everything above it is contract-typed (`CaseStudySnapshotContent`,
 * `CaseStudyProvenance`), which is the point of having the contracts at all.
 */
function asJsonb(value: unknown): Record<string, any> {
  return value as Record<string, any>;
}

function isUniqueViolation(err: unknown): boolean {
  return (err as { name?: string })?.name === 'SequelizeUniqueConstraintError';
}

async function latestSnapshot(caseStudyId: string) {
  return CaseStudySnapshot.findOne({
    where: { case_study_id: caseStudyId },
    order: [['version', 'DESC']],
  });
}

/**
 * Persist the draft if — and only if — its content differs from the latest
 * version. Returns which of the two happened, so the sync run can record
 * `unchanged` (spec §7.10) instead of inventing activity.
 */
export async function persistCaseStudySnapshot(input: PersistSnapshotInput): Promise<PersistedSnapshot> {
  const correlationId = ensureTraceId(input.correlationId);
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new TypeError(`Invalid persist input: ${issue.path.join('.') || '(root)'} ${issue.message}`);
  }

  const { caseStudyId, draft } = input;
  const status: CaseStudySnapshotStatus = input.status ?? 'draft';

  for (let attempt = 1; attempt <= MAX_VERSION_ATTEMPTS; attempt += 1) {
    const latest = await latestSnapshot(caseStudyId);

    // THE IDEMPOTENCY GATE. Identical normalized content ⇒ identical hash ⇒ no
    // new row, however many times the sync runs.
    if (latest && latest.content_hash === draft.contentHash) {
      log('case_study.snapshot_persisted', 'unchanged', correlationId, {
        case_study_id: caseStudyId, content_hash: draft.contentHash,
        version: latest.version, snapshot_id: latest.id, race: attempt > 1,
      });
      return {
        outcome: 'unchanged',
        snapshotId: latest.id,
        version: latest.version,
        contentHash: latest.content_hash,
        status: latest.status as CaseStudySnapshotStatus,
        race: attempt > 1,
      };
    }

    const version = (latest?.version ?? 0) + 1;
    try {
      const row = await CaseStudySnapshot.create({
        case_study_id: caseStudyId,
        version,
        status,
        source_commit_map: asJsonb(draft.sourceCommitMap),
        content: asJsonb(draft.content),
        provenance: asJsonb(draft.provenance),
        generated_at: new Date(draft.generatedAt),
        generated_by: draft.generatedBy,
        content_hash: draft.contentHash,
      });
      log('case_study.snapshot_persisted', 'success', correlationId, {
        case_study_id: caseStudyId, content_hash: draft.contentHash,
        version, snapshot_id: row.id, attempt, race: attempt > 1,
      });
      return {
        outcome: 'created',
        snapshotId: row.id,
        version,
        contentHash: draft.contentHash,
        status,
        race: attempt > 1,
      };
    } catch (err) {
      // Another sync claimed this version number between the read and the
      // insert. Re-read: if it wrote the same content the answer is
      // `unchanged`, and if not we take the next number. Bounded, so a
      // permanently failing constraint surfaces rather than spinning.
      if (!isUniqueViolation(err) || attempt === MAX_VERSION_ATTEMPTS) {
        log('case_study.snapshot_persisted', 'failure', correlationId, {
          case_study_id: caseStudyId, content_hash: draft.contentHash, version, attempt,
          error_class: isUniqueViolation(err) ? 'VersionRaceExhausted' : 'DatabaseError',
        });
        throw err;
      }
    }
  }

  /* istanbul ignore next — the loop either returns or throws on its last attempt. */
  throw new Error('unreachable: snapshot persistence loop exhausted');
}
