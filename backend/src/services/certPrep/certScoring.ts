import { CertDomainResult } from '../../models/CertSession';

/**
 * certScoring — the pure scoring core, kept separate from the session write path
 * so every boundary case is testable without a database.
 *
 * ON THE 0–1000 NUMBER, READ THIS BEFORE CHANGING ANYTHING.
 *
 * Anthropic reports CCAR-F as a scaled score from 100 to 1,000 with a pass at 720,
 * produced by a criterion-referenced equating process we do not have and cannot
 * reproduce. What follows is NOT that. It is a deliberately simple, published,
 * linear presentation transform, so that a Colaberry practice result sits on the
 * same axis a student will meet on exam day and can be compared to the same 720
 * line. It is a COLABERRY READINESS ESTIMATE and every surface that shows it must
 * say so — it must never be captioned as a predicted Anthropic score.
 *
 * The transform is linear across the full range: 0% correct maps to 100, 100% maps
 * to 1000. A consequence worth knowing rather than hiding: the 720 line lands at
 * about 68.9% correct. That is a reasonable working bar and it is an assumption,
 * not a fact about the real exam. Because it is linear and published, a student who
 * asks "why 640?" gets an answer; an opaque curve could not give one.
 */

/** Lowest and highest points of the reported scale, matching the exam's axis. */
export const SCALE_MIN = 100;
export const SCALE_MAX = 1000;
/** The bar Anthropic uses. Ours is compared against the same line, honestly labelled. */
export const PASSING_SCALED = 720;
/** The scoring transform's own version, stored on every session and snapshot. */
export const SCORING_POLICY_VERSION = 'v1-linear';

/**
 * Map a proportion correct to the reported scale.
 *
 * Returns null for an empty attempt rather than 100: zero questions answered is
 * "no measurement", not "scored at the floor", and showing a floor score to a
 * student who has answered nothing is a lie the UI would have to explain away.
 */
export function toScaledScore(correct: number, total: number): number | null {
  if (!Number.isFinite(correct) || !Number.isFinite(total) || total <= 0) return null;
  const clampedCorrect = Math.max(0, Math.min(correct, total));
  const proportion = clampedCorrect / total;
  return Math.round(SCALE_MIN + (SCALE_MAX - SCALE_MIN) * proportion);
}

/** The proportion correct that the passing line corresponds to under this transform. */
export function passingProportion(): number {
  return (PASSING_SCALED - SCALE_MIN) / (SCALE_MAX - SCALE_MIN);
}

export interface ScoredResponse {
  domain_id: string;
  is_correct: boolean | null;
}

/**
 * Roll responses up per domain.
 *
 * Unanswered items (is_correct === null) are excluded from BOTH numerator and
 * denominator. Counting a skipped question as wrong would make an abandoned
 * session look like a failed one, and a student who ran out of time has not
 * demonstrated that they do not know the material.
 */
export function rollUpDomains(responses: ScoredResponse[]): CertDomainResult[] {
  const byDomain = new Map<string, { correct: number; total: number }>();
  for (const response of responses) {
    if (response.is_correct === null || response.is_correct === undefined) continue;
    const bucket = byDomain.get(response.domain_id) ?? { correct: 0, total: 0 };
    bucket.total += 1;
    if (response.is_correct) bucket.correct += 1;
    byDomain.set(response.domain_id, bucket);
  }
  return Array.from(byDomain.entries())
    .map(([domain_id, b]) => ({
      domain_id,
      correct: b.correct,
      total: b.total,
      pct: b.total > 0 ? b.correct / b.total : 0,
    }))
    .sort((a, b) => a.domain_id.localeCompare(b.domain_id));
}

export interface SessionScore {
  correct_count: number;
  total_count: number;
  scaled_score: number | null;
  domain_results: CertDomainResult[];
  answered_count: number;
}

/**
 * Score a whole session.
 *
 * `total_count` is the number of items SERVED, not the number answered — a mock
 * abandoned halfway is scored out of the full form, because that is what sitting
 * the real exam and running out of time would produce. Practice sessions are
 * scored the same way for consistency; the answered count is reported alongside so
 * a caller can distinguish "got half wrong" from "answered half".
 */
export function scoreSession(responses: ScoredResponse[], servedCount: number): SessionScore {
  const answered = responses.filter((r) => r.is_correct !== null && r.is_correct !== undefined);
  const correct = answered.filter((r) => r.is_correct).length;
  const total = Math.max(servedCount, answered.length);
  return {
    correct_count: correct,
    total_count: total,
    scaled_score: toScaledScore(correct, total),
    domain_results: rollUpDomains(responses),
    answered_count: answered.length,
  };
}

export interface FormSlot {
  domain_id: string;
  count: number;
}

/**
 * Decide how many items to draw from each domain for a form of `itemCount`.
 *
 * Uses largest-remainder apportionment so the slots sum to exactly itemCount —
 * naive rounding of five weights routinely lands on 59 or 61 for a 60-item form,
 * and a mock that quietly serves 59 items is not the exam shape it claims to be.
 *
 * Domains with no weight are dropped rather than given an equal share: an unweighted
 * blueprint is unverified, and inventing a share would be exactly the false
 * precision the schema was built to avoid. The caller checks `weightsAreUsable`
 * first and offers unweighted practice instead of a weighted mock.
 */
export function buildFormPlan(
  domains: { domain_id: string; weight_pct: number | null }[],
  itemCount: number,
): FormSlot[] {
  const weighted = domains.filter(
    (d) => d.weight_pct !== null && d.weight_pct !== undefined && Number(d.weight_pct) > 0,
  );
  if (weighted.length === 0 || itemCount <= 0) return [];

  const totalWeight = weighted.reduce((sum, d) => sum + Number(d.weight_pct), 0);
  const exact = weighted.map((d) => ({
    domain_id: d.domain_id,
    ideal: (Number(d.weight_pct) / totalWeight) * itemCount,
  }));

  const slots = exact.map((e) => ({ domain_id: e.domain_id, count: Math.floor(e.ideal) }));
  let remaining = itemCount - slots.reduce((sum, s) => sum + s.count, 0);

  // Hand out the leftover items to the largest fractional remainders first.
  const byRemainder = exact
    .map((e, i) => ({ i, remainder: e.ideal - Math.floor(e.ideal) }))
    .sort((a, b) => b.remainder - a.remainder);

  let cursor = 0;
  while (remaining > 0 && byRemainder.length > 0) {
    slots[byRemainder[cursor % byRemainder.length].i].count += 1;
    remaining -= 1;
    cursor += 1;
  }

  return slots.filter((s) => s.count > 0);
}

/** True when a timed session has run past its deadline. */
export function isExpired(
  session: { expires_at?: Date | null; status?: string },
  now: Date = new Date(),
): boolean {
  if (!session.expires_at) return false;
  if (session.status === 'completed') return false;
  return new Date(session.expires_at).getTime() <= now.getTime();
}
