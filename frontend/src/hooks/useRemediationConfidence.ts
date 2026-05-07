import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface PerClusterConfidence {
  cluster_signature: string;
  cluster_type: string;
  confidence: {
    confidence: number;
    tier: 'low' | 'moderate' | 'high';
    reasons: string[];
  };
}

export interface RemediationConfidenceResponse {
  overall_confidence: number;
  per_cluster: PerClusterConfidence[];
}

export function useRemediationConfidence(bpId: string | null, opts?: { autoFetch?: boolean }) {
  const [data, setData] = useState<RemediationConfidenceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoFetch = opts?.autoFetch !== false;

  const fetch = useCallback(async () => {
    if (!bpId) return null;
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/business-processes/${bpId}/remediation/confidence`);
      setData(r.data as RemediationConfidenceResponse);
      return r.data;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to fetch confidence');
      return null;
    } finally {
      setLoading(false);
    }
  }, [bpId]);

  useEffect(() => {
    if (autoFetch && bpId) { void fetch(); }
  }, [autoFetch, bpId, fetch]);

  return { data, loading, error, refresh: fetch };
}
