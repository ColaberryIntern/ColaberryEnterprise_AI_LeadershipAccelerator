import { randomUUID } from 'crypto';
import StoryTruthEnrichmentRecord, { type EnrichmentOutcome } from '../../models/StoryTruthEnrichmentRecord';
import { mergeEnrichment, type MergeCounts, type MergeRefusal } from './enrichmentMerge';
import { loadIntakeTruthAtRevision, saveEnrichedTruth } from './intakeTruthStore';
import { enrichmentIdempotencyKey, type StoryTruthEnrichment } from './storyEnrichmentContract';

/**
 * storyEnrichmentService - apply one story's enrichment event to the truth,
 * exactly once. I/O.
 *
 * ## Order of operations, and why
 *
 *   1. ledger lookup      already applied? then this is a replay: no_op, no
 *                         merge, no revision bump. GitHub retries deliveries
 *                         and agents re-push files; both must cost nothing.
 *   2. read truth         at its current revision
 *   3. merge              pure; see enrichmentMerge for what may change
 *   4. save (CAS)         only if the merge changed something, and only if
 *                         the revision is still the one we read. A loser
 *                         re-reads and re-merges once; the merge is
 *                         idempotent so the second pass is cheap and correct
 *   5. ledger insert      the receipt. Unique on the idempotency key, so a
 *                         race between two deliveries writes one row; the
 *                         other sees the unique violation and reports a
 *                         replay
 *
 * The merge runs before the ledger row exists, so a crash between 4 and 5
 * leaves the truth updated and the ledger silent, and a retry merges again:
 * unchanged, because the truth already holds it, then writes the receipt.
 * The other order (ledger first) would leave a receipt for a merge that never
 * happened, which is worse.
 *
 * ## What it never does
 *
 * Throw. A story that wrote a bad file is a fact about that story, logged
 * with a class, and the webhook that delivered it still returns 200.
 */

export type ApplyOutcome = EnrichmentOutcome | 'replay';

export interface ApplyResult {
  readonly outcome: ApplyOutcome;
  readonly storyId: string;
  readonly revision: number | null;
  readonly counts: MergeCounts;
  readonly refused: MergeRefusal[];
}

const ZERO: MergeCounts = { added: 0, strengthened: 0, questions: 0, unchanged: 0, refused: 0 };

function log(event: string, outcome: 'success' | 'failure' | 'partial', ctx: Record<string, unknown>): void {
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), level: outcome === 'failure' ? 'error' : 'info', service: 'backend', event, outcome, context: ctx }));
}

export async function applyStoryEnrichment(
  projectId: string,
  event: StoryTruthEnrichment,
  opts: { correlationId?: string } = {},
): Promise<ApplyResult> {
  const correlationId = opts.correlationId ?? randomUUID();
  const key = enrichmentIdempotencyKey(event);
  const base = { project_id: projectId, story_id: event.storyId, correlation_id: correlationId, key: key.slice(0, 12) };

  if (event.projectId !== projectId) {
    // A file naming a different project is not this project's evidence,
    // whichever repo it arrived from.
    log('sbp_enrichment_wrong_project', 'partial', { ...base, claimed: event.projectId });
    return { outcome: 'refused', storyId: event.storyId, revision: null, counts: ZERO, refused: [{ dimension: '*', value: '*', reason: 'projectId does not match the repo\'s project' }] };
  }

  const seen = await StoryTruthEnrichmentRecord.findOne({ where: { idempotency_key: key } });
  if (seen) {
    log('sbp_enrichment_replay', 'success', { ...base, first_seen: seen.created_at });
    return { outcome: 'replay', storyId: event.storyId, revision: seen.merged_revision, counts: ZERO, refused: [] };
  }

  // Merge, then save under compare-and-set. One retry: the merge is pure and
  // idempotent, so re-running it against the newer truth is the correct
  // answer, not a workaround.
  let revision: number | null = null;
  let outcome: EnrichmentOutcome = 'no_op';
  let counts: MergeCounts = ZERO;
  let refused: MergeRefusal[] = [];
  let baseRevision = 0;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const stored = await loadIntakeTruthAtRevision(projectId);
    const current = stored?.items ?? [];
    baseRevision = stored?.revision ?? 0;

    const merged = mergeEnrichment(current, event);
    counts = merged.counts;
    refused = merged.refused;

    if (!merged.changed) {
      revision = stored?.revision ?? null;
      outcome = counts.refused > 0 && counts.added + counts.strengthened + counts.questions + counts.unchanged === 0 ? 'refused' : 'no_op';
      break;
    }

    const saved = await saveEnrichedTruth(projectId, merged.items, stored ? stored.revision : null);
    if (saved !== null) {
      revision = saved;
      outcome = 'merged';
      break;
    }
    outcome = 'stale';
  }

  try {
    await StoryTruthEnrichmentRecord.create({
      project_id: projectId,
      story_id: event.storyId,
      idempotency_key: key,
      source_commit_sha: event.sourceCommitSha ?? null,
      base_revision: baseRevision,
      merged_revision: outcome === 'merged' ? revision : null,
      outcome,
      counts: { ...counts },
      refused,
      event: event as unknown as Record<string, unknown>,
      correlation_id: correlationId,
    });
  } catch (err: any) {
    const unique = err?.name === 'SequelizeUniqueConstraintError';
    if (unique) {
      // The other delivery got here first. Our merge, if it ran, changed
      // nothing it had not already changed. Report the replay honestly.
      log('sbp_enrichment_replay', 'success', { ...base, raced: true });
      return { outcome: 'replay', storyId: event.storyId, revision, counts, refused };
    }
    log('sbp_enrichment_ledger_failed', 'failure', { ...base, error_class: err?.name || 'DatabaseError', message: String(err?.message || '').slice(0, 200) });
  }

  log('sbp_enrichment_applied', outcome === 'stale' ? 'partial' : 'success', {
    ...base, outcome, base_revision: baseRevision, revision, ...counts,
  });
  return { outcome, storyId: event.storyId, revision, counts, refused };
}
