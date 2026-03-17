import React, { useState, useEffect, useCallback } from 'react';
import api from '../../utils/api';
import AgentRegistryTab from './ai-settings/AgentRegistryTab';
import ActivityDetailModal from './ai-settings/ActivityDetailModal';
import ExecutionTraceModal from './ai-settings/ExecutionTraceModal';
import ErrorDetailModal from './ai-settings/ErrorDetailModal';
import CampaignTimelineModal from './ai-settings/CampaignTimelineModal';
import AgentDetailModal from './ai-settings/AgentDetailModal';
import OrchestrationHealthSection from './ai-settings/OrchestrationHealthSection';
import CampaignQATab from './ai-settings/CampaignQATab';
import GovernanceCOOTab from './ai-settings/GovernanceCOOTab';
import GovernanceAutonomyTab from './ai-settings/GovernanceAutonomyTab';
import WebsiteIntelligenceTab from './ai-settings/WebsiteIntelligenceTab';
import AdminAdmissionsTab from './ai-settings/AdminAdmissionsTab';
import CoryCOOTab from './ai-settings/CoryCOOTab';

interface Agent {
  id: string;
  agent_name: string;
  agent_type: string;
  status: string;
  enabled: boolean;
  schedule: string | null;
  category: string;
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
  { key: 'command-center', label: 'Command Center' },
  { key: 'coo', label: 'AI COO' },
  { key: 'registry', label: 'Agent Registry' },
  { key: 'autonomy', label: 'Autonomy & Safety' },
  { key: 'activity', label: 'Activity' },
  { key: 'health', label: 'Health Monitor' },
  { key: 'errors', label: 'Error Center' },
  { key: 'controls', label: 'Controls' },
  { key: 'campaign-qa', label: 'Campaign QA' },
  { key: 'website', label: 'Website Intelligence' },
  { key: 'admissions', label: 'Admissions Intelligence' },
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
  website_intelligence: 'purple',
  admissions: 'danger',
  admissions_ops: 'danger',
};

const RESULT_COLORS: Record<string, string> = {
  success: 'success',
  failed: 'danger',
  skipped: 'secondary',
  pending: 'warning',
};

const GOVERNANCE_STATUS_COLORS: Record<string, string> = {
  healthy: 'success',
  degraded: 'warning',
  critical: 'danger',
};

const AUTONOMY_LABELS: Record<string, { color: string; label: string }> = {
  full: { color: 'success', label: 'Full Autonomy' },
  safe: { color: 'warning', label: 'Safe Mode' },
  manual: { color: 'secondary', label: 'Manual Override' },
};

interface GovernanceOverview {
  total_agents: number;
  active_agents: number;
  errored_agents: number;
  errors_24h: number;
  system_status: 'healthy' | 'degraded' | 'critical';
  autonomy_mode: string;
  settings_sync: {
    high_intent_threshold: number;
    price_per_enrollment: number;
    test_mode_enabled: boolean;
    follow_up_enabled: boolean;
    enable_auto_email: boolean;
    enable_voice_calls: boolean;
  };
}

