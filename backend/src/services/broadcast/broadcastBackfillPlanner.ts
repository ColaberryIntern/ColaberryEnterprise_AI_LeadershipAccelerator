/**
 * broadcastBackfillPlanner — decides what a backfill WOULD do, without doing any of it.
 *
 * PURE. Separating the decision from the write is the whole design: a backfill that can
 * only be judged by running it is a backfill nobody will dare run on production. This
 * module turns the run into a reviewable artifact first.
 *
 * FOUR SAFETY RULES, each of which exists because the obvious implementation gets it wrong.
 *
 * 1. IDENTITY IS (source_type, source_id). NEVER THE TITLE.
 *    Request P1-06 says to "quarantine ambiguous links instead of guessing by title". This
 *    module goes further and never consults the title at all, so title-guessing is not a
 *    discipline that could lapse — it is absent. Two events called "Office Hours" three
 *    weeks apart are simply two different source ids.
 *
 * 2. A ROW WHOSE INSTANT COULD NOT BE DERIVED IS QUARANTINED, NOT GUESSED.
 *    live_sessions stores wall-clock TEXT and convertTo24h falls back to '10:00' for
 *    anything unparseable. That fallback is fine for scheduling math, which needs *some*
 *    instant, and actively wrong for a backfill, which would mint a permanent occurrence at
 *    a fabricated time. deriveStartInstant reports `derived:false` precisely so this module
 *    can refuse.
 *
 * 3. A BACKFILLED OCCURRENCE IS BORN PRIVATE AND UNPUBLISHED.
 *    Request P2-07: "No broad automatic publication of old private recordings." A backfill
 *    that defaulted to `free` + `replay_ready` would retroactively publish years of private
 *    cohort sessions to everyone, in one command, with no review. So the planner emits
 *    access_mode 'private' and editorial_state 'ended' — present and findable by staff,
 *    publishable only by a deliberate act.
 *
 * 4. EVERY PLANNED ROW CARRIES THE BATCH ID.
 *    Reversal is `DELETE ... WHERE batch_id = ?`. Without it, undoing a bad backfill means
 *    reconstructing which rows it touched from timestamps, which is how a cleanup deletes
 *    something it did not create.
 */
import { deriveStartInstant, occurrenceKeyFor, type SourceDescriptor, type BroadcastSourceType } from './broadcastIdentity';

export type BackfillAction = 'link' | 'quarantine' | 'skip';

export interface BackfillCandidate extends SourceDescriptor {
  /** Only ever used for the human-readable plan. NEVER for matching. */
  title?: string | null;
  /** Set when this source already maps to an occurrence — the convergence signal. */
  existingOccurrenceId?: string | null;
}

export interface BackfillDecision {
  sourceType: BroadcastSourceType;
  sourceId: string;
  action: BackfillAction;
  reason:
    | 'already_linked' | 'ready_to_link'
    | 'undetermined_start' | 'unknown_source_type';
  occurrenceKey?: string;
  startsAt?: Date | null;
  /** What the new occurrence would be created as. Private and unpublished, always. */
  proposed?: { access_mode: 'private'; editorial_state: 'ended' };
}

export interface BackfillPlan {
  batchId: string;
  decisions: BackfillDecision[];
  counts: Record<BackfillAction, number>;
}

const KNOWN_SOURCES: ReadonlySet<string> = new Set<BroadcastSourceType>([
  'live_session', 'open_house_event', 'community_event', 'room_booking', 'ccpp_event',
]);

/**
 * Build the plan. Deterministic: the same candidates and batch id always produce the same
 * plan, which is what makes a dry run meaningful as a review artifact.
 */
export function planBackfill(candidates: ReadonlyArray<BackfillCandidate>, batchId: string): BackfillPlan {
  const decisions: BackfillDecision[] = [];
  const seenKeys = new Map<string, string>(); // occurrenceKey -> the sourceId that claimed it

  for (const c of candidates) {
    const base = { sourceType: c.sourceType, sourceId: c.sourceId };

    if (!KNOWN_SOURCES.has(c.sourceType)) {
      decisions.push({ ...base, action: 'quarantine', reason: 'unknown_source_type' });
      continue;
    }

    // Convergence: a source already mapped is left alone, so re-running is a no-op rather
    // than a second occurrence. This is what makes the operation safe to repeat.
    if (c.existingOccurrenceId) {
      decisions.push({ ...base, action: 'skip', reason: 'already_linked' });
      continue;
    }

    const { startsAt, derived } = deriveStartInstant(c);
    if (!derived || !startsAt) {
      // Rule 2. A fabricated instant would become this occurrence's permanent identity.
      decisions.push({ ...base, action: 'quarantine', reason: 'undetermined_start' });
      continue;
    }

    const key = occurrenceKeyFor(c.sourceType, c.sourceId, startsAt);
    const claimedBy = seenKeys.get(key);

    // The SAME source appearing twice in one batch is a duplicate input row, not an
    // ambiguity: both rows mean the same airing, and the key floors to the minute so
    // sub-minute jitter lands here. Dedupe to one link rather than planning two writes that
    // would then collide on uq_broadcast_occurrence_key at execution time. (Found by writing
    // the test for the ambiguous case and discovering this one fell through it.)
    if (claimedBy === c.sourceId) {
      decisions.push({ ...base, action: 'skip', reason: 'already_linked', occurrenceKey: key });
      continue;
    }

    // There is deliberately NO cross-source collision branch here. occurrenceKeyFor embeds
    // source_type AND source_id, so two different sources structurally cannot produce the
    // same key - a branch for it could never execute, and dead defensive code advertises a
    // protection that does not exist. The property it would have guarded is pinned instead
    // by broadcastIdentity.test.ts, "separates two different sources that share an id value".
    seenKeys.set(key, c.sourceId);

    decisions.push({
      ...base,
      action: 'link',
      reason: 'ready_to_link',
      occurrenceKey: key,
      startsAt,
      // Rule 3. Private and unpublished, every time.
      proposed: { access_mode: 'private', editorial_state: 'ended' },
    });
  }

  const counts = decisions.reduce(
    (acc, d) => { acc[d.action] += 1; return acc; },
    { link: 0, quarantine: 0, skip: 0 } as Record<BackfillAction, number>,
  );

  return { batchId, decisions, counts };
}

/**
 * Render a plan for a human to read before anything is written. Deliberately shows the
 * quarantine reasons, because those are the rows a reviewer most needs to look at — a
 * summary that only reported "will link 412" would hide every judgement the run made.
 */
export function renderPlan(plan: BackfillPlan): string {
  const lines: string[] = [
    `Backfill plan — batch ${plan.batchId}`,
    `  link:       ${plan.counts.link}`,
    `  skip:       ${plan.counts.skip}  (already linked; a re-run converges here)`,
    `  quarantine: ${plan.counts.quarantine}`,
  ];
  const quarantined = plan.decisions.filter((d) => d.action === 'quarantine');
  if (quarantined.length) {
    lines.push('', 'Quarantined — NOT written, review individually:');
    const byReason = new Map<string, number>();
    for (const q of quarantined) byReason.set(q.reason, (byReason.get(q.reason) ?? 0) + 1);
    for (const [reason, n] of byReason) lines.push(`  ${reason}: ${n}`);
  }
  lines.push('', 'Every linked row would be created access_mode=private, editorial_state=ended.');
  lines.push('Nothing is published by this operation.');
  return lines.join('\n');
}
