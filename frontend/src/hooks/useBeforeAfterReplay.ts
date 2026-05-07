import { useCallback, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface ReplayManifest {
  outcome_id: string;
  capability_id: string;
  cluster_signature: string;
  before_url: string | null;
  after_url: string | null;
  captured_at: string;
  overlay_regions: Array<{
    cluster_signature: string;
    cluster_type: string;
    bbox: { x: number; y: number; width: number; height: number } | null;
    status: 'resolved' | 'unresolved' | 'regressed';
    note: string;
  }>;
  delta_summary: {
    cognition_delta: number | null;
    ux_debt_delta: number | null;
    behavioral_delta: number | null;
    friction_delta: number | null;
    issues_resolved_count: number;
    issues_regressed_count: number;
  };
  summary: string;
  notes: string[];
}

export function useBeforeAfterReplay() {
  const [manifest, setManifest] = useState<ReplayManifest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (bpId: string, outcomeId: string) => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/business-processes/${bpId}/remediation/replay/${outcomeId}`);
      setManifest(r.data as ReplayManifest);
      return r.data;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load replay');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => { setManifest(null); setError(null); }, []);

  return { manifest, loading, error, load, clear };
}
