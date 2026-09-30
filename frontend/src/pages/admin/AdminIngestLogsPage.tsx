import React, { useEffect, useState, useCallback, useMemo } from 'react';
import api from '../../utils/api';
import { PageHeader, StatCard, StatusBadge, SectionCard } from '../../components/admin/shell';
import { TrustSignal, TrustLevel } from '../../components/admin/shell/trust';

interface IngestTailRow {
  id: string;
  source_slug: string | null;
  entry_slug: string | null;
  status: string;
  received_at: string;
  resulting_lead_id: number | null;
  error_message: string | null;
  lead_name: string | null;
  lead_email: string | null;
}

interface IngestStats {
  leads_by_source: {
    '24h': Array<{ source_slug: string; count: number }>;
    '7d': Array<{ source_slug: string; count: number }>;
    '30d': Array<{ source_slug: string; count: number }>;
  };
  conversion_by_entry_point: Array<{ source_slug: string; entry_slug: string; total: number; converted: number; conversion_rate: number }>;
  status_counts_24h: Record<string, number>;
  tail: IngestTailRow[];
}

// Map an ingest status to a StatusBadge tone (success / error->danger / pending->warning).
type BadgeTone = 'success' | 'danger' | 'warning' | 'neutral';
function statusTone(status: string): BadgeTone {
  switch (status) {
    case 'accepted': return 'success';
    case 'rejected': return 'warning';
    case 'error':    return 'danger';
    case 'pending':  return 'neutral';
    default:         return 'neutral';
  }
}

export default function AdminIngestLogsPage() {
  const [stats, setStats] = useState<IngestStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [window, setWindow] = useState<'24h' | '7d' | '30d'>('24h');

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/api/admin/dashboard/ingest-stats');
      setStats(res.data);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load ingest stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  // Per-page trust signal (Basecamp todo 10027085963) derived from live ingest health.
  const trust: TrustSignal = useMemo(() => {
    const counts = stats?.status_counts_24h ?? {};
    const accepted = counts.accepted ?? 0;
    const errors = counts.error ?? 0;
    const level: TrustLevel = errors > 0 ? 'stale' : accepted > 0 ? 'live' : 'unverified';
    return {
      level,
      source: 'ingest logs',
      updatedAt: new Date().toISOString(),
      summary: `${accepted} accepted, ${errors} errored in the last 24h.`,
      href: '/admin/trust',
      pillars: [
        {
          name: 'Ingestion',
          status: level,
          evidence: [
            { label: 'Accepted (24h)', value: String(accepted) },
            { label: 'Errors (24h)', value: String(errors) },
          ],
        },
      ],
    };
  }, [stats]);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return <div className="alert alert-danger">{error || 'No data'}</div>;
  }

  const counts = stats.status_counts_24h;
  const leadsBySource = stats.leads_by_source[window];

  return (
    <>
      <PageHeader
        title="Ingest Logs"
        icon="file-list-3-line"
        subtitle="Live tail of incoming lead ingestion across all sources. Auto-refreshes every 10 seconds."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Ingest Logs' }]}
        trust={trust}
        actions={
          <button className="btn btn-outline-primary btn-sm" onClick={fetchStats} disabled={loading}>
            <i className="ri-refresh-line" aria-hidden="true" /> Refresh
          </button>
        }
      >
        <div className="row g-3">
          <div className="col-6 col-lg-3">
            <StatCard label="Accepted (24h)" value={counts.accepted ?? 0} icon="checkbox-circle-line" tone="success" />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="Rejected (24h)" value={counts.rejected ?? 0} icon="error-warning-line" tone="warning" />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="Errors (24h)" value={counts.error ?? 0} icon="close-circle-line" tone={counts.error ? 'danger' : 'neutral'} />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="Pending (24h)" value={counts.pending ?? 0} icon="time-line" tone="neutral" />
          </div>
        </div>
      </PageHeader>

      <div className="row g-3 mb-4">
        <div className="col-lg-6">
          <SectionCard padded={false}>
            <div className="card-header bg-white d-flex justify-content-between align-items-center">
              <span className="fw-semibold">Leads by source</span>
              <div className="btn-group" role="group">
                {(['24h', '7d', '30d'] as const).map(w => (
                  <button key={w} type="button"
                    className={`btn btn-sm ${window === w ? 'btn-primary' : 'btn-outline-secondary'}`}
                    onClick={() => setWindow(w)}>{w}</button>
                ))}
              </div>
            </div>
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="table-light">
                  <tr><th>Source</th><th className="text-end">Accepted leads</th></tr>
                </thead>
                <tbody>
                  {leadsBySource.length === 0 ? (
                    <tr><td colSpan={2} className="text-muted text-center py-3">No accepted leads in window.</td></tr>
                  ) : leadsBySource.map(r => (
                    <tr key={r.source_slug}>
                      <td><code>{r.source_slug}</code></td>
                      <td className="text-end fw-medium">{r.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
        <div className="col-lg-6">
          <SectionCard padded={false}>
            <div className="card-header bg-white fw-semibold">Conversion by entry point</div>
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Source</th><th>Entry</th>
                    <th className="text-end">Total</th>
                    <th className="text-end">Converted</th>
                    <th className="text-end">Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.conversion_by_entry_point.length === 0 ? (
                    <tr><td colSpan={5} className="text-muted text-center py-3">No data yet.</td></tr>
                  ) : stats.conversion_by_entry_point.map((r, i) => (
                    <tr key={`${r.source_slug}-${r.entry_slug}-${i}`}>
                      <td><code>{r.source_slug}</code></td>
                      <td><code>{r.entry_slug}</code></td>
                      <td className="text-end">{r.total}</td>
                      <td className="text-end">{r.converted}</td>
                      <td className="text-end fw-medium">{r.conversion_rate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>
      </div>

      <SectionCard padded={false}>
        <div className="card-header bg-white fw-semibold">Live tail (latest 25)</div>
        <div className="table-responsive">
          <table className="table table-hover mb-0">
            <thead className="table-light">
              <tr>
                <th>Received</th>
                <th>Source / Entry</th>
                <th>Status</th>
                <th>Lead</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {stats.tail.map(row => (
                <tr key={row.id}>
                  <td className="small text-muted">{new Date(row.received_at).toLocaleString()}</td>
                  <td className="small"><code>{row.source_slug || '-'}</code> / <code>{row.entry_slug || '-'}</code></td>
                  <td><StatusBadge label={row.status} tone={statusTone(row.status)} /></td>
                  <td className="small">
                    {row.lead_name ? <span className="fw-medium">{row.lead_name}</span> : <span className="text-muted">-</span>}
                    {row.lead_email && <span className="text-muted"> ({row.lead_email})</span>}
                  </td>
                  <td className="small text-muted">{row.error_message || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </>
  );
}
