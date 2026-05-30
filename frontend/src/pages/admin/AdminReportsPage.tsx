import React, { useEffect, useState, useMemo } from 'react';
import api from '../../utils/api';

interface AutomatedReport {
  id: string;
  name: string;
  description: string | null;
  script_path: string | null;
  cron_schedule: string | null;
  recipients: string[] | null;
  subject_prefix: string | null;
  enabled: boolean;
  last_run_at: string | null;
  last_status: string | null;
  prompt: string | null;
  frequency: string | null;
  notes: string | null;
  owner: string | null;
  updated_at: string;
}

interface AutomatedReportRun {
  id: string;
  started_at: string;
  ended_at: string | null;
  status: string | null;
  message_ids: string[] | null;
  recipients_sent: string[] | null;
  error: string | null;
  triggered_by: string | null;
}

const formatDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'short', timeStyle: 'short' });
};

export default function AdminReportsPage() {
  const [reports, setReports] = useState<AutomatedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ report: AutomatedReport; runs: AutomatedReportRun[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [promptDraft, setPromptDraft] = useState<string>('');

  const loadList = () => {
    setLoading(true);
    api.get('/api/admin/automated-reports')
      .then((r) => setReports(r.data.reports || []))
      .catch(() => setReports([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadList(); }, []);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    api.get(`/api/admin/automated-reports/${selectedId}`)
      .then((r) => {
        setDetail(r.data);
        setPromptDraft(r.data.report.prompt || '');
      })
      .catch(() => setDetail(null));
  }, [selectedId]);

  const toggleEnabled = async (id: string, enabled: boolean) => {
    setSaving(true);
    try {
      await api.patch(`/api/admin/automated-reports/${id}`, { enabled: !enabled });
      loadList();
      if (selectedId === id && detail) setDetail({ ...detail, report: { ...detail.report, enabled: !enabled } });
    } finally { setSaving(false); }
  };

  const savePrompt = async () => {
    if (!detail) return;
    setSaving(true);
    try {
      await api.patch(`/api/admin/automated-reports/${detail.report.id}`, { prompt: promptDraft });
      setDetail({ ...detail, report: { ...detail.report, prompt: promptDraft } });
    } finally { setSaving(false); }
  };

  const summary = useMemo(() => {
    const total = reports.length;
    const enabled = reports.filter((r) => r.enabled).length;
    const failing = reports.filter((r) => r.last_status === 'failure' || r.last_status === 'error').length;
    return { total, enabled, failing };
  }, [reports]);

  return (
    <div className="container-fluid py-4" style={{ maxWidth: 1400 }}>
      <div className="d-flex justify-content-between align-items-end mb-4">
        <div>
          <h1 className="h3 mb-1" style={{ color: '#1a365d', fontWeight: 700 }}>Automated Reports</h1>
          <div className="text-muted" style={{ fontSize: 14 }}>
            Schedule, prompts, recipients, and recent run history for every report sent on your behalf.
          </div>
        </div>
        <div className="d-flex gap-3">
          <div className="text-center px-3 py-2 rounded" style={{ background: '#f1f5f9' }}>
            <div className="h4 mb-0" style={{ color: '#1a365d' }}>{summary.total}</div>
            <div className="text-muted" style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>Total</div>
          </div>
          <div className="text-center px-3 py-2 rounded" style={{ background: '#dcfce7' }}>
            <div className="h4 mb-0" style={{ color: '#166534' }}>{summary.enabled}</div>
            <div className="text-muted" style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>Enabled</div>
          </div>
          <div className="text-center px-3 py-2 rounded" style={{ background: summary.failing ? '#fee2e2' : '#f1f5f9' }}>
            <div className="h4 mb-0" style={{ color: summary.failing ? '#991b1b' : '#1a365d' }}>{summary.failing}</div>
            <div className="text-muted" style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' }}>Failing</div>
          </div>
        </div>
      </div>

      {loading && <div className="text-center py-5"><div className="spinner-border text-primary" /></div>}

      {!loading && reports.length === 0 && (
        <div className="alert alert-warning">
          No reports registered yet. Reports register themselves to <code>automated_reports</code> the first time they run.
        </div>
      )}

      {!loading && reports.length > 0 && (
        <div className="row g-3">
          <div className={selectedId ? 'col-lg-7' : 'col-12'}>
            <div className="card border-0 shadow-sm">
              <div className="table-responsive">
                <table className="table mb-0" style={{ fontSize: 13 }}>
                  <thead style={{ background: '#1a365d', color: 'white' }}>
                    <tr>
                      <th style={{ padding: '12px 16px' }}>Report</th>
                      <th style={{ padding: '12px 16px' }}>Schedule</th>
                      <th style={{ padding: '12px 16px' }}>Last Run</th>
                      <th style={{ padding: '12px 16px' }}>Status</th>
                      <th style={{ padding: '12px 16px' }}>On</th>
                      <th style={{ padding: '12px 16px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((r) => (
                      <tr key={r.id} style={{ background: selectedId === r.id ? '#eff6ff' : undefined }}>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ fontWeight: 600, color: '#1a365d' }}>{r.name}</div>
                          <div className="text-muted" style={{ fontSize: 11 }}>{r.script_path || r.owner || ''}</div>
                        </td>
                        <td style={{ padding: '14px 16px', fontFamily: 'monospace', fontSize: 12 }}>{r.cron_schedule || '—'}</td>
                        <td style={{ padding: '14px 16px' }}>{formatDate(r.last_run_at)}</td>
                        <td style={{ padding: '14px 16px' }}>
                          {r.last_status === 'success' && <span className="badge bg-success">success</span>}
                          {(r.last_status === 'failure' || r.last_status === 'error') && <span className="badge bg-danger">{r.last_status}</span>}
                          {!r.last_status && <span className="text-muted">—</span>}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <button
                            className={`btn btn-sm ${r.enabled ? 'btn-success' : 'btn-outline-secondary'}`}
                            disabled={saving}
                            onClick={() => toggleEnabled(r.id, r.enabled)}
                          >
                            {r.enabled ? 'On' : 'Off'}
                          </button>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <button
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => setSelectedId(selectedId === r.id ? null : r.id)}
                          >
                            {selectedId === r.id ? 'Close' : 'Details'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {selectedId && detail && (
            <div className="col-lg-5">
              <div className="card border-0 shadow-sm">
                <div className="card-header" style={{ background: '#1a365d', color: 'white' }}>
                  <div style={{ fontWeight: 700 }}>{detail.report.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.85 }}>{detail.report.description || ''}</div>
                </div>
                <div className="card-body">
                  <div className="mb-3">
                    <div className="text-muted" style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600 }}>Recipients</div>
                    <div style={{ fontSize: 13 }}>{(detail.report.recipients || []).join(', ') || '—'}</div>
                  </div>
                  <div className="mb-3">
                    <div className="text-muted" style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600 }}>Prompt / Notes</div>
                    <textarea
                      className="form-control"
                      rows={6}
                      style={{ fontSize: 12, fontFamily: 'monospace' }}
                      value={promptDraft}
                      onChange={(e) => setPromptDraft(e.target.value)}
                    />
                    <div className="d-flex gap-2 mt-2">
                      <button className="btn btn-sm btn-primary" disabled={saving} onClick={savePrompt}>Save prompt</button>
                      <button className="btn btn-sm btn-link" onClick={() => setPromptDraft(detail.report.prompt || '')}>Reset</button>
                    </div>
                  </div>
                  <div>
                    <div className="text-muted mb-2" style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 600 }}>Recent runs</div>
                    {detail.runs.length === 0 && <div className="text-muted" style={{ fontSize: 13 }}>No run history recorded yet.</div>}
                    {detail.runs.length > 0 && (
                      <div className="table-responsive" style={{ maxHeight: 320, overflowY: 'auto' }}>
                        <table className="table table-sm" style={{ fontSize: 12 }}>
                          <thead>
                            <tr>
                              <th>Started</th>
                              <th>Status</th>
                              <th>Recipients</th>
                              <th>Trigger</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detail.runs.map((run) => (
                              <tr key={run.id}>
                                <td>{formatDate(run.started_at)}</td>
                                <td>
                                  {run.status === 'success' && <span className="badge bg-success">success</span>}
                                  {(run.status === 'failure' || run.status === 'error') && <span className="badge bg-danger">{run.status}</span>}
                                  {!run.status && <span className="text-muted">—</span>}
                                </td>
                                <td>{(run.recipients_sent || []).length}</td>
                                <td>{run.triggered_by || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
