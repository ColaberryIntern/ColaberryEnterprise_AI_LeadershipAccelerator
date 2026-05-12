/**
 * useOperationalMomentum — derives ambient momentum signals from
 * (current unified state) × (last-seen state snapshot in memory).
 *
 * Workspace Presence Sprint, 2026-05-12. No new endpoints. No new state.
 * Pure derivation. Powers the "recently moved" card on Home + the
 * "last touched X ago" affordance in the context bar.
 *
 * Returned fields:
 *   readinessDelta     — current readiness score minus last snapshot
 *   coverageDelta      — current coverage score minus last snapshot
 *   queueDelta         — current queue length minus last snapshot (negative = good)
 *   healthDelta        — current health score minus last snapshot
 *   minutesSinceVisit  — minutes since lastSnapshotAt (null when first visit)
 *   minutesSinceBuilt  — minutes since state.built_at
 *   hasMomentum        — true when any |delta| > 0 (used to show/hide the card)
 *   netForwardMotion   — sum of forward-positive deltas
 *                        (readiness↑ + coverage↑ + queue↓ + health↑)
 *
 * Notes on direction:
 *   Readiness / Coverage / Health: higher is better — positive delta is good
 *   Queue: lower is better — negative delta is good
 *   netForwardMotion treats all four uniformly so callers can show a single
 *   "forward motion" headline without doing direction math.
 */
import { useMemo } from 'react';
import type { UnifiedProjectState } from './useUnifiedProjectState';
import type { WorkspaceMemory } from './useWorkspaceMemory';

export interface OperationalMomentum {
  readinessDelta: number | null;
  coverageDelta: number | null;
  queueDelta: number | null;
  healthDelta: number | null;
  minutesSinceVisit: number | null;
  minutesSinceBuilt: number | null;
  hasMomentum: boolean;
  netForwardMotion: number;
}

const EMPTY: OperationalMomentum = {
  readinessDelta: null,
  coverageDelta: null,
  queueDelta: null,
  healthDelta: null,
  minutesSinceVisit: null,
  minutesSinceBuilt: null,
  hasMomentum: false,
  netForwardMotion: 0,
};

export function useOperationalMomentum(
  state: UnifiedProjectState | null,
  memory: WorkspaceMemory,
): OperationalMomentum {
  return useMemo(() => {
    if (!state) return EMPTY;

    const readinessDelta = memory.lastReadinessScore != null
      ? state.readiness.score - memory.lastReadinessScore
      : null;
    const coverageDelta = memory.lastCoverageScore != null
      ? state.coverage.score - memory.lastCoverageScore
      : null;
    const queueDelta = memory.lastQueueSize != null
      ? state.queue.length - memory.lastQueueSize
      : null;
    const healthDelta = memory.lastHealthScore != null
      ? state.health.score - memory.lastHealthScore
      : null;

    const now = Date.now();
    const minutesSinceVisit = memory.lastSnapshotAt
      ? Math.max(0, Math.floor((now - new Date(memory.lastSnapshotAt).getTime()) / 60_000))
      : null;
    const minutesSinceBuilt = state.built_at
      ? Math.max(0, Math.floor((now - new Date(state.built_at).getTime()) / 60_000))
      : null;

    const hasMomentum = !!(
      (readinessDelta && readinessDelta !== 0) ||
      (coverageDelta && coverageDelta !== 0) ||
      (queueDelta && queueDelta !== 0) ||
      (healthDelta && healthDelta !== 0)
    );

    // Forward motion = sum of *positive* progress regardless of metric direction.
    // Readiness/Coverage/Health: positive delta = forward
    // Queue: negative delta = forward (drained)
    const netForwardMotion =
      Math.max(0, readinessDelta ?? 0) +
      Math.max(0, coverageDelta ?? 0) +
      Math.max(0, healthDelta ?? 0) +
      Math.max(0, -(queueDelta ?? 0));

    return {
      readinessDelta,
      coverageDelta,
      queueDelta,
      healthDelta,
      minutesSinceVisit,
      minutesSinceBuilt,
      hasMomentum,
      netForwardMotion,
    };
  }, [
    state,
    memory.lastReadinessScore,
    memory.lastCoverageScore,
    memory.lastQueueSize,
    memory.lastHealthScore,
    memory.lastSnapshotAt,
  ]);
}

/** Human-friendly "X ago" formatter for momentum surfaces. */
export function formatMinutesAgo(min: number | null): string {
  if (min == null) return 'just now';
  if (min < 1) return 'just now';
  if (min === 1) return '1 minute ago';
  if (min < 60) return `${min} minutes ago`;
  const hours = Math.floor(min / 60);
  if (hours === 1) return '1 hour ago';
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}
