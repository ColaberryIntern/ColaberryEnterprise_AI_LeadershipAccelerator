import React, { useEffect, useState, useCallback } from 'react';
import api from '../../utils/api';
import Breadcrumb from '../../components/ui/Breadcrumb';

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

function statusBadge(status: string) {
  switch (status) {
    case 'accepted': return 'bg-success';
    case 'rejected': return 'bg-warning text-dark';
    case 'error':    return 'bg-danger';
    case 'pending':  return 'bg-secondary';
    default:         return 'bg-secondary';
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
    return <div className="container-fluid py-4"><div className="alert alert-danger">{error || 'No data'}</div></div>;
  }

  const counts = stats.status_counts_24h;
  const leadsBySource = stats.leads_by_source[window];

  return (
    <div className="container-fluid py-4">
      <Breadcrumb items={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Ingest Logs' }]} />

      <div className="mb-4">
        <h1 className="h3 mb-1">Ingest Activity</h1>
        <p className="text-muted mb-0 small">Live tail of incoming lead ingestion across all sources. Auto-refreshes every 10 seconds.</p>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-md-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <div className="text-muted small fw-medium">Accepted (24h)</div>
              <div className="h3 mb-0 text-success">{counts.accepted ?? 0}</div>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <div className="text-muted small fw-medium">Rejected (24h)</div>
              <div className="h3 mb-0 text-warning">{counts.rejected ?? 0}</div>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <div className="text-muted small fw-medium">Errors (24h)</div>
              <div className="h3 mb-0 text-danger">{counts.error ?? 0}</div>
            </div>
          </div>
        </div>
        <div className="col-md-3">
          <div className="card border-0 shadow-sm">
            <div className="card-body">
              <div className="text-muted small fw-medium">Pending (24h)</div>
              <div className="h3 mb-0 text-secondary">{counts.pending ?? 0}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-lg-6">
          <div className="card border-0 shadow-sm h-100">
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
          </div>
        </div>
        <div className="col-lg-6">
          <div className="card border-0 shadow-sm h-100">
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
          </div>
        </div>
      </div>

      <div className="card border-0 shadow-sm">
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
                  <td><span className={`badge ${statusBadge(row.status)}`}>{row.status}</span></td>
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
      </div>
    </div>
  );
}
