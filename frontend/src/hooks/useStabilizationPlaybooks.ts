import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export type RecoveryArchetypeProvenance = 'built_in' | 'operator_set';

export interface RecoveryArchetypeStep {
  step_index: number;
  action_kind: string;
  rationale: string;
  parameter_template: {
    target_namespace?: string;
    target_kind?: string;
    target_plan_id?: string;
    target_step_id?: string;
  };
  required_rollback_chain_id_param: boolean;
  deterministic_hash: string;
}

export interface RecoveryArchetypeProfile {
  archetype_id: string;
  name: string;
  description: string;
  provenance: RecoveryArchetypeProvenance;
  is_built_in: boolean;
  steps: RecoveryArchetypeStep[];
  applicable_when: string[];
  source_lineage: Array<{ source_kind: string; source_id: string; source_phase: string }>;
  registered_at: string;
  registered_by?: string;
  deterministic_hash: string;
}

export function useStabilizationPlaybooks(
  organization_id: string | null,
  opts?: { autoFetch?: boolean },
) {
  const autoFetch = opts?.autoFetch !== false;
  const [archetypes, setArchetypes] = useState<RecoveryArchetypeProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['stabilization.playbook.loaded'] });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/stabilization/archetypes?organization_id=${encodeURIComponent(organization_id)}`);
      setArchetypes((r.data?.archetypes || []) as RecoveryArchetypeProfile[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load archetypes');
    } finally { setLoading(false); }
  }, [organization_id]);

  const setOperator = useCallback(async (input: {
    archetype_id?: string; name: string; description: string;
    steps: Array<{
      step_index: number; action_kind: string; rationale: string;
      parameter_template?: any; required_rollback_chain_id_param?: boolean;
    }>;
    applicable_when: string[]; reason: string;
  }) => {
    if (!organization_id) return null;
    const r = await portalApi.post('/api/portal/project/stabilization/archetypes', {
      organization_id, ...input,
    });
    await refresh();
    return r.data;
  }, [organization_id, refresh]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { archetypes, loading, error, refresh, setOperator, streamConnected: stream.connected };
}
