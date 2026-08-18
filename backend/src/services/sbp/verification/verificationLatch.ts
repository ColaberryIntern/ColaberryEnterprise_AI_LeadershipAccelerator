/**
 * verificationLatch — the rule that keeps a verified story verified.
 *
 * ## The rule
 *
 * **EVIDENCE LIVES IN OUR DATABASE. THE REPO IS ONLY WHERE VERIFICATION
 * HAPPENS.** When a story verifies, the commit sha, which criteria passed, the
 * timestamp and the XP are written to our own tables. If the student deletes
 * the repo, revokes our access, or rewrites history, their record and their
 * points survive. We lose the ability to verify NEW work and nothing else.
 *
 * ## Why this module exists
 *
 * `student_tasks.verification_json` is a **mutable view** of the last repo
 * read. `student_tasks.verified_at` is an **immutable latch**, written once and
 * never moved. The display layer read only the first and ignored the second,
 * which made three separate defects out of one mistake:
 *
 *   1. A student deletes `.colaberry/` and syncs. The read SUCCEEDS and reports
 *      every story at zero criteria, so six verified stories render as
 *      `not_started` while `verified_at` sits untouched in the column
 *      underneath.
 *   2. An active build passes 100 commits and the evidence commit scrolls out
 *      of the read window. Criteria still pass, no qualifying commit is
 *      visible, and `verified` silently becomes `submitted` — with no student
 *      misbehaviour at all. Falling out of a read window is time passing, not a
 *      regression.
 *   3. A student force-pushes. The story re-verifies under a NEW sha, the XP
 *      lookup re-derives its key from that new sha, and the award row keyed on
 *      the ORIGINAL sha is orphaned — so the story reads 0 XP forever.
 *
 * All three are the same bug: **the repo-derived blob was treated as the
 * record instead of as a view of it.** This module is the correction, and it is
 * PURE so the rule is testable without a database or a network.
 *
 * ## What a latched record means
 *
 * A latched record still carries what the live read saw, in `live_state`, so a
 * degraded repo is visible rather than hidden. It just is not allowed to
 * *lower* the verdict. The latch can only hold a story AT verified; it never
 * invents one.
 */

export type StoryVerificationState = 'not_started' | 'in_progress' | 'submitted' | 'verified';

/** The immutable half, straight off `student_tasks`. Never derived from a repo. */
export interface VerificationLatch {
  /** Set once, never moved. Its presence IS the verification. */
  verified_at: Date | string | null | undefined;
  /** What granted it. */
  verified_by?: string | null;
  /**
   * The evidence commit sha frozen at award time.
   *
   * This existed only in a log line before. Persisting it is the actual fix for
   * defect 3: the award row in `evidence_records` is keyed on
   * `<story>@<sha-at-award-time>`, so re-deriving that key from the CURRENT
   * repo state cannot find it once history is rewritten.
   */
  verified_ref?: string | null;
}

/** The mutable half — the last repo read, as stored and as served. */
export interface VerificationRecord {
  state: StoryVerificationState;
  criteria_total: number;
  criteria_passed: number;
  outstanding: string[];
  commit_sha: string | null;
  commit_at: string | null;
  reasons: string[];
  rejected_claims: string[];
  checked_at: string | null;
  /**
   * True when this record is held at `verified` by the latch rather than by the
   * current repo read. The UI uses it to explain why a story it cannot re-check
   * is still complete.
   */
  latched?: boolean;
  /**
   * What the CURRENT read concluded, when it disagrees with the latch.
   * Diagnostic only — never authoritative, never displayed as the state.
   */
  live_state?: StoryVerificationState | null;
  /**
   * One sentence for the student, set when the last sync could not READ the
   * progress file at all — not "your criteria are failing" but "we could not
   * tell what your criteria say".
   *
   * Distinct from `reasons` in what it licenses the UI to do: while this is
   * set, the counts beside it are stale by definition and the page must not
   * present them as this push's verdict.
   */
  read_error?: string | null;
  /** `ProgressFileNotJson`, `ProgressFileSchemaMismatch`, … Never shown raw. */
  read_error_class?: string | null;
}

/** A progress-file read that failed, reduced to what a student needs. */
export interface ProgressReadError {
  error_class: string;
  /** The student-facing sentence from `ProgressParseFailure.reason`. */
  reason: string;
}

export const isLatched = (latch: VerificationLatch | null | undefined): boolean =>
  Boolean(latch?.verified_at);

/**
 * A sentence for a student looking at a story the platform can no longer
 * re-check. It has to lead with the reassurance, because the fear it answers is
 * "did I just lose my work?".
 */
export function latchNote(liveState: StoryVerificationState): string {
  const because = liveState === 'not_started'
    ? 'the platform can no longer find this story\'s progress in your repo'
    : 'the current read of your repo no longer shows it complete';
  return `Verified, and it stays verified — ${because}. `
    + 'Verification is recorded here on the platform, not in your repo, so nothing you do to the repo can take it away.';
}

/**
 * Apply the latch to a live verdict.
 *
 * Returns the live record unchanged when there is no latch, or when the live
 * read agrees with it. Otherwise returns a record held at `verified`, carrying
 * the frozen evidence forward and recording what the live read actually said.
 *
 * @param live   the verdict the current repo read produced
 * @param latch  the immutable columns from `student_tasks`
 * @param prior  the previously stored record, used only to recover the evidence
 *               commit when the latch predates `verified_ref`
 */
