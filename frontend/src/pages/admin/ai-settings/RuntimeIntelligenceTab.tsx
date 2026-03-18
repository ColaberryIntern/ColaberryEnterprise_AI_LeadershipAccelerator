import React, { useState, useCallback, useEffect } from 'react';
import api from '../../../utils/api';

// ─── Types ──────────────────────────────────────────────────────────

interface VariableFailureReport {
  variable_key: string;
  times_missing: number;
  failure_rate: number;
}

interface PromptStabilityReport {
  lesson_id: string;
  lesson_title: string;
  total_executions: number;
  failure_rate: number;
  avg_quality_score: number | null;
  is_unstable: boolean;
}

interface HealthTrendPoint {
  date: string;
  total_executions: number;
  success_rate: number;
  avg_quality: number | null;
  failure_count: number;
}

interface Recommendation {
  type: 'variable_fix' | 'prompt_improvement' | 'sequence_issue' | 'latency_alert';
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  entity_id?: string;
  evidence: Record<string, any>;
}

interface RuntimeDashboard {
  overall: {
    total_executions: number;
    success_rate: number;
    avg_quality: number | null;
    avg_latency_ms: number;
    failed_count: number;
    failure_rate: number;
  };
  variable_failures: VariableFailureReport[];
  unstable_prompts: PromptStabilityReport[];
  trend: HealthTrendPoint[];
}

// ─── Helpers ────────────────────────────────────────────────────────

function rateColor(rate: number, inverse = false): string {
  if (inverse) return rate > 80 ? 'success' : rate > 50 ? 'warning' : 'danger';
  return rate < 20 ? 'success' : rate < 40 ? 'warning' : 'danger';
}

function severityColor(severity: string): string {
  return severity === 'high' ? 'danger' : severity === 'medium' ? 'warning' : 'info';
}

// ─── Component ──────────────────────────────────────────────────────

