import { useCallback, useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';

export interface TelemetryHealthDimensions {
  manifest_freshness: number;
  missing_build_manifests: number;
  conflicting_manifests: number;
  undocumented_db_changes: number;
  ui_drift: number;
  graph_drift: number;
  missing_validation_telemetry: number;
}

export interface TelemetryHealthResponse {
  project_id: string;
  generated_at: string;
  sync_health_score: number;
  telemetry_dimensions: TelemetryHealthDimensions;
  freshness: {
    total: number;
    fresh: number; aging: number; stale: number; expired: number;
    score: number;
  };
  contradiction_count: number;
  contradictions_by_kind: Record<string, number>;
}

export function useTelemetryHealth(opts: { pollIntervalMs?: number } = {}) {
  const [data, setData] = useState<TelemetryHealthResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await portalApi.get('/api/portal/project/telemetry/health');
      setData(r.data as TelemetryHealthResponse);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to load telemetry health');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!opts.pollIntervalMs || opts.pollIntervalMs <= 0) return;
    const id = window.setInterval(() => { void refresh(); }, opts.pollIntervalMs);
    return () => window.clearInterval(id);
  }, [opts.pollIntervalMs, refresh]);

  return { data, loading, error, refresh };
}