interface GovernanceAlert {
  id: number;
  source: string;
  event_type: string;
  entity_type: string;
  entity_id: number | null;
  details: { severity?: string; agent_name?: string; error_count?: number; message?: string };
  created_at: string;
}

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

  // Governance state
  const [governanceOverview, setGovernanceOverview] = useState<GovernanceOverview | null>(null);
  const [governanceAlerts, setGovernanceAlerts] = useState<GovernanceAlert[]>([]);
  const [autonomyMode, setAutonomyMode] = useState('full');

  // Modal state
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [selectedErrorId, setSelectedErrorId] = useState<string | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

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

  const fetchGovernanceOverview = useCallback(async () => {
    try {
      const { data } = await api.get('/api/admin/governance/overview');
      setGovernanceOverview(data);
      setAutonomyMode(data.autonomy_mode || 'full');
    } catch (err) {
      console.error('Failed to fetch governance overview:', err);
    }
  }, []);

  const fetchGovernanceAlerts = useCallback(async () => {
    try {
      const { data } = await api.get('/api/admin/governance/alerts');
      setGovernanceAlerts(data.alerts || []);
    } catch (err) {
      console.error('Failed to fetch governance alerts:', err);
    }
  }, []);

  const updateAutonomyMode = async (mode: string) => {
    try {
      await api.patch('/api/admin/governance/config', { ai_autonomy_mode: mode });
      setAutonomyMode(mode);
      fetchGovernanceOverview();
    } catch (err) {
      console.error('Failed to update autonomy mode:', err);
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      fetchOverview(),
      fetchAgents(),
      fetchHealth(),
      fetchErrors(),
      fetchActivity(),
      fetchGovernanceOverview(),
      fetchGovernanceAlerts(),
    ]).finally(() => setLoading(false));
  }, [fetchOverview, fetchAgents, fetchHealth, fetchErrors, fetchActivity, fetchGovernanceOverview, fetchGovernanceAlerts]);

  // 10-second polling for overview stats
  useEffect(() => {
    const interval = setInterval(() => {
      fetchOverview();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchOverview]);

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
      await Promise.allSettled([
        api.post('/api/admin/ai-ops/health/scan'),
        api.post('/api/admin/ai-ops/discover'),
      ]);
      await Promise.allSettled([fetchHealth(), fetchOverview(), fetchErrors(), fetchAgents()]);
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
      {autonomyMode === 'manual' && (
        <div className="alert alert-warning py-2 small mb-3 d-flex align-items-center gap-2">
          <strong>MANUAL OVERRIDE ACTIVE</strong> — All AI agent actions require manual approval. Automated operations are paused.
        </div>
      )}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="mb-1 fw-bold" style={{ color: 'var(--color-primary)' }}>
            AI Control Center
          </h4>
          <p className="text-muted small mb-0">
            Full observability and control across all {overview?.total_agents || 0} autonomous agents
          </p>
        </div>
        <div className="d-flex gap-2 align-items-center">
          {governanceOverview && (
            <>
              <span className={`badge bg-${GOVERNANCE_STATUS_COLORS[governanceOverview.system_status] || 'secondary'}`}>
                {governanceOverview.system_status.toUpperCase()}
              </span>
              <span className={`badge bg-${AUTONOMY_LABELS[autonomyMode]?.color || 'success'}`}>
                {AUTONOMY_LABELS[autonomyMode]?.label || 'Full Autonomy'}
              </span>
            </>
          )}
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
          onSelectAgent={setSelectedAgentId}
          onSelectCampaign={setSelectedCampaignId}
          governanceOverview={governanceOverview}
          autonomyMode={autonomyMode}
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
        <>
          <HealthTab
            health={health}
            onScan={handleScanAll}
            scanLoading={actionLoading === 'scan'}
            onViewTimeline={setSelectedCampaignId}
          />
          <hr className="my-4" />
          <OrchestrationHealthSection />
        </>
      )}
      {activeTab === 'errors' && (
        <ErrorsTab
          errors={errors}
          onResolve={handleResolveError}
          onViewDetail={setSelectedErrorId}
          governanceAlerts={governanceAlerts}
        />
      )}
      {activeTab === 'command-center' && <CoryCOOTab />}
      {activeTab === 'coo' && <GovernanceCOOTab />}
      {activeTab === 'autonomy' && <GovernanceAutonomyTab />}
      {activeTab === 'controls' && (
        <ControlsTab
          agents={agents}
          onRunAgent={handleRunAgent}
          onToggleAgent={handleToggleAgent}
          onScan={handleScanAll}
          actionLoading={actionLoading}
          onSelectAgent={setSelectedAgentId}
          autonomyMode={autonomyMode}
          onUpdateAutonomyMode={updateAutonomyMode}
        />
      )}
      {activeTab === 'campaign-qa' && <CampaignQATab />}
      {activeTab === 'website' && <WebsiteIntelligenceTab />}
      {activeTab === 'admissions' && <AdminAdmissionsTab />}

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
      {selectedAgentId && (
        <AgentDetailModal
          agentId={selectedAgentId}
          onClose={() => setSelectedAgentId(null)}
          onRefresh={() => { Promise.allSettled([fetchOverview(), fetchAgents()]); }}
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
  onSelectAgent,
  onSelectCampaign,
  governanceOverview,
  autonomyMode,
}: {
  overview: Overview | null;
  health: HealthRecord[];
  onScan: () => void;
  scanLoading: boolean;
  onSelectAgent: (id: string) => void;
  onSelectCampaign: (id: string) => void;
  governanceOverview: GovernanceOverview | null;
  autonomyMode: string;
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

  const govStatusColor = governanceOverview
    ? GOVERNANCE_STATUS_COLORS[governanceOverview.system_status] || 'secondary'
    : 'secondary';
  const autonomyInfo = AUTONOMY_LABELS[autonomyMode] || AUTONOMY_LABELS.full;
  const ss = governanceOverview?.settings_sync;

  return (
    <>
      {/* Governance Health + KPI Cards */}
      <div className="row g-3 mb-4">
        {governanceOverview && (
          <>
            <div className="col-6 col-md-4 col-xl">
              <div className="card border-0 shadow-sm">
                <div className="card-body text-center py-3">
                  <div className="small text-muted mb-1">System Health</div>
                  <span className={`badge bg-${govStatusColor} fs-6`}>
                    {governanceOverview.system_status.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
            {kpi('Errors (24h)', governanceOverview.errors_24h, governanceOverview.errors_24h > 0 ? 'var(--color-secondary)' : 'var(--color-accent)')}
          </>
        )}
        {kpi('Total Agents', overview.total_agents, 'var(--color-primary)')}
        {kpi('Running', overview.running, 'var(--color-primary-light)')}
        {kpi('Idle', overview.idle, 'var(--color-accent)')}
        {kpi('Paused', overview.paused, '#e0a800')}
        {kpi('Errored', overview.errored, 'var(--color-secondary)')}
        {kpi('Health Score', overview.avg_health_score, overview.avg_health_score >= 80 ? 'var(--color-accent)' : overview.avg_health_score >= 60 ? '#e0a800' : 'var(--color-secondary)')}
        {kpi('Actions Today', overview.actions_today, 'var(--color-primary-light)')}
        {kpi('Repairs Today', overview.repairs_today, 'var(--color-accent)')}
      </div>

      {/* Settings Sync — Read-Only Mirror */}
      {ss && (
        <div className="card border-0 shadow-sm mb-4">
          <div className="card-header bg-white fw-semibold d-flex align-items-center gap-2">
            Settings Sync
            <span className="badge bg-secondary small" style={{ fontSize: '0.65rem' }}>READ-ONLY</span>
          </div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-2 col-sm-6">
                <div className="text-muted small mb-1">Intent Threshold</div>
                <div className="fw-bold">{ss.high_intent_threshold}</div>
              </div>
              <div className="col-md-2 col-sm-6">
                <div className="text-muted small mb-1">Price/Enrollment</div>
                <div className="fw-bold">${ss.price_per_enrollment.toLocaleString()}</div>
              </div>
              <div className="col-md-2 col-sm-4">
                <div className="text-muted small mb-1">Test Mode</div>
                <span className={`badge bg-${ss.test_mode_enabled ? 'warning' : 'success'}`}>
                  {ss.test_mode_enabled ? 'ACTIVE' : 'OFF'}
                </span>
              </div>
              <div className="col-md-2 col-sm-4">
                <div className="text-muted small mb-1">Follow-Up</div>
                <span className={`badge bg-${ss.follow_up_enabled ? 'success' : 'secondary'}`}>
                  {ss.follow_up_enabled ? 'ON' : 'OFF'}
                </span>
              </div>
              <div className="col-md-2 col-sm-4">
                <div className="text-muted small mb-1">Auto Email</div>
                <span className={`badge bg-${ss.enable_auto_email ? 'success' : 'secondary'}`}>
                  {ss.enable_auto_email ? 'ON' : 'OFF'}
                </span>
              </div>
              <div className="col-md-2 col-sm-4">
                <div className="text-muted small mb-1">Voice Calls</div>
                <span className={`badge bg-${ss.enable_voice_calls ? 'success' : 'secondary'}`}>
                  {ss.enable_voice_calls ? 'ON' : 'OFF'}
                </span>
              </div>
            </div>
            <div className="form-text mt-2">
              These values are read from Settings. To modify, use the Settings page.
            </div>
          </div>
        </div>
      )}

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
                      <tr key={a.id} style={{ cursor: 'pointer' }} onClick={() => onSelectAgent(a.id)}>
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
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {health.slice(0, 10).map((h) => (
                        <tr key={h.id} style={{ cursor: 'pointer' }} onClick={() => onSelectCampaign(h.campaign_id)}>
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
                          <td className="text-primary">View ›</td>
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
                  <td>
                    {a.action === 'scan_completed_no_issues' ? (
                      <span className="text-muted">No issues detected</span>
                    ) : (a.details as any)?.actions?.length > 0 ? (
                      <span title={a.action}>
                        {(() => {
                          const actionCounts: Record<string, number> = {};
                          ((a.details as any).actions as any[]).forEach((act: any) => {
                            actionCounts[act.action] = (actionCounts[act.action] || 0) + 1;
                          });
                          return Object.entries(actionCounts)
                            .map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`)
                            .join(', ');
                        })()}
                      </span>
                    ) : (
                      <span>{a.action}</span>
                    )}
                  </td>
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
  governanceAlerts,
}: {
  errors: CampaignErrorRecord[];
  onResolve: (id: string) => void;
  onViewDetail: (id: string) => void;
  governanceAlerts: GovernanceAlert[];
}) {
  return (
    <>
    {/* Governance System Alerts */}
    {governanceAlerts.length > 0 && (
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold">
          System Alerts <span className="text-muted fw-normal">({governanceAlerts.length})</span>
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover mb-0 small">
              <thead className="table-light">
                <tr>
                  <th>Time</th>
                  <th>Type</th>
                  <th>Severity</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {governanceAlerts.map((alert) => {
                  const severity = alert.details?.severity || 'info';
                  const severityColor = SEVERITY_COLORS[severity] || 'secondary';
                  return (
                    <tr key={alert.id}>
                      <td className="text-muted text-nowrap">{timeAgo(alert.created_at)}</td>
                      <td><span className="badge bg-secondary">{alert.event_type.replace(/_/g, ' ')}</span></td>
                      <td><span className={`badge bg-${severityColor}`}>{severity}</span></td>
                      <td>{alert.details?.message || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )}

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
    </>
  );
}

// ─── Controls Tab ─────────────────────────────────────────────

function ControlsTab({
  agents,
  onRunAgent,
  onToggleAgent,
  onScan,
  actionLoading,
  onSelectAgent,
  autonomyMode,
  onUpdateAutonomyMode,
}: {
  agents: Agent[];
  onRunAgent: (id: string) => void;
  onToggleAgent: (agent: Agent) => void;
  onScan: () => void;
  actionLoading: string | null;
  onSelectAgent: (id: string) => void;
  autonomyMode: string;
  onUpdateAutonomyMode: (mode: string) => void;
}) {
  const modes = [
    { value: 'full', label: 'Full Autonomy', desc: 'AI agents operate independently with full decision-making authority.' },
    { value: 'safe', label: 'Safe Mode', desc: 'AI agents log all actions but do not enforce restrictions. Observation-only flag.' },
    { value: 'manual', label: 'Manual Override', desc: 'All AI agent actions require manual approval. Warning banner displayed system-wide.' },
  ];

  return (
    <>
      {/* Autonomy Mode */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-header bg-white fw-semibold">AI Autonomy Mode</div>
        <div className="card-body">
          {autonomyMode === 'manual' && (
            <div className="alert alert-warning py-2 small mb-3">
              Manual Override is active. All automated operations display a warning banner.
            </div>
          )}
          <div className="row g-3">
            {modes.map((mode) => (
              <div className="col-md-4" key={mode.value}>
                <div
                  className={`p-3 rounded d-flex align-items-start gap-3 h-100 ${
                    autonomyMode === mode.value ? 'border border-primary bg-light' : 'border'
                  }`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => onUpdateAutonomyMode(mode.value)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && onUpdateAutonomyMode(mode.value)}
                >
                  <input
                    type="radio"
                    name="autonomy"
                    checked={autonomyMode === mode.value}
                    onChange={() => onUpdateAutonomyMode(mode.value)}
                    className="form-check-input mt-1"
                    aria-label={mode.label}
                  />
                  <div>
                    <div className="fw-medium">{mode.label}</div>
                    <div className="text-muted small">{mode.desc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

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
            <table className="table table-hover mb-0 small">
              <thead className="table-light">
                <tr>
                  <th>Agent</th>
                  <th>Category</th>
                  <th>Active</th>
                  <th>Status</th>
                  <th>Schedule</th>
                  <th>Last Run</th>
                  <th>Last Result</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr key={agent.id} style={{ cursor: 'pointer' }} onClick={() => onSelectAgent(agent.id)}>
                    <td className="fw-medium">{agent.agent_name}</td>
                    <td>
                      <span className={`badge bg-${CATEGORY_COLORS[agent.category] || 'secondary'}`}>
                        {agent.category?.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      {agent.enabled ? (
                        <span className="badge bg-success">On</span>
                      ) : (
                        <span className="badge bg-danger">Off</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge bg-${STATUS_COLORS[agent.status] || 'secondary'}`}>
                        {agent.status}
                      </span>
                    </td>
                    <td className="text-muted" style={{ fontFamily: 'monospace', fontSize: 11 }}>
                      {agent.schedule || '—'}
                    </td>
                    <td className="text-muted">{timeAgo(agent.last_run_at)}</td>
                    <td>
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
                      <div className="d-flex gap-1" onClick={(e) => e.stopPropagation()}>
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
