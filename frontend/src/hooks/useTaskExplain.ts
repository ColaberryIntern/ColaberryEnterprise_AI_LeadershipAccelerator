import { useCallback, useEffect, useState } from 'react';
import { explainSystemTask } from '../services/portalBusinessProcessApi';

// PHASE 4 — "Why is this next?" data hook.
//
// Fetches the full DecisionTrace + related contradictions for a single task.
// Powers the WhyIsThisNextPanel UI. Keep this hook small — the panel is the
// component that renders.

export interface DecisionTraceShape {
  readiness_inputs:  { current: number; target: number; gap: number };
  coverage_inputs:   { current: number; source: string; target: number; gap: number };
  maturity_inputs:   { current_level: number; target_level: number; next_level_gap?: string };
  dependency_inputs: { count: number; unmet: string[]; cycles: string[] };
  blocking_inputs:   { is_blocking: boolean; downstream_count: number; reason?: string };
  confidence_inputs: { confidence: number; basis: string };
  formulas_used:     string[];
  reasoning_chain:   string[];
  // Phase 3 extensions
  score_breakdown?:        Record<string, number>;
  dependency_chain?:       string[];
  missing_requirements?:   string[];
  expected_outcomes?:      string[];
  projected_maturity_gain?: { current_level: number; projected_level: number; delta: number };
  affected_systems?:       string[];
  telemetry_sources_used?: string[];
}

export interface ExplainResponse {
  task: any;
  decision_trace: DecisionTraceShape;
  reasoning: string[];
  related_contradictions: any[];
  blocked_by: string[];
  generated_at: string;
}

export interface UseTaskExplainReturn {
  data: ExplainResponse | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useTaskExplain(taskId: string | null): UseTaskExplainReturn {
  const [data, setData] = useState<ExplainResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!taskId) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await explainSystemTask(taskId);
      setData(r.data as ExplainResponse);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load explanation');
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
