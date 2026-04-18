import React, { useEffect, useState, useCallback } from 'react';
import api from '../../utils/api';
import Breadcrumb from '../../components/ui/Breadcrumb';

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

function typeBadge(t: string) {
  switch (t) {
    case 'suggest_routing_rule':     return 'bg-info';
    case 'suggest_field_map_entry':  return 'bg-warning text-dark';
    default:                         return 'bg-secondary';
  }
}

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
    <div className="container-fluid py-4">
      <Breadcrumb items={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Autonomous Insights' }]} />

      <div className="d-flex justify-content-between align-items-start mb-4">
        <div>
          <h1 className="h3 mb-1">Autonomous Ingest Insights</h1>
          <p className="text-muted mb-0 small">
            Suggestions the system generates from live ingest data — refreshed every 6 hours.
            Auto-apply is <strong className={autoapply ? 'text-success' : 'text-secondary'}>{autoapply ? 'ON' : 'OFF'}</strong>.
          </p>
        </div>
        <button className="btn btn-sm btn-outline-primary" onClick={refresh}>
          Refresh now
        </button>
      </div>

      {error && <div className="alert alert-danger py-2">{error}</div>}
      {info && <div className="alert alert-success py-2">{info}</div>}

      <h2 className="h5 mb-3">Pending ({pending.length})</h2>
      {pending.length === 0 ? (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-body text-center text-muted py-5 small">No pending suggestions.</div>
        </div>
      ) : (
        <div className="row g-3 mb-4">
          {pending.map(ins => (
            <div key={ins.id} className="col-md-6">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-header bg-white d-flex justify-content-between align-items-center">
                  <span className={`badge ${typeBadge(ins.type)}`}>{ins.type.replace('suggest_', '')}</span>
                  <span className="text-muted small">{new Date(ins.generated_at).toLocaleString()}</span>
                </div>
                <div className="card-body">
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
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <>
          <h2 className="h5 mb-3">Applied ({history.length})</h2>
          <div className="card border-0 shadow-sm">
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
                      <td><span className={`badge ${typeBadge(h.type)}`}>{h.type.replace('suggest_', '')}</span></td>
                      <td>{h.title}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
