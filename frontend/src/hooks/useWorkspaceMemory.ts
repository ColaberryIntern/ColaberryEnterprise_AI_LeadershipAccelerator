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
 *   lastReadinessScore       — readiness score at last poll (used for delta)
 *   lastCoverageScore        — coverage score at last poll
 *   lastQueueSize            — queue length at last poll
 *   lastHealthScore          — health score at last poll
 *   lastBuiltAt              — state.built_at value at last snapshot
 *   lastSnapshotAt           — ISO timestamp of the snapshot
 *
 * Safe-mode: if localStorage is unavailable, hook degrades to in-memory state.
 */
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'workspaceMemory:v1';

export type DrawerId = 'readiness' | 'coverage' | 'why-this-next' | 'cory';

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
  /** ISO timestamp of last write, used by callers to detect freshness. */
  updatedAt?: string;
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

  return { memory, update, recordSnapshot, clear };
}
