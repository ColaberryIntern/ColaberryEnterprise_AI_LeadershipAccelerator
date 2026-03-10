import React, { useState, useEffect, useCallback } from 'react';
import api from '../../utils/api';
import AgentRegistryTab from './ai-settings/AgentRegistryTab';
import ActivityDetailModal from './ai-settings/ActivityDetailModal';
import ExecutionTraceModal from './ai-settings/ExecutionTraceModal';
import ErrorDetailModal from './ai-settings/ErrorDetailModal';
import CampaignTimelineModal from './ai-settings/CampaignTimelineModal';

interface Agent {
  id: string;
  agent_name: string;
  agent_type: string;
  status: string;
  config: Record<string, any>;
  last_run_at: string | null;
  last_result: Record<string, any> | null;
}

interface HealthRecord {
  id: string;
  campaign_id: string;
  health_score: number;
  status: string;
  lead_count: number;
  active_lead_count: number;
  sent_count: number;
  error_count: number;
  components: Record<string, { ok: boolean; error?: string }>;
  metrics: Record<string, number>;
  last_scan_at: string | null;
  campaign?: { name: string; status: string; type: string };
}

interface CampaignErrorRecord {
  id: string;
  campaign_id: string;
  component: string;
  severity: string;
  error_message: string;
  context: Record<string, any> | null;
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
  campaign?: { name: string; status: string };
}

interface ActivityRecord {
  id: string;
  agent_id: string;
  campaign_id: string | null;
  action: string;
  reason: string | null;
  confidence: number | null;
  before_state: Record<string, any> | null;
  after_state: Record<string, any> | null;
  result: string;
  details: Record<string, any> | null;
  trace_id: string | null;
  duration_ms: number | null;
  created_at: string;
  agent?: { agent_name: string; agent_type: string };
}

interface Overview {
  active_agents: number;
  total_agents: number;
  running: number;
  idle: number;
  paused: number;
  disabled: number;
  errored: number;
  avg_health_score: number;
  unresolved_errors: number;
  actions_today: number;
  repairs_today: number;
  campaigns_scanned: number;
  agents_summary: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
    category: string;
    enabled: boolean;
    last_run_at: string | null;
    run_count: number;
    error_count: number;
  }>;
}

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'registry', label: 'Agent Registry' },
  { key: 'activity', label: 'Activity' },
  { key: 'health', label: 'Health Monitor' },
  { key: 'errors', label: 'Error Center' },
  { key: 'controls', label: 'Controls' },
];

const SEVERITY_COLORS: Record<string, string> = {
  info: 'info',
  warning: 'warning',
  error: 'danger',
  critical: 'danger',
};

const HEALTH_COLORS: Record<string, string> = {
  healthy: 'success',
  degraded: 'warning',
  critical: 'danger',
  unknown: 'secondary',
};

const STATUS_COLORS: Record<string, string> = {
  idle: 'secondary',
  running: 'primary',
  paused: 'warning',
  error: 'danger',
};

const CATEGORY_COLORS: Record<string, string> = {
  outbound: 'primary',
  behavioral: 'info',
  maintenance: 'secondary',
  ai_ops: 'warning',
  accelerator: 'success',
};