export function applyVerificationLatch(
  live: VerificationRecord,
  latch: VerificationLatch | null | undefined,
  prior?: Partial<VerificationRecord> | null,
): VerificationRecord {
  if (!isLatched(latch)) return live;

  // The live read agrees. Nothing to hold, and no note to add — the common case
  // on a healthy repo, and it must stay byte-identical to the unlatched result.
  if (live.state === 'verified') return live;

  // The frozen sha, best source first: the column written at award time, then
  // whatever the last good record carried, then the live read (which may still
  // see the commit even when criteria have gone).
  const frozenSha = firstString(latch?.verified_ref, prior?.commit_sha, live.commit_sha);
  const frozenAt = firstString(prior?.commit_at, live.commit_at);

  return {
    ...live,
    state: 'verified',
    // Verification MEANS every criterion passed; the latch asserts that
    // happened. `criteria_total` is safe to trust here because it comes from
    // the published plan in our database, not from the repo.
    criteria_passed: live.criteria_total,
    outstanding: [],
    commit_sha: frozenSha,
    commit_at: frozenAt,
    // Not empty, unlike an ordinary verified record: a student whose repo we
    // cannot read deserves to know that, and to be told it costs them nothing.
    reasons: [latchNote(live.state)],
    latched: true,
    live_state: live.state,
  };
}

/**
 * Annotate a stored record with "we could not read your progress file".
 *
 * WHY THIS EXISTS. The reject path used to return early and write nothing, so
 * the row kept the verdict from the last READABLE sync. Confirmed live on
 * 2026-08-17: a student's row still said *"None of the 5 acceptance criteria
 * are marked as passing yet"* while every sync since had been rejected with
 * `ProgressFileSchemaMismatch`. Those are not the same claim — the first says
 * her work is failing, the second says we cannot see her work — and she spent
 * an evening re-verifying correct code because the page asserted the first.
 * Writing nothing is not neutral when something false is already on screen.
 *
 * WHAT IT MAY AND MAY NOT CHANGE. Only the prose moves. `state`,
 * `criteria_passed`, `criteria_total`, `outstanding`, the commit fields and
 * `checked_at` are all carried forward untouched, because an unreadable file is
 * evidence of nothing: it can neither advance a story nor lower one, and
 * `checked_at` must not move because no new verdict was reached.
 *
 * A VERIFIED RECORD IS RETURNED UNCHANGED. Verification never revokes, and a
 * finished story has nothing for the student to act on, so annotating it would
 * only add alarm to work that is already banked.
 *
 * PURE and a FIXED POINT: annotating an annotated record returns the same
 * record, which is what lets the caller re-run a rejected sync as often as the
 * student presses the button without the stored state drifting.
 */
export function annotateReadError(
  prior: Partial<VerificationRecord> | null | undefined,
  err: ProgressReadError,
): VerificationRecord {
  const base = normaliseRecord(prior);
  if (base.state === 'verified') return (prior as VerificationRecord) ?? base;

  return {
    ...base,
    // `reasons` answers "why is this not verified yet", and the honest answer
    // is now the read error. Leaving the previous sentence beside it would let
    // the misleading one keep rendering, which is the defect itself.
    reasons: [err.reason],
    read_error: err.reason,
    read_error_class: err.error_class,
  };
}

const STATES: readonly StoryVerificationState[] = ['not_started', 'in_progress', 'submitted', 'verified'];

/**
 * A stored JSONB blob, read defensively into a full record.
 *
 * A row can predate any field, or hold nothing at all when the platform has
 * never managed a readable sync. The floor is `not_started` with zero counts —
 * which is what every display surface already defaults an absent blob to, so
 * this states the default rather than inventing progress. An unrecognised
 * `state` falls to the floor too: the generous direction on a field that gates
 * credit is the wrong direction.
 */
function normaliseRecord(prior: Partial<VerificationRecord> | null | undefined): VerificationRecord {
  const p = (prior && typeof prior === 'object' && !Array.isArray(prior) ? prior : {}) as Partial<VerificationRecord>;
  const state = STATES.includes(p.state as StoryVerificationState)
    ? (p.state as StoryVerificationState)
    : 'not_started';
  return {
    state,
    criteria_total: Number(p.criteria_total ?? 0) || 0,
    criteria_passed: Number(p.criteria_passed ?? 0) || 0,
    outstanding: Array.isArray(p.outstanding) ? p.outstanding.map(String) : [],
    commit_sha: typeof p.commit_sha === 'string' ? p.commit_sha : null,
    commit_at: typeof p.commit_at === 'string' ? p.commit_at : null,
    reasons: Array.isArray(p.reasons) ? p.reasons.map(String) : [],
    rejected_claims: Array.isArray(p.rejected_claims) ? p.rejected_claims.map(String) : [],
    checked_at: typeof p.checked_at === 'string' ? p.checked_at : null,
    ...(p.latched === undefined ? {} : { latched: Boolean(p.latched) }),
    ...(p.live_state === undefined ? {} : { live_state: p.live_state ?? null }),
  };
}

function firstString(...values: Array<string | null | undefined>): string | null {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v;
  }
  return null;
}

/**
 * The evidence key an award was recorded under, or null when this story has
 * never been verified.
 *
 * `recordEvidence` keys on `<story_id>@<sha>` (the story is prefixed so two
 * stories finished in one commit each get their own row). Rebuilding that key
 * from `verified_ref` reads the sha that was frozen at award time, which is the
 * whole point — the current repo state is not allowed a vote in what was
 * already banked.
 */
export function awardedEvidenceRef(storyId: string | null | undefined, latch: VerificationLatch | null | undefined): string | null {
  if (!storyId || !isLatched(latch)) return null;
  const sha = typeof latch?.verified_ref === 'string' ? latch.verified_ref.trim() : '';
  return sha ? `${storyId}@${sha}` : null;
}
