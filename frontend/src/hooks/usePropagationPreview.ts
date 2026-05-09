import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';
import type { HypotheticalActionKind } from './useExecutionSandbox';

export interface PropagationPreviewProfile {
  preview_id: string;
  experiment_id: string;
  organization_id: string;
  hypothetical_origin: string;
  hypothetical_action_kind: HypotheticalActionKind;
  projected_impacted_namespaces: string[];
  projected_dependency_depth: number;
  projected_impact_score: number;
  inherited_confidence: {
    low: number; high: number; drivers: string[];
    inherited_from_phase: string; inherited_from_source_id: string;
  };
  source_phase_22_attribution_id?: string;
  built_at: string;
}

export function usePropagationPreview(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [previews, setPreviews] = useState<PropagationPreviewProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['propagation.previewed'] });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/experimentation/propagation-previews?organization_id=${encodeURIComponent(organization_id)}`);
      setPreviews((r.data?.previews || []) as PropagationPreviewProfile[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load propagation previews');
    } finally { setLoading(false); }
  }, [organization_id]);

  const preview = useCallback(async (
    hypothetical_origin: string,
    hypothetical_action_kind: HypotheticalActionKind,
  ) => {
    if (!organization_id) return null;
    const r = await portalApi.post('/api/portal/project/experimentation/propagation-preview', {
      organization_id, hypothetical_origin, hypothetical_action_kind,
    });
    await refresh();
    return r.data as PropagationPreviewProfile;
  }, [organization_id, refresh]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { previews, loading, error, refresh, preview, streamConnected: stream.connected };
}
