import React, { useEffect, useState, useMemo } from 'react';
import api from '../../utils/api';
import { PageHeader, StatCard, StatusBadge, SectionCard } from '../../components/admin/shell';
import { TrustSignal, TrustLevel } from '../../components/admin/shell/trust';

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

  // Per-page trust signal (Basecamp todo 10027085963) derived from report health.
  const trust: TrustSignal = useMemo(() => {
    const { total, enabled, failing } = summary;
    const level: TrustLevel = failing > 0 ? 'stale' : enabled === total && total > 0 ? 'verified' : 'live';
    const score = total === 0 ? 0 : Math.round(((enabled - failing) / total) * 100);
    return {
      level, score, source: 'automated_reports table', updatedAt: new Date().toISOString(),
      summary: `${enabled}/${total} reports enabled, ${failing} failing.`, href: '/admin/trust',
      pillars: [
        { name: 'Coverage', status: 'live', score: total === 0 ? 0 : Math.round((enabled / total) * 100),
          evidence: [{ label: 'Enabled', value: `${enabled}/${total}` }] },
        { name: 'Health', status: failing > 0 ? 'error' : 'verified',
          evidence: [{ label: 'Failing runs', value: String(failing) }] },
      ],
    };
  }, [summary]);

  return (
    <>
      <PageHeader
        title="Automated Reports"
        icon="mail-send-line"
        subtitle="Schedule, prompts, recipients, and recent run history for every report sent on your behalf."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Automated Reports' }]}
        trust={trust}
        actions={
          <button className="btn btn-outline-primary btn-sm" onClick={loadList} disabled={loading}>
            <i className="ri-refresh-line" aria-hidden="true" /> Refresh
          </button>
        }
      >
        <div className="row g-3">
          <div className="col-6 col-lg-3">
            <StatCard label="Total" value={summary.total} icon="file-list-3-line" tone="info" />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="Enabled" value={summary.enabled} icon="checkbox-circle-line" tone="success" />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="Failing" value={summary.failing} icon="error-warning-line" tone={summary.failing ? 'danger' : 'neutral'} />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="Healthy" value={Math.max(0, summary.enabled - summary.failing)} icon="shield-check-line" tone="success" />
          </div>
        </div>
      </PageHeader>

      {loading && <div className="text-center py-5"><div className="spinner-border text-primary" /></div>}

      {!loading && reports.length === 0 && (
        <div className="alert alert-warning">
          No reports registered yet. Reports register themselves to <code>automated_reports</code> the first time they run.
        </div>
      )}

      {!loading && reports.length > 0 && (
        <div className="row g-3">
          <div className={selectedId ? 'col-lg-7' : 'col-12'}>
            <SectionCard padded={false}>
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0" style={{ fontSize: 13 }}>
                  <thead className="table-light">
                    <tr>
                      <th>Report</th>
                      <th>Schedule</th>
                      <th>Last Run</th>
                      <th>Status</th>
                      <th>On</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((r) => (
                      <tr key={r.id} style={{ background: selectedId === r.id ? 'var(--red-50)' : undefined }}>
                        <td>
                          <div className="fw-semibold">{r.name}</div>
                          <div className="text-muted" style={{ fontSize: 11 }}>{r.script_path || r.owner || ''}</div>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.cron_schedule || '—'}</td>
                        <td>{formatDate(r.last_run_at)}</td>
                        <td>
                          {r.last_status
                            ? <StatusBadge label={r.last_status} />
                            : <span className="text-muted">—</span>}
                        </td>
                        <td>
                          <button
                            className={`btn btn-sm ${r.enabled ? 'btn-success' : 'btn-outline-secondary'}`}
                            disabled={saving}
                            onClick={() => toggleEnabled(r.id, r.enabled)}
                          >
                            {r.enabled ? 'On' : 'Off'}
                          </button>
                        </td>
                        <td>
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
            </SectionCard>
          </div>

          {selectedId && detail && (
            <div className="col-lg-5">
              <SectionCard title={detail.report.name} subtitle={detail.report.description || undefined}>
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
                                  {run.status ? <StatusBadge label={run.status} /> : <span className="text-muted">—</span>}
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
              </SectionCard>
            </div>
          )}
        </div>
      )}
    </>
  );
}
