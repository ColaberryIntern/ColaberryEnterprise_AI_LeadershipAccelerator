import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface OrganizationalStabilizationInsight {
  archetype_signature: string;
  archetype_kind: string;
  stabilization_score: number;
  fastest_stabilization_minutes: number;
  avg_propagation_reduction: number;
  total_observations: number;
  unique_consumer_count: number;
  notes: string;
}

export interface OrganizationalStabilizationReport {
  organization_id: string;
  insights: OrganizationalStabilizationInsight[];
  worst_recurring_drift_signature: string | null;
  built_at: string;
}

export function useOrganizationalStabilization(opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [report, setReport] = useState<OrganizationalStabilizationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['stabilization.insight.generated', 'archetype.effectiveness.updated'] });

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/governance/federated-learning/organizational-stabilization');
      setReport((r.data?.report || null) as OrganizationalStabilizationReport | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load organizational stabilization report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { report, loading, error, refresh, streamConnected: stream.connected };
}
