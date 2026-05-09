import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface OperationalPreviewNarrative {
  narrative_id: string;
  runtime_id: string;
  organization_id: string;
  kind: 'sandbox_lifecycle' | 'rollback_rehearsal' | 'topology_preview' | 'continuity_preview';
  blocks: Array<{
    block_id: string;
    template_id: string;
    rendered_text: string;
    citations: Array<{
      source_kind: string;
      source_id: string;
      source_phase: string;
      recorded_at: string;
      fragment_quoted: string;
    }>;
    deterministic_hash: string;
  }>;
  built_at: string;
}

export function useOperationalPreviewNarratives(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [narratives, setNarratives] = useState<OperationalPreviewNarrative[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['sandbox.preview.generated', 'sandbox.runtime.completed'] });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/live-sandbox/preview-narratives?organization_id=${encodeURIComponent(organization_id)}`);
      setNarratives((r.data?.narratives || []) as OperationalPreviewNarrative[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load preview narratives');
    } finally { setLoading(false); }
  }, [organization_id]);

  const generate = useCallback(async (runtime_id: string) => {
    if (!organization_id) return null;
    const r = await portalApi.post(
      `/api/portal/project/live-sandbox/runtimes/${encodeURIComponent(runtime_id)}/preview-narrative`,
      { organization_id },
    );
    await refresh();
    return r.data as OperationalPreviewNarrative;
  }, [organization_id, refresh]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { narratives, loading, error, refresh, generate, streamConnected: stream.connected };
}
