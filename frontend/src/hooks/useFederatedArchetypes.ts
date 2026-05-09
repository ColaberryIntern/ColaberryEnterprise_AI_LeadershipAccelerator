import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface AnonymizedArchetypePayload {
  archetype_signature: string;
  kind: string;
  step_sequence: string[];
  observed_count: number;
  success_rate: number;
  avg_minutes_to_stabilize: number;
  notes: string[];
}

export interface FederatedArchetypeConfidence {
  archetype_signature: string;
  source_count: number;
  stabilization_consistency: number;
  replay_consistency: number;
  anomaly_rate: number;
  confidence_range: { low: number; high: number };
}

export interface FederatedArchetype {
  archetype: AnonymizedArchetypePayload;
  confidence: FederatedArchetypeConfidence;
  first_observed_at: string;
  last_observed_at: string;
}

export interface OrganizationalRecoveryInsight {
  archetype: AnonymizedArchetypePayload;
  confidence: FederatedArchetypeConfidence;
  is_recommended: boolean;
  recommendation_reason: string;
}

export function useFederatedArchetypes(opts?: { autoFetch?: boolean; kind?: string }) {
  const autoFetch = opts?.autoFetch !== false;
  const [archetypes, setArchetypes] = useState<FederatedArchetype[]>([]);
  const [insights, setInsights] = useState<OrganizationalRecoveryInsight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['archetype.federated', 'recovery.archetype.detected'] });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const kindParam = opts?.kind ? `?kind=${encodeURIComponent(opts.kind)}` : '';
      const [archResp, insightsResp] = await Promise.all([
        portalApi.get(`/api/portal/project/governance/federation/archetypes${kindParam}`),
        portalApi.get(`/api/portal/project/governance/federation/recovery-intelligence${kindParam}`),
      ]);
      setArchetypes((archResp.data?.archetypes || []) as FederatedArchetype[]);
      setInsights((insightsResp.data?.report?.insights || []) as OrganizationalRecoveryInsight[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load federated archetypes');
    } finally {
      setLoading(false);
    }
  }, [opts?.kind]);

  const shareArchetype = useCallback(async (rawArchetype: any, anomalyObserved = false) => {
    const r = await portalApi.post('/api/portal/project/governance/federation/archetypes/share', {
      raw_archetype: rawArchetype,
      anomaly_observed: anomalyObserved,
    });
    await refresh();
    return r.data;
  }, [refresh]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  const recommended = insights.filter(i => i.is_recommended);

  return { archetypes, insights, recommended, loading, error, refresh, shareArchetype, streamConnected: stream.connected };
}
