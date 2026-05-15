/**
 * useOperatorFocus — derives WHERE the operator is currently shaping the
 * system, from continuity signals only.
 *
 * Operator Orientation Sprint, 2026-05-14.
 *
 * This is orientation, NOT analytics. It answers "which operational area
 * has your attention" by reading the domain the operator last engaged on
 * the System surface (memory.lastBpDomain, written by BPDomainSurface).
 * It does not score the operator, rank them, infer intent, or track
 * behavior — it reflects a signal they themselves produced by clicking.
 *
 * Pure derivation. No fetches. Returns { domain: null } when there is no
 * focus signal yet (genuinely first visit / never opened a domain).
 *
 * Confidence tiers:
 *   recent  — engaged a domain within the last 2h
 *   ambient — engaged a domain, but longer ago / time unknown
 */
import { useMemo } from 'react';
import type { WorkspaceMemory } from './useWorkspaceMemory';
import { getDomainProfile, type DomainProfile } from '../utils/bpDomainClassifier';

export type FocusConfidence = 'recent' | 'ambient';

export interface OperatorFocus {
  /** The domain the operator is currently shaping, or null when no signal. */
  domain: DomainProfile | null;
  /** Strength of the focus signal. Null when domain is null. */
  confidence: FocusConfidence | null;
  /** Minutes since the operator engaged this domain. Null when time unknown. */
  minutesSince: number | null;
}

const RECENT_WINDOW_MIN = 120;

const EMPTY: OperatorFocus = { domain: null, confidence: null, minutesSince: null };

/**
 * Pure derivation — exported so it can be unit-tested without a hook
 * renderer. `now` is injectable for deterministic recency tests.
 */
export function deriveOperatorFocus(memory: WorkspaceMemory, now: number = Date.now()): OperatorFocus {
  if (!memory.lastBpDomain) return EMPTY;

  const domain = getDomainProfile(memory.lastBpDomain);
  if (!domain) return EMPTY; // stale key from an older build — degrade silently

  const minutesSince = memory.lastBpDomainAt
    ? Math.max(0, Math.floor((now - new Date(memory.lastBpDomainAt).getTime()) / 60_000))
    : null;

  const confidence: FocusConfidence =
    minutesSince != null && minutesSince < RECENT_WINDOW_MIN ? 'recent' : 'ambient';

  return { domain, confidence, minutesSince };
}

export function useOperatorFocus(memory: WorkspaceMemory): OperatorFocus {
  // Destructure to primitive deps so the memo key is stable + honest — the
  // derivation only reads these two fields off memory.
  const { lastBpDomain, lastBpDomainAt } = memory;
  return useMemo(
    () => deriveOperatorFocus({ lastBpDomain, lastBpDomainAt }),
    [lastBpDomain, lastBpDomainAt],
  );
}
