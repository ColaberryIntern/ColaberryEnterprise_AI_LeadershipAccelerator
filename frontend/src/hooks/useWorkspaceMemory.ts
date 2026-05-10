/**
 * useWorkspaceMemory — lightweight workspace continuity memory.
 *
 * Living Workspace Sprint, 2026-05-10. Stores small per-operator continuity
 * signals in localStorage so the workspace "remembers what you were doing"
 * across page reloads and tab switches. Read+write, not a settings UI.
 *
 * Persistent fields (all optional):
 *   lastVisitedSurface       — 'home' | 'critique' | 'blueprint' | 'system' | 'sessions'
 *   lastCritiqueSessionId    — visual-review session id last opened
 *   lastSeenNextActionId     — id of the most-recent next_action user has seen
 *   lastSeenActiveBuildId    — id of the most-recent active_build user has seen
 *
 * The "last seen" fields drive micro-feedback toasts: when state.next_action.source_id
 * differs from lastSeenNextActionId, fire a "New priority" toast.
 *
 * Safe-mode: if localStorage is unavailable, hook degrades to in-memory state.
 */
import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'workspaceMemory:v1';

export interface WorkspaceMemory {
  lastVisitedSurface?: string;
  lastCritiqueSessionId?: string;
  lastSeenNextActionId?: string;
  lastSeenActiveBuildId?: string;
  /** ISO timestamp of last write, used by callers to detect freshness. */
  updatedAt?: string;
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

  const clear = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    setMemory({});
  }, []);

  return { memory, update, clear };
}