const RESULT_COLORS: Record<string, string> = {
  success: 'success',
  failed: 'danger',
  skipped: 'secondary',
  pending: 'warning',
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

function AdminAISettingsPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [health, setHealth] = useState<HealthRecord[]>([]);
  const [errors, setErrors] = useState<CampaignErrorRecord[]>([]);
  const [errorsTotal, setErrorsTotal] = useState(0);
  const [activity, setActivity] = useState<ActivityRecord[]>([]);
  const [activityTotal, setActivityTotal] = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Modal state
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [selectedErrorId, setSelectedErrorId] = useState<string | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    try {
      const { data } = await api.get('/api/admin/ai-ops/overview');
      setOverview(data);
    } catch (err) {
      console.error('Failed to fetch AI ops overview:', err);
    }
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      const { data } = await api.get('/api/admin/ai-ops/agents');
      setAgents(data);
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    }
  }, []);

  const fetchHealth = useCallback(async () => {
    try {
      const { data } = await api.get('/api/admin/ai-ops/health');
      setHealth(data);
    } catch (err) {
      console.error('Failed to fetch health:', err);
    }
  }, []);

  const fetchErrors = useCallback(async () => {
    try {
      const { data } = await api.get('/api/admin/ai-ops/errors', {
        params: { resolved: 'false', limit: 50 },
      });
      setErrors(data.items);
      setErrorsTotal(data.total);
    } catch (err) {
      console.error('Failed to fetch errors:', err);
    }
  }, []);

  const fetchActivity = useCallback(async () => {
    try {
      const { data } = await api.get('/api/admin/ai-ops/activity', {
        params: { limit: 50 },
      });
      setActivity(data.items);
      setActivityTotal(data.total);
    } catch (err) {
      console.error('Failed to fetch activity:', err);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      fetchOverview(),
      fetchAgents(),
      fetchHealth(),
      fetchErrors(),
      fetchActivity(),
    ]).finally(() => setLoading(false));
  }, [fetchOverview, fetchAgents, fetchHealth, fetchErrors, fetchActivity]);

  const handleRunAgent = async (agentId: string) => {
    setActionLoading(agentId);
    try {
      await api.post(`/api/admin/ai-ops/agents/${agentId}/run`);
      await Promise.allSettled([fetchOverview(), fetchAgents(), fetchActivity(), fetchHealth()]);
    } catch (err) {
      console.error('Failed to run agent:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleAgent = async (agent: Agent) => {
    const newStatus = agent.status === 'paused' ? 'idle' : 'paused';
    try {
      await api.patch(`/api/admin/ai-ops/agents/${agent.id}`, { status: newStatus });
      await fetchAgents();
    } catch (err) {
      console.error('Failed to toggle agent:', err);
    }
  };

  const handleScanAll = async () => {
    setActionLoading('scan');
    try {
      await api.post('/api/admin/ai-ops/health/scan');
      await Promise.allSettled([fetchHealth(), fetchOverview(), fetchErrors()]);
    } catch (err) {
      console.error('Failed to trigger scan:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleResolveError = async (errorId: string) => {
    try {
      await api.patch(`/api/admin/ai-ops/errors/${errorId}/resolve`);
      await fetchErrors();
    } catch (err) {
      console.error('Failed to resolve error:', err);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading AI Operations...</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="mb-1 fw-bold" style={{ color: 'var(--color-primary)' }}>
            AI Operations
          </h4>
          <p className="text-muted small mb-0">
            Full observability and control across all {overview?.total_agents || 0} autonomous agents
          </p>
        </div>
      </div>

      {/* Tabs */}
      <ul className="nav nav-tabs mb-4">
        {TABS.map((tab) => (
          <li className="nav-item" key={tab.key}>
            <button
              className={`nav-link${activeTab === tab.key ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              {tab.key === 'errors' && errorsTotal > 0 && (
                <span className="badge bg-danger ms-2">{errorsTotal}</span>
              )}
              {tab.key === 'registry' && overview && (
                <span className="badge bg-secondary ms-2">{overview.total_agents}</span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab
          overview={overview}
          health={health}
          onScan={handleScanAll}
          scanLoading={actionLoading === 'scan'}
        />
      )}
      {activeTab === 'registry' && <AgentRegistryTab />}
      {activeTab === 'activity' && (
        <ActivityTab
          activity={activity}
          total={activityTotal}
          onViewDetail={setSelectedActivityId}
          onViewTrace={setSelectedTraceId}
        />
      )}
      {activeTab === 'health' && (
        <HealthTab
          health={health}
          onScan={handleScanAll}
          scanLoading={actionLoading === 'scan'}
          onViewTimeline={setSelectedCampaignId}
        />
      )}
      {activeTab === 'errors' && (
        <ErrorsTab
          errors={errors}
          onResolve={handleResolveError}
          onViewDetail={setSelectedErrorId}
        />
      )}
      {activeTab === 'controls' && (
        <ControlsTab
          agents={agents}
          onRunAgent={handleRunAgent}
          onToggleAgent={handleToggleAgent}
          onScan={handleScanAll}
          actionLoading={actionLoading}
        />
      )}

      {/* Drill-Down Modals */}
      {selectedActivityId && (
        <ActivityDetailModal
          activityId={selectedActivityId}
          onClose={() => setSelectedActivityId(null)}
          onViewTrace={(traceId) => {
            setSelectedActivityId(null);
            setSelectedTraceId(traceId);
          }}
        />
      )}
      {selectedTraceId && (
        <ExecutionTraceModal
          traceId={selectedTraceId}
          onClose={() => setSelectedTraceId(null)}
        />
      )}
      {selectedErrorId && (
        <ErrorDetailModal
          errorId={selectedErrorId}
          onClose={() => setSelectedErrorId(null)}
          onResolve={(id) => {
            handleResolveError(id);
            setSelectedErrorId(null);
          }}
          onViewTrace={(traceId) => {
            setSelectedErrorId(null);
            setSelectedTraceId(traceId);
          }}
        />
      )}
      {selectedCampaignId && (
        <CampaignTimelineModal
          campaignId={selectedCampaignId}
          onClose={() => setSelectedCampaignId(null)}
        />
      )}
    </div>
  );
}

// ─── Overview Tab (Enhanced) ─────────────────────────────────────

function OverviewTab({
  overview,
  health,
  onScan,
  scanLoading,
}: {
  overview: Overview | null;
  health: HealthRecord[];
  onScan: () => void;
  scanLoading: boolean;
}) {
  if (!overview) return <p className="text-muted">No data available</p>;

  const kpi = (label: string, value: string | number, color: string, subtitle?: string) => (
    <div className="col-6 col-md-4 col-xl" key={label}>
      <div className="card border-0 shadow-sm">
        <div className="card-body text-center py-3">
          <div className="small text-muted mb-1">{label}</div>
          <div className="h4 fw-bold mb-0" style={{ color }}>
            {value}
          </div>
          {subtitle && <div className="small text-muted mt-1">{subtitle}</div>}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* KPI Cards — 9 metrics */}
      <div className="row g-3 mb-4">
        {kpi('Total Agents', overview.total_agents, 'var(--color-primary)')}
        {kpi('Running', overview.running, 'var(--color-primary-light)')}
        {kpi('Idle', overview.idle, 'var(--color-accent)')}
        {kpi('Paused', overview.paused, '#e0a800')}
        {kpi('Disabled', overview.disabled, 'var(--color-text-light)')}
        {kpi('Errored', overview.errored, 'var(--color-secondary)')}
        {kpi('Health Score', overview.avg_health_score, overview.avg_health_score >= 80 ? 'var(--color-accent)' : overview.avg_health_score >= 60 ? '#e0a800' : 'var(--color-secondary)')}
        {kpi('Actions Today', overview.actions_today, 'var(--color-primary-light)')}
        {kpi('Repairs Today', overview.repairs_today, 'var(--color-accent)')}
      </div>

      <div className="row g-3">
        {/* Agent Summary by Category */}
        <div className="col-lg-7">
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white fw-semibold">
              All AI Agents ({overview.agents_summary.length})
            </div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-hover mb-0 small">
                  <thead className="table-light">
                    <tr>
                      <th>Agent</th>
                      <th>Category</th>
                      <th>Status</th>
                      <th>Runs</th>
                      <th>Errors</th>
                      <th>Last Run</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview.agents_summary.map((a) => (
                      <tr key={a.id}>
                        <td className="fw-medium">{a.name}</td>
                        <td>
                          <span className={`badge bg-${CATEGORY_COLORS[a.category] || 'secondary'}`}>
                            {a.category?.replace('_', ' ')}
                          </span>
                        </td>
                        <td>
                          <span className={`badge bg-${STATUS_COLORS[a.status] || 'secondary'}`}>
                            {a.status}
                          </span>
                          {!a.enabled && <span className="badge bg-danger ms-1">off</span>}
                        </td>
                        <td>{a.run_count}</td>
                        <td>
                          {a.error_count > 0 ? (
                            <span className="badge bg-danger">{a.error_count}</span>
                          ) : (
                            <span className="text-muted">0</span>
                          )}
                        </td>
                        <td className="text-muted">{timeAgo(a.last_run_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Campaign Health Summary */}
        <div className="col-lg-5">
          <div className="card border-0 shadow-sm">
            <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
              Campaign Health
              <button
                className="btn btn-sm btn-outline-primary"
                onClick={onScan}
                disabled={scanLoading}
              >
                {scanLoading ? 'Scanning...' : 'Scan Now'}
              </button>
            </div>
            <div className="card-body p-0">
              {health.length === 0 ? (
                <p className="text-muted p-3 mb-0">No health data yet. Run a scan to populate.</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover mb-0 small">
                    <thead className="table-light">
                      <tr>
                        <th>Campaign</th>
                        <th>Score</th>
                        <th>Leads</th>
                        <th>Errors</th>
                      </tr>
                    </thead>
                    <tbody>
                      {health.slice(0, 10).map((h) => (
                        <tr key={h.id}>
                          <td className="fw-medium">{h.campaign?.name || h.campaign_id.substring(0, 8)}</td>
                          <td>
                            <span className={`badge bg-${HEALTH_COLORS[h.status] || 'secondary'}`}>
                              {h.health_score}
                            </span>
                          </td>
                          <td>{h.active_lead_count}/{h.lead_count}</td>
                          <td>
                            {h.error_count > 0 ? (
                              <span className="badge bg-danger">{h.error_count}</span>
                            ) : (
                              <span className="text-muted">0</span>
                            )}
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
    </>
  );
}

// ─── Activity Tab (Enhanced with drill-down) ─────────────────────

function ActivityTab({
  activity,
  total,
  onViewDetail,
  onViewTrace,
}: {
  activity: ActivityRecord[];
  total: number;
  onViewDetail: (id: string) => void;
  onViewTrace: (traceId: string) => void;
}) {
  return (
    <div className="card border-0 shadow-sm">
      <div className="card-header bg-white fw-semibold">
        AI Decision Log <span className="text-muted fw-normal">({total} total)</span>
      </div>
      <div className="card-body p-0">
        <div className="table-responsive">
          <table className="table table-hover mb-0 small">
            <thead className="table-light">
              <tr>
                <th>Agent</th>
                <th>Action</th>
                <th>Confidence</th>
                <th>Result</th>
                <th>Duration</th>
                <th>Time</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {activity.map((a) => (
                <tr key={a.id}>
                  <td className="fw-medium">{a.agent?.agent_name || 'Unknown'}</td>
                  <td>{a.action}</td>
                  <td>
                    {a.confidence != null ? (
                      <span
                        className={`badge bg-${Number(a.confidence) >= 0.8 ? 'success' : Number(a.confidence) >= 0.6 ? 'warning' : 'danger'}`}
                      >
                        {(Number(a.confidence) * 100).toFixed(0)}%
                      </span>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge bg-${RESULT_COLORS[a.result] || 'secondary'}`}>
                      {a.result}
                    </span>
                  </td>
                  <td className="text-muted">
                    {a.duration_ms != null ? (a.duration_ms < 1000 ? `${a.duration_ms}ms` : `${(a.duration_ms / 1000).toFixed(1)}s`) : '—'}
                  </td>
                  <td className="text-muted">{timeAgo(a.created_at)}</td>
                  <td>
                    <div className="d-flex gap-1">
                      <button
                        className="btn btn-sm btn-outline-primary py-0 px-2"
                        onClick={() => onViewDetail(a.id)}
                      >
                        Detail
                      </button>
                      {a.trace_id && (
                        <button
                          className="btn btn-sm btn-outline-secondary py-0 px-2"
                          onClick={() => onViewTrace(a.trace_id!)}
                        >
                          Trace
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {activity.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-muted text-center py-4">
                    No agent activity recorded yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Health Monitor Tab (Enhanced with timeline drill-down) ──────

function HealthTab({
  health,
  onScan,
  scanLoading,
  onViewTimeline,
}: {
  health: HealthRecord[];
  onScan: () => void;
  scanLoading: boolean;
  onViewTimeline: (campaignId: string) => void;
}) {
  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6 className="mb-0 fw-semibold">Campaign Health Monitor</h6>
        <button className="btn btn-sm btn-primary" onClick={onScan} disabled={scanLoading}>
          {scanLoading ? 'Scanning...' : 'Run Health Scan'}
        </button>
      </div>

      {health.length === 0 ? (
        <div className="card border-0 shadow-sm">
          <div className="card-body text-center text-muted py-5">
            No health data. Click "Run Health Scan" to scan all active campaigns.
          </div>
        </div>
      ) : (
        <div className="row g-3">
          {health.map((h) => (
            <div key={h.id} className="col-md-6 col-lg-4">
              <div
                className="card border-0 shadow-sm h-100"
                style={{ cursor: 'pointer' }}
                onClick={() => onViewTimeline(h.campaign_id)}
              >
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <h6 className="fw-semibold mb-0" style={{ fontSize: '0.9rem' }}>
                      {h.campaign?.name || h.campaign_id.substring(0, 8)}
                    </h6>
                    <span className={`badge bg-${HEALTH_COLORS[h.status]}`}>
                      {h.health_score}/100
                    </span>
                  </div>

                  <div className="progress mb-3" style={{ height: 6 }}>
                    <div
                      className={`progress-bar bg-${HEALTH_COLORS[h.status]}`}
                      style={{ width: `${h.health_score}%` }}
                    />
                  </div>

                  <div className="row g-2 small">
                    <div className="col-6">
                      <span className="text-muted">Leads:</span>{' '}
                      <strong>{h.active_lead_count}/{h.lead_count}</strong>
                    </div>
                    <div className="col-6">
                      <span className="text-muted">Sent (24h):</span>{' '}
                      <strong>{h.sent_count}</strong>
                    </div>
                    <div className="col-6">
                      <span className="text-muted">Open Rate:</span>{' '}
                      <strong>{h.metrics?.open_rate ?? 0}%</strong>
                    </div>
                    <div className="col-6">
                      <span className="text-muted">Reply Rate:</span>{' '}
                      <strong>{h.metrics?.reply_rate ?? 0}%</strong>
                    </div>
                  </div>

                  {h.components && Object.keys(h.components).length > 0 && (
                    <div className="mt-2 pt-2 border-top">
                      <div className="d-flex flex-wrap gap-1">
                        {Object.entries(h.components).map(([key, val]) => (
                          <span
                            key={key}
                            className={`badge bg-${val.ok ? 'success' : 'danger'}`}
                            title={val.error || 'OK'}
                          >
                            {key}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {h.error_count > 0 && (
                    <div className="mt-2">
                      <span className="badge bg-danger">{h.error_count} error(s)</span>
                    </div>
                  )}

                  <div className="d-flex justify-content-between align-items-center mt-2">
                    <span className="text-muted" style={{ fontSize: '0.75rem' }}>
                      Last scan: {timeAgo(h.last_scan_at)}
                    </span>
                    <span className="text-primary small">View Timeline</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ─── Error Center Tab (Enhanced with drill-down) ─────────────────

function ErrorsTab({
  errors,
  onResolve,
  onViewDetail,
}: {
  errors: CampaignErrorRecord[];
  onResolve: (id: string) => void;
  onViewDetail: (id: string) => void;
}) {
  return (
    <div className="card border-0 shadow-sm">
      <div className="card-header bg-white fw-semibold">
        Unresolved Errors <span className="text-muted fw-normal">({errors.length})</span>
      </div>
      <div className="card-body p-0">
        <div className="table-responsive">
          <table className="table table-hover mb-0 small">
            <thead className="table-light">
              <tr>
                <th>Campaign</th>
                <th>Component</th>
                <th>Severity</th>
                <th>Error</th>
                <th>Time</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {errors.map((e) => (
                <tr key={e.id}>
                  <td className="fw-medium">{e.campaign?.name || e.campaign_id.substring(0, 8)}</td>
                  <td>
                    <span className="badge bg-secondary">{e.component}</span>
                  </td>
                  <td>
                    <span className={`badge bg-${SEVERITY_COLORS[e.severity] || 'secondary'}`}>
                      {e.severity}
                    </span>
                  </td>
                  <td style={{ maxWidth: 300 }}>
                    <span className="text-truncate d-inline-block" style={{ maxWidth: 300 }} title={e.error_message}>
                      {e.error_message}
                    </span>
                  </td>
                  <td className="text-muted">{timeAgo(e.created_at)}</td>
                  <td>
                    <div className="d-flex gap-1">
                      <button
                        className="btn btn-sm btn-outline-primary py-0 px-2"
                        onClick={() => onViewDetail(e.id)}
                      >
                        Detail
                      </button>
                      <button
                        className="btn btn-sm btn-outline-success py-0 px-2"
                        onClick={() => onResolve(e.id)}
                      >
                        Resolve
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {errors.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-muted text-center py-4">
                    No unresolved errors
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Controls Tab ─────────────────────────────────────────────

function ControlsTab({
  agents,
  onRunAgent,
  onToggleAgent,
  onScan,
  actionLoading,
}: {
  agents: Agent[];
  onRunAgent: (id: string) => void;
  onToggleAgent: (agent: Agent) => void;
  onScan: () => void;
  actionLoading: string | null;
}) {
  return (
    <>
      {/* System Actions */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold">System Actions</div>
        <div className="card-body">
          <div className="d-flex gap-2 flex-wrap">
            <button
              className="btn btn-sm btn-primary"
              onClick={onScan}
              disabled={actionLoading === 'scan'}
            >
              {actionLoading === 'scan' ? 'Scanning...' : 'Run Health Scan'}
            </button>
          </div>
        </div>
      </div>

      {/* Agent Controls */}
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-semibold">Agent Controls</div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th>Agent</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Last Run</th>
                  <th>Last Result</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr key={agent.id}>
                    <td className="fw-medium">{agent.agent_name}</td>
                    <td className="text-muted small">{agent.agent_type}</td>
                    <td>
                      <span className={`badge bg-${STATUS_COLORS[agent.status] || 'secondary'}`}>
                        {agent.status}
                      </span>
                    </td>
                    <td className="text-muted small">{timeAgo(agent.last_run_at)}</td>
                    <td className="small">
                      {agent.last_result ? (
                        <span>
                          {agent.last_result.actions_taken || 0} actions,{' '}
                          {agent.last_result.errors || 0} errors
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      <div className="d-flex gap-1">
                        <button
                          className="btn btn-sm btn-outline-primary py-0 px-2"
                          onClick={() => onRunAgent(agent.id)}
                          disabled={actionLoading === agent.id || agent.status === 'running'}
                        >
                          {actionLoading === agent.id ? '...' : 'Run Now'}
                        </button>
                        <button
                          className={`btn btn-sm py-0 px-2 ${agent.status === 'paused' ? 'btn-outline-success' : 'btn-outline-warning'}`}
                          onClick={() => onToggleAgent(agent)}
                        >
                          {agent.status === 'paused' ? 'Resume' : 'Pause'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

export default AdminAISettingsPage;
