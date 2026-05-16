/**
 * useWorkspaceMemory — lightweight workspace continuity memory.
 *
 * Living Workspace Sprint, 2026-05-10. Extended in Workspace Presence Sprint,
 * 2026-05-12, to remember per-surface focus + state snapshots so the
 * workspace can show momentum ("Readiness improved since last visit") and
 * restore context ("you were on the BPs tab last").
 *
 * Persistent fields (all optional):
 *   lastVisitedSurface       — 'home' | 'critique' | 'blueprint' | 'system' | 'sessions'
 *   lastCritiqueSessionId    — visual-review session id last opened
 *   lastSeenNextActionId     — id of the most-recent next_action user has seen
 *   lastSeenActiveBuildId    — id of the most-recent active_build user has seen
 *   lastDrawerOpen           — id of the last drawer the operator opened on Home
 *   lastSystemTab            — last tab the operator viewed on System view
 *   lastBpId                 — last BP detail viewed
 *   lastBpDomain             — domain key of the last domain the operator engaged on System
 *   lastBpDomainLabel        — human label for lastBpDomain (so Home needs no classifier fetch)
 *   lastContribution         — last forward-motion contribution acknowledged on leave
 *   lastReadinessScore       — readiness score at last poll (used for delta)
 *   lastCoverageScore        — coverage score at last poll
 *   lastQueueSize            — queue length at last poll
 *   lastHealthScore          — health score at last poll
 *   lastBuiltAt              — state.built_at value at last snapshot
 *   lastSnapshotAt           — ISO timestamp of the snapshot
 *
 * Operator Orientation Sprint, 2026-05-14, added lastBpDomain / lastBpDomainLabel
 * / lastContribution — all pure continuity derivation, no new tracking.
 *
 * Safe-mode: if localStorage is unavailable, hook degrades to in-memory state.
 */
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'workspaceMemory:v1';

export type DrawerId = 'readiness' | 'coverage' | 'why-this-next' | 'cory';

/**
 * A forward-motion contribution the operator made, captured on leave so the
 * next visit can ambiently acknowledge it. Not a feed, not a log — exactly
 * one, overwritten each time. `signal` is a short editorial phrase
 * ("readiness", "coverage"), not a number.
 */
export interface OperatorContribution {
  domainLabel: string;
  signal: string;
  at: string;
}

export interface WorkspaceMemory {
  lastVisitedSurface?: string;
  lastCritiqueSessionId?: string;
  lastSeenNextActionId?: string;
  lastSeenActiveBuildId?: string;
  // Workspace Presence Sprint additions
  lastDrawerOpen?: DrawerId;
  lastSystemTab?: string;
  lastBpId?: string;
  lastReadinessScore?: number;
  lastCoverageScore?: number;
  lastQueueSize?: number;
  lastHealthScore?: number;
  lastBuiltAt?: string;
  lastSnapshotAt?: string;
  // Operator Orientation Sprint additions — continuity derivation only
  lastBpDomain?: string;
  lastBpDomainLabel?: string;
  /** ISO timestamp of the lastBpDomain write — drives focus recency, distinct from updatedAt. */
  lastBpDomainAt?: string;
  lastContribution?: OperatorContribution;
  // Operational Leverage Sprint additions — system-level leverage summary
  // cached on leave from System BPs so Home can surface one calm line.
  lastLeverageSummary?: {
    highestLeverageLabel: string;
    reason: string;
    evolutionPhrase: string | null;
    at: string;
  };
  /**
   * Operational Onboarding Sprint, 2026-05-16. Per-surface "I've dismissed
   * the first-visit framing card" flags. When a flag is true, the framing
   * card for that surface never reappears for this operator on this device
   * (cross-tab sync via the existing storage listener). The card itself
   * also hides when the operator has touched the surface (independent
   * first-visit detection via lastSnapshotAt / lastBpDomain), so this is
   * an explicit-dismiss path on top of implicit "has been here" inference.
   */
  seenIntros?: {
    home?: boolean;
    systemBps?: boolean;
  };
  /** ISO timestamp of last write, used by callers to detect freshness. */
  updatedAt?: string;
}

export type IntroSurface = 'home' | 'systemBps';

/**
 * Pure render-gate for FirstVisitFramingCard. Extracted as a helper so
 * the decision logic is testable without requiring React render machinery
 * (this frontend's test suite has no @testing-library/react).
 *
 * Returns true ONLY when the surface is genuinely first-visit AND the
 * operator has not explicitly dismissed the framing card for this surface.
 */
export function shouldShowFirstVisitFraming(
  memory: WorkspaceMemory,
  surface: IntroSurface,
  isFirstVisit: boolean,
): boolean {
  if (!isFirstVisit) return false;
  if (memory.seenIntros?.[surface] === true) return false;
  return true;
}

export interface StateSnapshotInput {
  readinessScore: number;
  coverageScore: number;
  queueSize: number;
  healthScore: number;
  builtAt: string;
}

function load(): WorkspaceMemory {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function save(memory: WorkspaceMemory) {
  try {
    const updated = { ...memory, updatedAt: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    /* localStorage unavailable — degrade silently */
  }
}

export function useWorkspaceMemory() {
  const [memory, setMemory] = useState<WorkspaceMemory>(() => load());

  // Listen for cross-tab updates so the memory stays consistent if the
  // user has multiple portal tabs open.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try { setMemory(JSON.parse(e.newValue)); } catch { /* ignore */ }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const update = useCallback((patch: Partial<WorkspaceMemory>) => {
    setMemory(prev => {
      const next = { ...prev, ...patch };
      save(next);
      return next;
    });
  }, []);

  /**
   * Capture a state snapshot. Called once per fresh state poll on Home so
   * the next visit can show "Readiness +4 since last visit". Cheap — only
   * writes when built_at actually changes so we don't spam localStorage.
   */
  const recordSnapshot = useCallback((s: StateSnapshotInput) => {
    setMemory(prev => {
      if (prev.lastBuiltAt === s.builtAt) return prev; // no-op: same snapshot
      const next: WorkspaceMemory = {
        ...prev,
        lastReadinessScore: s.readinessScore,
        lastCoverageScore: s.coverageScore,
        lastQueueSize: s.queueSize,
        lastHealthScore: s.healthScore,
        lastBuiltAt: s.builtAt,
        lastSnapshotAt: new Date().toISOString(),
      };
      save(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setMemory({});
  }, []);

  /**
   * Mark a first-visit framing card as dismissed for this surface. Once
   * marked, the card never reappears. Cross-tab sync via the existing
   * storage listener — dismissing in one tab dismisses in all open tabs.
   */
  const markIntroSeen = useCallback((surface: IntroSurface) => {
    setMemory(prev => {
      const seenIntros = { ...(prev.seenIntros || {}), [surface]: true };
      const next = { ...prev, seenIntros };
      save(next);
      return next;
    });
  }, []);

  return { memory, update, recordSnapshot, clear, markIntroSeen };
}
