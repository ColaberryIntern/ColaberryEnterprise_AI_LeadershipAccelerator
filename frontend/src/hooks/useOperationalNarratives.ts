import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { useRealtimeAwareness } from './useRealtimeAwareness';

export interface NarrativeCitation {
  source_kind: string;
  source_id: string;
  source_phase: string;
  recorded_at: string;
  fragment_quoted: string;
}

export interface NarrativeBlock {
  block_id: string;
  template_id: string;
  rendered_text: string;
  source_attributions: NarrativeCitation[];
  determinism: {
    template_id: string;
    selection_rule: string;
    rendered_from: string[];
    deterministic_hash: string;
    replayable: boolean;
  };
  confidence?: {
    low: number;
    high: number;
    drivers: string[];
    inherited_from_source_id: string;
    inherited_from_phase: string;
  };
}

export interface OperationalNarrative {
  narrative_id: string;
  organization_id: string;
  kind: string;
  tier: 'atomic' | 'summarized' | 'compressed' | 'executive';
  blocks: NarrativeBlock[];
  compression: {
    source_event_count: number;
    rendered_block_count: number;
    omitted_low_priority_events: number;
    compression_ratio: number;
    bounded_reason?: string;
  };
  built_at: string;
}

export function useOperationalNarratives(organization_id: string | null, opts?: { autoFetch?: boolean }) {
  const autoFetch = opts?.autoFetch !== false;
  const [narratives, setNarratives] = useState<OperationalNarrative[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stream = useRealtimeAwareness({ kinds: ['narrative.generated', 'replay.compressed'] });

  const refresh = useCallback(async () => {
    if (!organization_id) return;
    setLoading(true); setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/cognitive-compression/narratives?organization_id=${encodeURIComponent(organization_id)}`);
      setNarratives((r.data?.narratives || []) as OperationalNarrative[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load narratives');
    } finally { setLoading(false); }
  }, [organization_id]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);
  useEffect(() => {
    if (!stream.latest) return;
    const t = setTimeout(() => { void refresh(); }, 250);
    return () => clearTimeout(t);
  }, [stream.latest, refresh]);

  return { narratives, loading, error, refresh, streamConnected: stream.connected };
}
