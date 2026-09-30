/**
 * feedRanker — the TRANSPARENT, rule-based value model for the Feed Control plane.
 *
 * Mirrors how social feeds rank (a weighted value score + a policy re-ranking
 * layer for frequency/recency/diversity) but stays fully explainable: every
 * candidate gets a numeric score AND a list of human-readable `reasons`, so the
 * Feed Control simulator can show "shown because: pinned · fresh · not seen".
 *
 * PURE: no I/O, no Date.now (the caller passes `now`) — trivially unit-testable
 * and resume-safe. An ML value model can later replace `scoreCandidate` behind
 * this same interface with zero change to the composer or the UI.
 */
import type { FeedPolicy } from './feedConfigService';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RankCandidate {
  ref: string;
  type: string;
  surface: string;
  /** 0..100 admin priority (the activated `priority` column). */
  priority: number;
  /** pin window end; while in the future the item is boosted + labeled Pinned. */
  pinned_until: Date | null;
  /** when the item became relevant (release_date ?? created_at) — drives recency decay. */
  released_at: Date | null;
  /** per-item overrides; null → fall back to policy defaults. */
  frequency_cap: number | null;
  cooldown_days: number | null;
  /** per-student seen state (from today_feed_impressions / *_views). */
  seen_count: number;
  last_seen_at: Date | null;
  /** true when the student already interacted "dismiss" on this ref. */
  dismissed?: boolean;
}

export interface RankResult {
  score: number;
  reasons: string[];
  /** true = must NOT be shown now (cap hit / cooldown / dismissed). */
  suppressed: boolean;
}

/** Score one candidate against the policy. Higher = show sooner. */
export function scoreCandidate(c: RankCandidate, policy: FeedPolicy, now: Date): RankResult {
  const reasons: string[] = [];

  // Hard suppressors first (the re-ranking "policy layer").
  if (c.dismissed) return { score: 0, reasons: ['dismissed by student'], suppressed: true };

  const cap = c.frequency_cap ?? policy.defaultFrequencyCap;
  if (cap > 0 && c.seen_count >= cap) return { score: 0, reasons: [`frequency cap reached (${cap})`], suppressed: true };

  const cooldown = c.cooldown_days ?? policy.defaultCooldownDays;
  if (cooldown > 0 && c.last_seen_at) {
    const daysSince = (now.getTime() - c.last_seen_at.getTime()) / DAY_MS;
    if (daysSince < cooldown) return { score: 0, reasons: [`in cooldown (${Math.ceil(cooldown - daysSince)}d left)`], suppressed: true };
  }

  // Soft value model.
  let score = 1;

  if (c.priority > 0) {
    score *= 1 + c.priority * policy.priorityWeight;
    if (c.priority >= 50) reasons.push('high priority');
  }

  if (c.pinned_until && c.pinned_until.getTime() > now.getTime()) {
    score *= 5;
    reasons.push('pinned');
  }

  // Recency decay (0.5 per half-life). Missing date → treat as neutral (no decay).
  if (c.released_at) {
    const ageDays = Math.max(0, (now.getTime() - c.released_at.getTime()) / DAY_MS);
    score *= Math.pow(0.5, ageDays / Math.max(1, policy.recencyHalfLifeDays));
    if (ageDays <= 2) reasons.push('fresh');
  }

  // Freshness / already-seen.
  if (c.seen_count <= 0) {
    score *= 1.15;
    reasons.push('not seen');
  } else {
    score *= 1 / (1 + c.seen_count * 0.5);
    if (c.seen_count >= 2) reasons.push('seen before');
  }

  return { score, reasons: reasons.length ? reasons : ['baseline'], suppressed: false };
}

/**
 * Rank a set of candidates: score each, drop suppressed, sort by score desc,
 * then apply DIVERSITY spacing — never place the same `type` back-to-back when an
 * alternative exists (mirrors feed "content-type diversity" re-ranking).
 */
export function rankCandidates<T extends RankCandidate>(
  cands: T[],
  policy: FeedPolicy,
  now: Date,
): Array<T & RankResult> {
  const scored = cands
    .map((c) => ({ ...c, ...scoreCandidate(c, policy, now) }))
    .filter((c) => !c.suppressed)
    .sort((a, b) => b.score - a.score);

  // Diversity pass: greedily avoid repeating a type immediately.
  const out: Array<T & RankResult> = [];
  const pool = [...scored];
  let lastType: string | null = null;
  while (pool.length) {
    let idx = pool.findIndex((c) => c.type !== lastType);
    if (idx < 0) idx = 0; // only same-type left
    const [picked] = pool.splice(idx, 1);
    out.push(picked);
    lastType = picked.type;
  }
  return out;
}
