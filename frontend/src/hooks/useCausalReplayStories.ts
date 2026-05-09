import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';
import type { OperationalNarrative } from './useOperationalNarratives';

export interface CausalStoryReplay {
  story_id: string;
  organization_id: string;
  kind: 'isolation_chain' | 'mutation_chain' | 'topology_chain' | 'execution_chain';
  narrative: OperationalNarrative;
  causal_chain: Array<{
    step_index: number;
    source_phase: string;
    source_id: string;
    summary: string;
    observed_at: string;
  }>;
  bounded_reason?: string;
  built_at: string;
}

export function useCausalReplayStories(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [story, setStory] = useState<CausalStoryReplay | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['replay.compressed', 'narrative.generated', 'execution.isolated', 'topology.fragmented'] });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/cognitive-compression/causal-story?organization_id=${encodeURIComponent(organization_id)}`);
      setStory((r.data || null) as CausalStoryReplay | null);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load causal story');
    } finally { setLoading(false); }
  }, [organization_id]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { story, loading, error, refresh, streamConnected: stream.connected };
}