const RuntimeIntelligenceTab: React.FC = () => {
  const [dashboard, setDashboard] = useState<RuntimeDashboard | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashRes, recRes] = await Promise.all([
        api.get('/api/admin/orchestration/runtime-intelligence/dashboard'),
        api.get('/api/admin/orchestration/runtime-intelligence/recommendations'),
      ]);
      setDashboard(dashRes.data);
      setRecommendations(recRes.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to load runtime intelligence');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border spinner-border-sm text-primary" role="status">
          <span className="visually-hidden">Loading runtime intelligence...</span>
        </div>
        <div className="text-muted small mt-2">Loading runtime intelligence...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-danger">{error}</div>
    );
  }

  if (!dashboard) return null;

  const { overall, variable_failures, unstable_prompts, trend } = dashboard;
  const maxTrendExec = Math.max(...trend.map(t => t.total_executions), 1);

  return (
    <div>
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6 className="fw-semibold mb-0">Runtime Intelligence</h6>
        <button className="btn btn-sm btn-outline-secondary" onClick={fetchData}>
          Refresh
        </button>
      </div>

      {/* Panel 1: Execution Overview */}
      <div className="card border-0 shadow-sm mb-3">
        <div className="card-header bg-white fw-semibold">Execution Overview</div>
        <div className="card-body">
          <div className="row g-3 mb-3">
            <div className="col-md-3">
              <div className="text-muted small">Total Executions</div>
              <div className="fs-4 fw-bold">{overall.total_executions}</div>
            </div>
            <div className="col-md-3">
              <div className="text-muted small">Success Rate</div>
              <div className="fs-4 fw-bold">
                {overall.success_rate}%{' '}
                <span className={`badge bg-${rateColor(overall.success_rate, true)} ms-1`}>
                  {overall.success_rate >= 90 ? 'Healthy' : overall.success_rate >= 70 ? 'Fair' : 'At Risk'}
                </span>
              </div>
            </div>
            <div className="col-md-3">
              <div className="text-muted small">Avg Quality Score</div>
              <div className="fs-4 fw-bold">
                {overall.avg_quality !== null ? `${overall.avg_quality}/100` : '—'}
              </div>
            </div>
            <div className="col-md-3">
              <div className="text-muted small">Avg Latency</div>
              <div className="fs-4 fw-bold">{Math.round(overall.avg_latency_ms / 1000)}s</div>
            </div>
          </div>

          {/* Trend bars */}
          {trend.length > 0 && (
            <div>
              <div className="text-muted small mb-2">30-Day Execution Trend</div>
              <div className="d-flex align-items-end gap-1" style={{ height: 60 }}>
                {trend.map((t, i) => (
                  <div
                    key={i}
                    title={`${t.date}: ${t.total_executions} executions, ${t.success_rate}% success`}
                    style={{
                      flex: 1,
                      height: `${Math.max(4, (t.total_executions / maxTrendExec) * 100)}%`,
                      backgroundColor: t.success_rate >= 80 ? 'var(--color-accent)' : t.success_rate >= 50 ? '#f6ad55' : 'var(--color-secondary)',
                      borderRadius: 2,
                      minWidth: 4,
                    }}
                  />
                ))}
              </div>
            </div>
          )}

          {overall.total_executions === 0 && (
            <div className="text-muted text-center py-3">
              No executions recorded yet. Data will appear as students access lessons.
            </div>
          )}
        </div>
      </div>

      <div className="row g-3 mb-3">
        {/* Panel 2: Variable Health */}
        <div className="col-md-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white fw-semibold">Variable Health</div>
            <div className="card-body p-0">
              {variable_failures.length === 0 ? (
                <div className="text-muted text-center py-4 small">No variable failures detected</div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead className="table-light">
                      <tr>
                        <th className="small fw-medium">Variable</th>
                        <th className="small fw-medium text-end">Missing</th>
                        <th className="small fw-medium text-end">Failure Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {variable_failures.map(v => (
                        <tr key={v.variable_key}>
                          <td className="small"><code>{`{{${v.variable_key}}}`}</code></td>
                          <td className="small text-end">{v.times_missing}</td>
                          <td className="small text-end">
                            <span className={`badge bg-${rateColor(v.failure_rate)}`}>
                              {v.failure_rate}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Panel 3: Prompt Stability */}
        <div className="col-md-6">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-header bg-white fw-semibold">Prompt Stability</div>
            <div className="card-body p-0">
              {unstable_prompts.length === 0 ? (
                <div className="text-muted text-center py-4 small">All prompts are stable</div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead className="table-light">
                      <tr>
                        <th className="small fw-medium">Lesson</th>
                        <th className="small fw-medium text-end">Runs</th>
                        <th className="small fw-medium text-end">Fail %</th>
                        <th className="small fw-medium text-end">Avg Quality</th>
                      </tr>
                    </thead>
                    <tbody>
                      {unstable_prompts.map(p => (
                        <tr key={p.lesson_id} className="table-warning">
                          <td className="small text-truncate" style={{ maxWidth: 200 }} title={p.lesson_title}>
                            {p.lesson_title}
                          </td>
                          <td className="small text-end">{p.total_executions}</td>
                          <td className="small text-end">
                            <span className={`badge bg-${rateColor(p.failure_rate)}`}>{p.failure_rate}%</span>
                          </td>
                          <td className="small text-end">
                            {p.avg_quality_score !== null ? p.avg_quality_score : '—'}
                          </td>
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

      {/* Panel 4: Recommendations */}
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-semibold">
          Recommendations
          {recommendations.length > 0 && (
            <span className="badge bg-secondary ms-2">{recommendations.length}</span>
          )}
        </div>
        <div className="card-body p-0">
          {recommendations.length === 0 ? (
            <div className="text-muted text-center py-4 small">No recommendations — system is healthy</div>
          ) : (
            <ul className="list-group list-group-flush">
              {recommendations.map((rec, i) => (
                <li
                  key={i}
                  className={`list-group-item border-start border-3 border-${severityColor(rec.severity)}`}
                >
                  <div className="d-flex justify-content-between align-items-start">
                    <div>
                      <div className="fw-medium small">{rec.title}</div>
                      <div className="text-muted small mt-1">{rec.description}</div>
                    </div>
                    <span className={`badge bg-${severityColor(rec.severity)} ms-2`}>
                      {rec.severity}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default RuntimeIntelligenceTab;
