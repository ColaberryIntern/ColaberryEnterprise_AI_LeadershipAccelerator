import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface RemediationCluster {
  cluster: {
    cluster_signature: string;
    cluster_type: string;
    capability_id: string;
    page_route: string;
    affected_regions: string[];
    issue_count: number;
    severity: 'low' | 'medium' | 'high';
    remediation_priority: number;
    likely_root_cause: string;
  };
  confidence: {
    confidence: number;
    tier: 'low' | 'moderate' | 'high';
    reasons: string[];
  };
  is_regression_prone: boolean;
  historical_success_rate: number;
}

export interface RemediationIntelligenceReport {
  project_id: string;
  capability_id: string;
  clusters: RemediationCluster[];
  sequence: {
    ordered_clusters: Array<{ cluster_signature: string; position: number; reason: string }>;
    reasoning: string[];
  };
  regression_prone: Array<{
    cluster_signature: string;
    cluster_type: string;
    recurrence_count: number;
    last_failed_action: string;
    recommended_alternative: string;
  }>;
  overall_confidence: number;
  summary: string;
  generated_at: string;
}

export function useRemediationIntelligence(bpId: string | null, opts?: { autoFetch?: boolean }) {
  const [report, setReport] = useState<RemediationIntelligenceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoFetch = opts?.autoFetch !== false;

  const fetch = useCallback(async () => {
    if (!bpId) return null;
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get(`/api/portal/project/business-processes/${bpId}/remediation/intelligence`);
      setReport(r.data as RemediationIntelligenceReport);
      return r.data;
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to fetch remediation intelligence');
      return null;
    } finally {
      setLoading(false);
    }
  }, [bpId]);

  useEffect(() => {
    if (autoFetch && bpId) { void fetch(); }
  }, [autoFetch, bpId, fetch]);

  return { report, loading, error, refresh: fetch };
}
