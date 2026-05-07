import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useBeforeAfterReplay } from './useBeforeAfterReplay';
import type { ReplayManifest } from './useBeforeAfterReplay';

export interface OutcomeListItem {
  id: string;
  cluster_signature: string;
  cluster_type: string;
  step_key: string | null;
  issues_resolved_count: number;
  issues_regressed_count: number;
  cognition_delta: number | null;
  ux_debt_delta: number | null;
  behavioral_delta: number | null;
  friction_delta: number | null;
  observed_at: string;
  has_replay: boolean;
  pre_pressure_tier: string | null;
  prompt_target_used: string | null;
}

/**
 * Phase 11 — combines useBeforeAfterReplay (manifest load) + recent
 * outcomes list so a "See Replay" CTA can find the right outcome ID
 * for a given step.
 */
export function useRemediationReplay(bpId: string | null) {
  const [outcomes, setOutcomes] = useState<OutcomeListItem[]>([]);
  const [outcomesLoading, setOutcomesLoading] = useState(false);
  const replay = useBeforeAfterReplay();

  const fetchOutcomes = useCallback(async () => {
    if (!bpId) return;
    setOutcomesLoading(true);
    try {
      const r = await portalApi.get(`/api/portal/project/business-processes/${bpId}/remediation/outcomes`);
      setOutcomes((r.data?.outcomes || []) as OutcomeListItem[]);
    } catch {
      setOutcomes([]);
    } finally {
      setOutcomesLoading(false);
    }
  }, [bpId]);

  useEffect(() => { void fetchOutcomes(); }, [fetchOutcomes]);

  const findLatestOutcomeForStep = useCallback((stepKey: string | null): OutcomeListItem | null => {
    if (!stepKey) return outcomes[0] ?? null;
    return outcomes.find(o => o.step_key === stepKey) ?? null;
  }, [outcomes]);

  const openReplay = useCallback(async (outcomeId: string) => {
    if (!bpId) return null;
    return replay.load(bpId, outcomeId);
  }, [bpId, replay]);

  return {
    outcomes,
    outcomesLoading,
    refreshOutcomes: fetchOutcomes,
    findLatestOutcomeForStep,
    manifest: replay.manifest,
    manifestLoading: replay.loading,
    manifestError: replay.error,
    openReplay,
    closeReplay: replay.clear,
  };
}

export type { ReplayManifest };
