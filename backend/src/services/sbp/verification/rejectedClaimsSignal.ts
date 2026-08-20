/**
 * rejectedClaimsSignal — making `rejected_claims` reach a human.
 *
 * The signal has been produced since the verification loop shipped:
 * `decideStory` records every tick whose text matches no criterion in the
 * published plan. It is persisted to `student_tasks.verification_json`,
 * serialised through `projectTreeDto`, and declared on the frontend DTO. It is
 * read by nothing, rendered by nothing, and alerted on by nothing — a student
 * can sit at `submitted` for days because their agent retyped a sentence, and
 * the only trace is a JSONB column no query touches.
 *
 * ── PROPORTIONALITY ─────────────────────────────────────────────────────────
 *
 * This fires on WORDING DRIFT, not fraud. The realistic causes are an agent
 * that retyped a criterion instead of flipping its boolean, a plan republished
 * with new text, or a student who wrote criteria of their own. None of those is
 * an incident and none of them wants an email at 3am.
 *
 * So the response is one structured log line on the existing `sbp-verification`
 * stream, at `warn`, emitted once per verification run rather than once per
 * claim. Not a page, not an email, not a new admin surface, and explicitly no
 * student identity in the payload — the project id is enough to find the row,
 * and a log stream is not where names belong.
 *
 * The one case worth a human eye is called out separately: a story that is NOT
 * verified and whose only unexplained problem is unmatched claims. That is the
 * shape where somebody is stuck with no message they can act on, which is the
 * failure this whole audit started from.
 *
 * PURE. The summariser has no I/O, so the rule is testable from a literal; the
 * caller owns the logging.
 */
import type { StoryVerdict } from './verifyDecision';

/** How many unmatched sentences to quote. Enough to diagnose, not enough to flood. */
const MAX_SAMPLES = 5;
/** Longest quoted sentence. A criterion is a sentence; anything longer is a paste accident. */
const MAX_SAMPLE_CHARS = 200;

export interface RejectedClaimsSummary {
  /** Every unmatched claim across the build, counted. */
  claims_total: number;
  /** Story ids carrying at least one, sorted and unique. */
  stories_affected: string[];
  /** Up to MAX_SAMPLES truncated claim texts — the actual diagnostic payload. */
  samples: string[];
  /**
   * True when at least one AFFECTED story is not verified. That is the shape
   * that leaves a student stuck: the platform has an opinion about their file
   * it is not telling them. A verified story carrying a stray extra claim is
   * noise and is deliberately not flagged.
   */
  likely_wording_drift: boolean;
}

/**
 * Summarise a build's unmatched claims, or null when there are none.
 *
 * Null rather than a zero-filled object on purpose: the caller logs if and only
 * if this returns something, so "nothing to say" cannot become a log line on
 * every successful sync.
 */
export function summariseRejectedClaims(verdicts: readonly StoryVerdict[]): RejectedClaimsSummary | null {
  const affected = verdicts.filter((v) => (v.rejected_claims?.length ?? 0) > 0);
  if (affected.length === 0) return null;

  const samples: string[] = [];
  let total = 0;
  for (const v of affected) {
    for (const claim of v.rejected_claims) {
      total += 1;
      if (samples.length < MAX_SAMPLES) samples.push(truncate(claim));
    }
  }

  return {
    claims_total: total,
    stories_affected: [...new Set(affected.map((v) => v.story_id))].sort(),
    samples,
    likely_wording_drift: affected.some((v) => v.state !== 'verified'),
  };
}

function truncate(s: string): string {
  const flat = String(s).replace(/\s+/g, ' ').trim();
  return flat.length <= MAX_SAMPLE_CHARS ? flat : `${flat.slice(0, MAX_SAMPLE_CHARS - 1)}…`;
}
