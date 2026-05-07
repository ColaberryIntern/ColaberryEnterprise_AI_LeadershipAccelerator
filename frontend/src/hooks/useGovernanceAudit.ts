import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface GovernanceAuditEntry {
  id: string;
  project_id: string;
  kind: string;
  subject_id: string | null;
  payload: any;
  operator_id: string | null;
  recorded_at: string;
}

export function useGovernanceAudit(opts?: { autoFetch?: boolean; kindFilter?: string; limit?: number }) {
  const autoFetch = opts?.autoFetch !== false;
  const [entries, setEntries] = useState<GovernanceAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (opts?.kindFilter) params.set('kind', opts.kindFilter);
      if (opts?.limit) params.set('limit', String(opts.limit));
      const url = `/api/portal/project/governance/audit${params.toString() ? `?${params.toString()}` : ''}`;
      const r = await portalApi.get(url);
      setEntries((r.data?.entries || []) as GovernanceAuditEntry[]);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, [opts?.kindFilter, opts?.limit]);

  useEffect(() => { if (autoFetch) void refresh(); }, [autoFetch, refresh]);

  return { entries, loading, error, refresh };
}
