/**
 * useUnifiedProjectState — the ONE operational-state hook.
 *
 * One Brain Consolidation Sprint, 2026-05-09.
 *
 * Every UI surface that needs readiness, coverage, next step, queue,
 * blockers, active build, or verification status MUST use this hook.
 *
 * Local recomputation is forbidden by convention. If a value isn't here,
 * add it to the backend `UnifiedProjectState` shape — never compute it
 * locally inside a component.
 */

import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';

export type ReadinessBand = 'red' | 'amber' | 'green';
export type BlastRadiusBand = 'low' | 'medium' | 'high';
export type QueueSourceKind =
  | 'next_action'
  | 'governance_recommendation'
  | 'visual_workspace_pending'
  | 'verification_failure'
  | 'capability_gap';

export interface ReadinessProfile {
  score: number;
  band: ReadinessBand;
  reasons: string[];
  breakdown: {
    artifact_completion: number;
    requirements_coverage: number;
    github_health: number;
    portfolio_quality: number;
    workflow_progress: number;
  };
}

export interface CoverageProfile {
  score: number;
  requirements_matched: number;
  requirements_total: number;
  bps_complete: number;
  bps_total: number;
}

export interface ConfidenceProfile {
  score: number;
  sources: string[];
}

export interface HealthProfile {
  score: number;
  regressions_24h: number;
  verification_pass_rate: number;
}

export interface BlastRadiusProfile {
  band: BlastRadiusBand;
  reason?: string;
}

export interface NextActionProfile {
  source_id: string | null;
  source: QueueSourceKind;
  title: string;
  reason: string;
  priority_score: number;
  confidence_score: number;
  time_est_minutes: number | null;
  blast_radius: BlastRadiusProfile;
  target_route: string;
  metadata?: Record<string, any>;
}

export type QueueEntry = NextActionProfile & { rank: number };

export interface BlockerEntry {
  source_id: string | null;
  source: QueueSourceKind;
  title: string;
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface ActiveBuildProfile {
  source: QueueSourceKind;
  title: string;
  started_at: string;
  target_ref: string;
}

export interface VerificationStateProfile {
  pending: number;
  passing: number;
  failing: number;
  pass_rate_24h: number;
}

export interface UnifiedProjectState {
  project: {
    id: string;
    organization_name: string | null;
    industry: string | null;
    project_stage: string;
  };
  readiness: ReadinessProfile;
  coverage: CoverageProfile;
  confidence: ConfidenceProfile;
  health: HealthProfile;
  next_action: NextActionProfile | null;
  queue: QueueEntry[];
  blockers: BlockerEntry[];
  active_build: ActiveBuildProfile | null;
  verification: VerificationStateProfile;
  built_at: string;
}

export interface UseUnifiedProjectState {
  state: UnifiedProjectState | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useUnifiedProjectState(options?: { pollMs?: number }): UseUnifiedProjectState {
  const [state, setState] = useState<UnifiedProjectState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/unified-state');
      setState(r.data as UnifiedProjectState);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load unified state');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!options?.pollMs) return;
    const id = setInterval(() => { void refresh(); }, options.pollMs);
    return () => clearInterval(id);
  }, [options?.pollMs, refresh]);

  return { state, loading, error, refresh };
}
