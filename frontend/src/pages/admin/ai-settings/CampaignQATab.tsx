import React, { useState, useEffect, useCallback } from 'react';
import api from '../../../utils/api';
import CampaignTestReportModal from './CampaignTestReportModal';

interface QASummary {
  campaigns_tested_today: number;
  pass_rate: number;
  failures_today: number;
  avg_score: number;
  recent_runs: TestRun[];
  campaigns_by_status: Record<string, number>;
}

interface TestRun {
  id: string;
  campaign_id: string;
  started_at: string;
  completed_at: string | null;
  status: 'running' | 'passed' | 'failed' | 'partial';
  score: number | null;
  initiated_by: string;
  summary: {
    steps_passed: number;
    steps_failed: number;
    channels_tested: string[];
    duration_ms: number;
  } | null;
  campaign?: { name: string; status: string; type: string };
}

const SCORE_COLORS: Record<string, string> = {
  passed: 'success',
  failed: 'danger',
  partial: 'warning',
  running: 'primary',
};

const QA_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  untested: { label: 'Untested', color: 'secondary' },
  testing: { label: 'Testing', color: 'primary' },
  passed: { label: 'Passed QA', color: 'success' },
  failed: { label: 'Failed QA', color: 'danger' },
  ready_for_live: { label: 'Ready for Live', color: 'success' },
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function CampaignQATab() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<QASummary | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      const { data } = await api.get('/api/admin/testing/summary');
      setSummary(data);
    } catch (err) {
      console.error('Failed to fetch QA summary:', err);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchSummary().finally(() => setLoading(false));
  }, [fetchSummary]);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading Campaign QA...</span>
        </div>
      </div>
    );
  }

  if (!summary) {
    return <p className="text-muted">Failed to load QA data.</p>;
  }

  const kpi = (label: string, value: string | number, color: string) => (
    <div className="col-6 col-md-3" key={label}>
      <div className="card border-0 shadow-sm">
        <div className="card-body text-center py-3">
          <div className="small text-muted mb-1">{label}</div>
          <div className="h4 fw-bold mb-0" style={{ color }}>
            {value}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* KPI Row */}
      <div className="row g-3 mb-4">
        {kpi('Tested Today', summary.campaigns_tested_today, 'var(--color-primary)')}
        {kpi('Pass Rate', `${summary.pass_rate}%`, summary.pass_rate >= 80 ? 'var(--color-accent)' : summary.pass_rate >= 50 ? '#e0a800' : 'var(--color-secondary)')}
        {kpi('Failures', summary.failures_today, summary.failures_today > 0 ? 'var(--color-secondary)' : 'var(--color-accent)')}
        {kpi('Avg Score', summary.avg_score, summary.avg_score >= 80 ? 'var(--color-accent)' : summary.avg_score >= 50 ? '#e0a800' : 'var(--color-secondary)')}
      </div>

      <div className="row g-3">
        {/* Campaign QA Status Breakdown */}
        <div className="col-lg-4">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white fw-semibold">QA Status Breakdown</div>
            <div className="card-body">
              {Object.keys(summary.campaigns_by_status).length === 0 ? (
                <p className="text-muted mb-0">No active campaigns</p>
              ) : (
                <div className="d-flex flex-column gap-2">
                  {Object.entries(summary.campaigns_by_status).map(([status, count]) => {
                    const info = QA_STATUS_LABELS[status] || { label: status, color: 'secondary' };
                    return (
                      <div key={status} className="d-flex justify-content-between align-items-center">
                        <span className={`badge bg-${info.color}`}>{info.label}</span>
                        <span className="fw-bold">{count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recent Test Runs */}
        <div className="col-lg-8">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white fw-semibold">
              Recent Test Runs
            </div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-hover mb-0 small">
                  <thead className="table-light">
                    <tr>
                      <th>Campaign</th>
                      <th>Score</th>
                      <th>Status</th>
                      <th>Steps</th>
                      <th>Channels</th>
                      <th>Duration</th>
                      <th>Initiated</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.recent_runs.map((run) => (
                      <tr
                        key={run.id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedRunId(run.id)}
                      >
                        <td className="fw-medium">
                          {run.campaign?.name || run.campaign_id.substring(0, 8)}
                        </td>
                        <td>
                          {run.score != null ? (
                            <span className={`badge bg-${run.score >= 80 ? 'success' : run.score >= 50 ? 'warning' : 'danger'}`}>
                              {run.score}
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td>
                          <span className={`badge bg-${SCORE_COLORS[run.status] || 'secondary'}`}>
                            {run.status}
                          </span>
                        </td>
                        <td>
                          {run.summary ? (
                            <span>
                              <span className="text-success">{run.summary.steps_passed}</span>
                              {' / '}
                              <span className="text-danger">{run.summary.steps_failed}</span>
                            </span>
                          ) : '—'}
                        </td>
                        <td>
                          {run.summary?.channels_tested?.length ? (
                            <div className="d-flex gap-1">
                              {run.summary.channels_tested.map((ch) => (
                                <span key={ch} className="badge bg-info">{ch}</span>
                              ))}
                            </div>
                          ) : '—'}
                        </td>
                        <td className="text-muted">
                          {run.summary?.duration_ms != null
                            ? run.summary.duration_ms < 1000
                              ? `${run.summary.duration_ms}ms`
                              : `${(run.summary.duration_ms / 1000).toFixed(1)}s`
                            : '—'}
                        </td>
                        <td>
                          <span className={`badge bg-${run.initiated_by === 'qa_agent' ? 'warning' : 'primary'}`}>
                            {run.initiated_by === 'qa_agent' ? 'Auto' : 'Manual'}
                          </span>
                        </td>
                        <td className="text-muted">{timeAgo(run.completed_at || run.started_at)}</td>
                      </tr>
                    ))}
                    {summary.recent_runs.length === 0 && (
                      <tr>
                        <td colSpan={8} className="text-muted text-center py-4">
                          No test runs yet. Run a campaign test from the Campaign Detail page.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Test Report Modal */}
      {selectedRunId && (
        <CampaignTestReportModal
          runId={selectedRunId}
          onClose={() => setSelectedRunId(null)}
        />
      )}
    </>
  );
}

export default CampaignQATab;
