import React, { useEffect, useState, useCallback, useMemo } from 'react';
import api from '../../utils/api';
import { PageHeader, StatCard, StatusBadge, SectionCard } from '../../components/admin/shell';
import { TrustSignal } from '../../components/admin/shell/trust';

interface IngestInsight {
  id: string;
  type: 'suggest_routing_rule' | 'suggest_field_map_entry' | 'info';
  title: string;
  description: string;
  suggested_config: Record<string, any> | null;
  evidence: Record<string, any>;
  generated_at: string;
  applied: boolean;
}

type BadgeTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'primary';

// Insight type -> semantic tone for the StatusBadge pill (replaces hardcoded bg-* classes).
function typeTone(t: string): BadgeTone {
  switch (t) {
    case 'suggest_routing_rule':    return 'info';
    case 'suggest_field_map_entry': return 'warning';
    default:                        return 'neutral';
  }
}

const typeLabel = (t: string) => t.replace('suggest_', '');

export default function AdminAutonomousPage() {
  const [insights, setInsights] = useState<IngestInsight[]>([]);
  const [autoapply, setAutoapply] = useState(false);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const fetchInsights = useCallback(async () => {
    try {
      const res = await api.get('/api/admin/autonomous/insights');
      setInsights(res.data.insights || []);
      setAutoapply(!!res.data.autoapply);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load insights');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchInsights(); }, [fetchInsights]);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/api/admin/autonomous/insights/refresh');
      setInsights(res.data.insights || []);
      setInfo('Insights refreshed.');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Refresh failed');
    } finally {
      setLoading(false);
    }
  };

  const apply = async (id: string) => {
    setApplying(id);
    setError(null);
    setInfo(null);
    try {
      const res = await api.post(`/api/admin/autonomous/insights/${id}/apply`);
      setInfo(`Applied. ${JSON.stringify(res.data.result)}`);
      fetchInsights();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Apply failed');
    } finally {
      setApplying(null);
    }
  };

  const summary = useMemo(() => {
    const total = insights.length;
    const pending = insights.filter((i) => !i.applied).length;
    const applied = total - pending;
    return { total, pending, applied };
  }, [insights]);

  // Per-page trust signal — this surface is generated live from ingest telemetry.
  const trust: TrustSignal = useMemo(() => ({
    level: 'live',
    source: 'autonomous ops',
    updatedAt: new Date().toISOString(),
    summary: `${summary.pending} pending suggestion${summary.pending === 1 ? '' : 's'}, ${summary.applied} applied. Auto-apply ${autoapply ? 'ON' : 'OFF'}.`,
    href: '/admin/trust',
    pillars: [
      {
        name: 'Freshness',
        status: 'live',
        evidence: [{ label: 'Window', value: 'refreshed every 6h' }],
      },
    ],
  }), [summary, autoapply]);

  if (loading && insights.length === 0) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  const pending = insights.filter(i => !i.applied);
  const history = insights.filter(i => i.applied);

  return (
    <>
      <PageHeader
        title="Autonomous"
        icon="lightbulb-flash-line"
        subtitle="Suggestions the system generates from live ingest data, refreshed every 6 hours."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Autonomous' }]}
        trust={trust}
        actions={
          <button className="btn btn-outline-primary btn-sm" onClick={refresh} disabled={loading}>
            <i className="ri-refresh-line" aria-hidden="true" /> Refresh now
          </button>
        }
      >
        <div className="row g-3">
          <div className="col-6 col-lg-3">
            <StatCard label="Total" value={summary.total} icon="lightbulb-line" tone="info" />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="Pending" value={summary.pending} icon="time-line" tone={summary.pending ? 'warning' : 'neutral'} />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="Applied" value={summary.applied} icon="checkbox-circle-line" tone="success" />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="Auto-apply" value={autoapply ? 'On' : 'Off'} icon="flashlight-line" tone={autoapply ? 'success' : 'neutral'} />
          </div>
        </div>
      </PageHeader>

      {error && <div className="alert alert-danger py-2">{error}</div>}
      {info && <div className="alert alert-success py-2">{info}</div>}

      <h2 className="h5 mb-3">Pending ({pending.length})</h2>
      {pending.length === 0 ? (
        <SectionCard className="mb-4">
          <div className="text-center text-muted py-5 small">No pending suggestions.</div>
        </SectionCard>
      ) : (
        <div className="row g-3 mb-4">
          {pending.map(ins => (
            <div key={ins.id} className="col-md-6">
              <SectionCard className="h-100">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <StatusBadge label={typeLabel(ins.type)} tone={typeTone(ins.type)} />
                  <span className="text-muted small">{new Date(ins.generated_at).toLocaleString()}</span>
                </div>
                <h3 className="h6 fw-semibold">{ins.title}</h3>
                <p className="small text-muted">{ins.description}</p>
                {ins.suggested_config && (
                  <pre className="small bg-light border rounded p-2 mb-3" style={{ maxHeight: '160px', overflow: 'auto' }}>
                    {JSON.stringify(ins.suggested_config, null, 2)}
                  </pre>
                )}
                <button
                  className="btn btn-sm btn-primary"
                  disabled={applying === ins.id}
                  onClick={() => apply(ins.id)}>
                  {applying === ins.id ? 'Applying…' : 'Apply suggestion'}
                </button>
              </SectionCard>
            </div>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <>
          <h2 className="h5 mb-3">Applied ({history.length})</h2>
          <SectionCard padded={false}>
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="table-light">
                  <tr>
                    <th>When</th>
                    <th>Type</th>
                    <th>Title</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.id}>
                      <td className="small text-muted">{new Date(h.generated_at).toLocaleString()}</td>
                      <td><StatusBadge label={typeLabel(h.type)} tone={typeTone(h.type)} /></td>
                      <td>{h.title}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      )}
    </>
  );
}
