import { useCallback, useEffect, useRef, useState } from 'react';
import { getSystemState, explainSystemTask } from '../services/portalBusinessProcessApi';

// PHASE 2 — System Intelligence Unification
//
// THE ONE HOOK. Every frontend consumer of "what is the state of this project,
// what should the user do next, what's the queue, why is the next task next"
// reads from here. No component re-derives readiness, coverage, maturity,
// completion, priority, or queue order.

export interface AuthoritativeTaskShape {
  id: string;
  project_id: string;
  bp_id?: string;
  title: string;
  description?: string;
  type: string;
  priority_score: number;
  blocking_score: number;
  dependency_score: number;
  maturity_gain: number;
  readiness_gain: number;
  confidence_score: number;
  execution_cost: number;
  dependencies: string[];
  calculated_rank: number;
  state: string;
  reasoning: string[];
  decision_trace?: any;
}

export interface CapabilityScoresShape {
  capability_id: string;
  readiness: number;
  coverage: number;
  maturity: number;
  maturity_level: 0 | 1 | 2 | 3 | 4;
  health: number;
  sync_health: number;
}

export interface AuthoritativeSystemStateShape {
  project_id: string;
  generated_at: string;
  scores: {
    project_id: string;
    readiness: number;
    coverage: number;
    maturity: number;
    health: number;
    sync_health: number;
    backend: number;
    frontend: number;
    intelligence: number;
    observability: number;
    per_capability: CapabilityScoresShape[];
  };
  queue: AuthoritativeTaskShape[];
  contradictions: Array<{
    kind: string;
    severity: 'info' | 'warning' | 'error';
    message: string;
    project_id: string;
    capability_id?: string;
    task_id?: string;
    evidence: Record<string, unknown>;
  }>;
  graph: { nodes: any[]; edges: any[] };
  next_task: AuthoritativeTaskShape | null;
  next_bp_id: string | null;
  sync_health: {
    score: number;
    dimensions: Record<string, number>;
    contradiction_count: number;
  };
  _meta?: { source: 'snapshot' | 'fresh_build'; elapsed_ms: number };
}

export interface UseAuthoritativeSystemStateReturn {
  state: AuthoritativeSystemStateShape | null;
  loading: boolean;
  error: string | null;
  refresh: (opts?: { fresh?: boolean }) => Promise<void>;
  explain: (taskId: string) => Promise<any | null>;
}

export interface UseAuthoritativeSystemStateOptions {
  /** If true, fetches on mount. Default: true. */
  autoFetch?: boolean;
  /** If set, polls the snapshot endpoint every N ms. Default: off. */
  pollIntervalMs?: number;
  /** If true, the first fetch forces a fresh rebuild. Default: false (read snapshot). */
  initialFresh?: boolean;
}

export function useAuthoritativeSystemState(
  opts: UseAuthoritativeSystemStateOptions = {},
): UseAuthoritativeSystemStateReturn {
  const { autoFetch = true, pollIntervalMs, initialFresh = false } = opts;
  const [state, setState] = useState<AuthoritativeSystemStateShape | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async (refreshOpts?: { fresh?: boolean }) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getSystemState({ fresh: refreshOpts?.fresh });
      if (!mountedRef.current) return;
      setState(res.data as AuthoritativeSystemStateShape);
    } catch (err: any) {
      if (!mountedRef.current) return;
      setError(err?.response?.data?.error || err?.message || 'Failed to load system state');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  const explain = useCallback(async (taskId: string) => {
    try {
      const res = await explainSystemTask(taskId);
      return res.data;
    } catch (err: any) {
      console.warn('[useAuthoritativeSystemState] explain failed:', err?.message);
      return null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (autoFetch) {
      void refresh({ fresh: initialFresh });
    }
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line
  }, [autoFetch, initialFresh]);

  useEffect(() => {
    if (!pollIntervalMs || pollIntervalMs <= 0) return;
    const id = window.setInterval(() => { void refresh(); }, pollIntervalMs);
    return () => window.clearInterval(id);
  }, [pollIntervalMs, refresh]);

  return { state, loading, error, refresh, explain };
}
