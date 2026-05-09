/**
 * UnifiedOperationalPriorityEngine — the ONE ranker.
 *
 * One Brain Consolidation Sprint, 2026-05-09.
 *
 * Inputs are heterogeneous candidate entries from existing engines:
 *   - the next-action engine's pending action
 *   - any pending governance recommendations (recent)
 *   - failed verifications (recent)
 *   - capability gaps (low completion %)
 *
 * Output is one normalized, deterministically-sorted list. Other surfaces
 * MUST consume this list — they MUST NOT re-rank locally.
 *
 * Determinism: when two entries score identically, ties break on (severity,
 * source priority, title alpha) so two consecutive synthesizer runs return
 * the same order.
 */

import type {
  NextActionProfile,
  QueueEntry,
  QueueSourceKind,
  BlastRadiusProfile,
} from './types';

export interface PriorityCandidate {
  source_id: string | null;
  source: QueueSourceKind;
  title: string;
  reason: string;
  /** Engine-emitted priority 0..100 (pass-through) */
  raw_priority: number;
  /** Optional engine-emitted confidence 0..100 */
  confidence?: number;
  time_est_minutes?: number | null;
  blast_radius?: BlastRadiusProfile;
  target_route?: string;
  metadata?: Record<string, any>;
}

// Source-of-origin nudges so two equally-scored items break in a sensible
// order. Cory's chosen next action wins; failed verifications next; then
// governance recs; then visual workspace pending; capability gaps last.
const SOURCE_TIE_RANK: Record<QueueSourceKind, number> = {
  next_action: 5,
  verification_failure: 4,
  governance_recommendation: 3,
  visual_workspace_pending: 2,
  capability_gap: 1,
};

const DEFAULT_BLAST: BlastRadiusProfile = { band: 'low' };
const DEFAULT_TARGET = '/portal/project/blueprint';

export function rankCandidates(
  candidates: PriorityCandidate[],
  options: { limit?: number } = {},
): QueueEntry[] {
  const limit = options.limit ?? 10;

  // Normalize → score → sort → trim → assign rank.
  const normalized: NextActionProfile[] = candidates.map(c => ({
    source_id: c.source_id,
    source: c.source,
    title: c.title,
    reason: c.reason,
    priority_score: clamp(c.raw_priority),
    confidence_score: clamp(c.confidence ?? 60),
    time_est_minutes: c.time_est_minutes ?? null,
    blast_radius: c.blast_radius ?? DEFAULT_BLAST,
    target_route: c.target_route ?? DEFAULT_TARGET,
    metadata: c.metadata,
  }));

  normalized.sort((a, b) => {
    if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
    const sourceDelta = SOURCE_TIE_RANK[b.source] - SOURCE_TIE_RANK[a.source];
    if (sourceDelta !== 0) return sourceDelta;
    return a.title.localeCompare(b.title);
  });

  return normalized.slice(0, limit).map((entry, idx) => ({
    ...entry,
    rank: idx + 1,
  }));
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}
