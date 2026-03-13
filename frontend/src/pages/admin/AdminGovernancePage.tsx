import React, { useEffect, useState, useCallback } from 'react';
import SafetyTab from '../../components/admin/intelligence/tabs/SafetyTab';
import SecurityTab from '../../components/admin/intelligence/tabs/SecurityTab';

interface Agent {
  id: number;
  agent_name: string;
  agent_type: string;
  category: string;
  description: string;
  status: string;
  enabled: boolean;
  run_count: number;
  error_count: number;
  avg_duration_ms: number | null;
  last_run_at: string | null;
  last_error: string | null;
}

interface Alert {
  id: number;
  source: string;
  event_type: string;
  entity_type: string;
  entity_id: number | null;
  details: {
    severity?: string;
    agent_name?: string;
    error_count?: number;
    message?: string;
  };
  created_at: string;
}

interface SettingsSync {
  high_intent_threshold: number;
  price_per_enrollment: number;
  test_mode_enabled: boolean;
  follow_up_enabled: boolean;
  enable_auto_email: boolean;
  enable_voice_calls: boolean;
}

interface Overview {
  total_agents: number;
  active_agents: number;
  errored_agents: number;
  errors_24h: number;
  system_status: 'healthy' | 'degraded' | 'critical';
  autonomy_mode: string;
  settings_sync: SettingsSync;
}

const STATUS_COLORS: Record<string, string> = {
  healthy: 'success',
  degraded: 'warning',
  critical: 'danger',
  active: 'success',
  idle: 'success',
  running: 'primary',
  error: 'danger',
  paused: 'secondary',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'danger',
  warning: 'warning',
  info: 'info',
};

const AUTONOMY_LABELS: Record<string, { color: string; label: string }> = {
  full: { color: 'success', label: 'Full Autonomy' },
  safe: { color: 'warning', label: 'Safe Mode' },
  manual: { color: 'secondary', label: 'Manual Override' },
};

function api(path: string, options?: RequestInit) {
  const token = localStorage.getItem('admin_token');
  return fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatAgentName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function AdminGovernancePage() {
  const [tab, setTab] = useState<'overview' | 'agents' | 'alerts' | 'controls' | 'safety' | 'security'>('overview');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [autonomyMode, setAutonomyMode] = useState('full');
  const [loading, setLoading] = useState(true);

  const fetchOverview = useCallback(async () => {
    try {
      const res = await api('/api/admin/governance/overview');
      if (res.ok) {
        const data = await res.json();
        setOverview(data);
        setAutonomyMode(data.autonomy_mode || 'full');
      }
    } catch (err) {
      console.error('Failed to fetch overview:', err);
    }
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await api('/api/admin/governance/agents');
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents || []);
      }
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    }
  }, []);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await api('/api/admin/governance/alerts');
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts || []);
      }
    } catch (err) {
      console.error('Failed to fetch alerts:', err);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchOverview(), fetchAgents(), fetchAlerts()]).finally(() => setLoading(false));
  }, [fetchOverview, fetchAgents, fetchAlerts]);

  const toggleAgent = async (id: number, enabled: boolean) => {
    try {
      const res = await api(`/api/admin/governance/agents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      });
      if (res.ok) fetchAgents();
    } catch (err) {
      console.error('Failed to toggle agent:', err);
    }
  };

  const updateAutonomyMode = async (mode: string) => {
    try {
      const res = await api('/api/admin/governance/config', {
        method: 'PATCH',
        body: JSON.stringify({ ai_autonomy_mode: mode }),
      });
      if (res.ok) {
        setAutonomyMode(mode);
        fetchOverview();
      }
    } catch (err) {
      console.error('Failed to update autonomy mode:', err);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border" role="status" style={{ color: 'var(--color-primary)' }}>
          <span className="visually-hidden">Loading governance dashboard...</span>
        </div>
      </div>
    );
  }

  const statusColor = overview ? STATUS_COLORS[overview.system_status] || 'secondary' : 'secondary';
  const autonomyInfo = AUTONOMY_LABELS[autonomyMode] || AUTONOMY_LABELS.full;

  return (
    <div>
      {/* Manual Override Warning Banner */}
      {autonomyMode === 'manual' && (
        <div className="alert alert-warning py-2 small mb-3 d-flex align-items-center gap-2">
          <strong>MANUAL OVERRIDE ACTIVE</strong> — All AI agent actions require manual approval. Automated operations are paused.
        </div>
      )}

      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h1 className="h3 fw-bold mb-1" style={{ color: 'var(--color-primary)' }}>AI Governance</h1>
          <p className="text-muted mb-0 small">Agent oversight, execution logging, and system alerts</p>
        </div>
        <div className="d-flex gap-2 align-items-center" style={{ position: 'sticky', top: 0, zIndex: 5 }}>
          <span className={`badge bg-${statusColor}`}>
            {overview?.system_status?.toUpperCase() || 'UNKNOWN'}
          </span>
          <span className={`badge bg-${autonomyInfo.color}`}>{autonomyInfo.label}</span>
        </div>
      </div>

      {/* Tabs */}
      <ul className="nav nav-tabs mb-4">
        {(['overview', 'agents', 'alerts', 'controls', 'safety', 'security'] as const).map((t) => (
          <li className="nav-item" key={t}>
            <button
              className={`nav-link d-flex align-items-center gap-2${tab === t ? ' active' : ''}`}
              onClick={() => setTab(t)}
              style={tab === t ? { color: 'var(--color-primary)', borderBottomColor: 'var(--color-primary)' } : {}}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
              {t === 'alerts' && alerts.length > 0 && (
                <span className="badge bg-danger small" style={{ fontSize: '0.65rem' }}>{alerts.length}</span>
              )}
            </button>
          </li>
        ))}
      </ul>

      {tab === 'overview' && <OverviewTab overview={overview} autonomyMode={autonomyMode} />}
      {tab === 'agents' && <AgentsTab agents={agents} onToggle={toggleAgent} />}
      {tab === 'alerts' && <AlertsTab alerts={alerts} />}
      {tab === 'controls' && <ControlsTab autonomyMode={autonomyMode} onUpdateMode={updateAutonomyMode} />}
      {tab === 'safety' && <SafetyTab />}
      {tab === 'security' && <SecurityTab />}
    </div>
  );
}

function OverviewTab({ overview, autonomyMode }: { overview: Overview | null; autonomyMode: string }) {
  if (!overview) return <p className="text-muted">No data available.</p>;

  const statusColor = STATUS_COLORS[overview.system_status] || 'secondary';
  const autonomyInfo = AUTONOMY_LABELS[autonomyMode] || AUTONOMY_LABELS.full;
  const ss = overview.settings_sync;

  const healthCards = [
    { label: 'AI System Health', value: overview.system_status.toUpperCase(), color: statusColor, isBadge: true },
    { label: 'Active Agents', value: overview.active_agents, color: 'primary' },
    { label: 'Errors (24h)', value: overview.errors_24h, color: overview.errors_24h > 0 ? 'warning' : 'success' },
    { label: 'Autonomy Mode', value: autonomyInfo.label, color: autonomyInfo.color, isBadge: true },
  ];

  return (
    <>
      {/* Health Cards */}
      <div className="row g-3 mb-4">
        {healthCards.map((c) => (
          <div className="col-md-3 col-sm-6" key={c.label}>
            <div className="card border-0 shadow-sm h-100">
              <div className="card-body text-center py-4">
                <div className="text-muted small mb-1">{c.label}</div>
                {c.isBadge ? (
                  <span className={`badge bg-${c.color} fs-6`}>{c.value}</span>
                ) : (
                  <div className={`fs-3 fw-bold text-${c.color}`}>{c.value}</div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Settings Sync — Read-Only Mirror */}
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-semibold d-flex align-items-center gap-2">
          Settings Sync
          <span className="badge bg-secondary small" style={{ fontSize: '0.65rem' }}>READ-ONLY</span>
        </div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-3 col-sm-6">
              <div className="text-muted small mb-1">High Intent Threshold</div>
              <div className="fw-bold">{ss.high_intent_threshold}</div>
            </div>
            <div className="col-md-3 col-sm-6">
              <div className="text-muted small mb-1">Price Per Enrollment</div>
              <div className="fw-bold">${ss.price_per_enrollment.toLocaleString()}</div>
            </div>
            <div className="col-md-2 col-sm-6">
              <div className="text-muted small mb-1">Test Mode</div>
              <span className={`badge bg-${ss.test_mode_enabled ? 'warning' : 'success'}`}>
                {ss.test_mode_enabled ? 'ACTIVE' : 'OFF'}
              </span>
            </div>
            <div className="col-md-2 col-sm-6">
              <div className="text-muted small mb-1">Follow-Up</div>
              <span className={`badge bg-${ss.follow_up_enabled ? 'success' : 'secondary'}`}>
                {ss.follow_up_enabled ? 'ON' : 'OFF'}
              </span>
            </div>
            <div className="col-md-1 col-sm-3">
              <div className="text-muted small mb-1">Email</div>
              <span className={`badge bg-${ss.enable_auto_email ? 'success' : 'secondary'}`}>
                {ss.enable_auto_email ? 'ON' : 'OFF'}
              </span>
            </div>
            <div className="col-md-1 col-sm-3">
              <div className="text-muted small mb-1">Voice</div>
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
    </>
  );
}

function AgentsTab({ agents, onToggle }: { agents: Agent[]; onToggle: (id: number, enabled: boolean) => void }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (agents.length === 0) {
    return <p className="text-muted">No governance agents registered.</p>;
  }

  return (
    <div className="card border-0 shadow-sm">
      <div className="table-responsive">
        <table className="table table-hover mb-0">
          <thead className="table-light">
            <tr>
              <th>Agent</th>
              <th>Type</th>
              <th>Status</th>
              <th className="text-end">Runs</th>
              <th className="text-end">Failures</th>
              <th className="text-end">Avg Duration</th>
              <th>Last Run</th>
              <th className="text-center">Auto Mode</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => {
              const agentStatusColor = STATUS_COLORS[agent.status] || 'secondary';
              const isExpanded = expandedId === agent.id;
              return (
                <React.Fragment key={agent.id}>
                  <tr
                    style={{ cursor: agent.last_error ? 'pointer' : 'default' }}
                    onClick={() => agent.last_error && setExpandedId(isExpanded ? null : agent.id)}
                  >
                    <td>
                      <div className="fw-medium">{formatAgentName(agent.agent_name)}</div>
                      <div className="text-muted small">{agent.description}</div>
                    </td>
                    <td><span className="badge bg-secondary">{agent.agent_type}</span></td>
                    <td><span className={`badge bg-${agentStatusColor}`}>{agent.status}</span></td>
                    <td className="text-end">{agent.run_count}</td>
                    <td className="text-end">
                      <span className={agent.error_count > 0 ? 'text-danger fw-bold' : ''}>
                        {agent.error_count}
                      </span>
                    </td>
                    <td className="text-end">
                      {agent.avg_duration_ms ? `${agent.avg_duration_ms}ms` : '—'}
                    </td>
                    <td className="small">{formatDate(agent.last_run_at)}</td>
                    <td className="text-center">
                      <div className="form-check form-switch d-flex justify-content-center mb-0">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          role="switch"
                          checked={agent.enabled}
                          onChange={(e) => {
                            e.stopPropagation();
                            onToggle(agent.id, !agent.enabled);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Toggle ${agent.agent_name}`}
                        />
                      </div>
                    </td>
                  </tr>
                  {isExpanded && agent.last_error && (
                    <tr>
                      <td colSpan={8} className="bg-light border-0 py-2 px-4">
                        <div className="small">
                          <span className="fw-medium text-danger">Last Error:</span>{' '}
                          <span className="text-muted">{agent.last_error}</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AlertsTab({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) {
    return (
      <div className="card border-0 shadow-sm">
        <div className="card-body text-center py-5 text-muted">
          No alerts — all systems operating normally.
        </div>
      </div>
    );
  }

  return (
    <div className="card border-0 shadow-sm">
      <div className="table-responsive">
        <table className="table table-hover mb-0">
          <thead className="table-light">
            <tr>
              <th>Time</th>
              <th>Type</th>
              <th>Severity</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((alert) => {
              const severity = alert.details?.severity || 'info';
              const severityColor = SEVERITY_COLORS[severity] || 'secondary';
              return (
                <tr key={alert.id}>
                  <td className="small text-nowrap">{formatDate(alert.created_at)}</td>
                  <td><span className="badge bg-secondary">{alert.event_type.replace(/_/g, ' ')}</span></td>
                  <td><span className={`badge bg-${severityColor}`}>{severity}</span></td>
                  <td className="small">{alert.details?.message || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ControlsTab({
  autonomyMode,
  onUpdateMode,
}: {
  autonomyMode: string;
  onUpdateMode: (mode: string) => void;
}) {
  const modes = [
    { value: 'full', label: 'Full Autonomy', desc: 'AI agents operate independently with full decision-making authority.' },
    { value: 'safe', label: 'Safe Mode', desc: 'AI agents log all actions but do not enforce restrictions. Observation-only flag.' },
    { value: 'manual', label: 'Manual Override', desc: 'All AI agent actions require manual approval. Warning banner displayed system-wide.' },
  ];

  return (
    <div className="row g-4">
      <div className="col-lg-6">
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white fw-semibold">AI Autonomy Mode</div>
          <div className="card-body">
            {autonomyMode === 'manual' && (
              <div className="alert alert-warning py-2 small mb-3">
                Manual Override is active. All automated operations display a warning banner.
              </div>
            )}
            {modes.map((mode) => (
              <div
                key={mode.value}
                className={`p-3 rounded mb-2 d-flex align-items-start gap-3 ${
                  autonomyMode === mode.value ? 'border border-primary bg-light' : 'border'
                }`}
                style={{ cursor: 'pointer' }}
                onClick={() => onUpdateMode(mode.value)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && onUpdateMode(mode.value)}
              >
                <input
                  type="radio"
                  name="autonomy"
                  checked={autonomyMode === mode.value}
                  onChange={() => onUpdateMode(mode.value)}
                  className="form-check-input mt-1"
                  aria-label={mode.label}
                />
                <div>
                  <div className="fw-medium">{mode.label}</div>
                  <div className="text-muted small">{mode.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="col-lg-6">
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white fw-semibold">Governance Info</div>
          <div className="card-body">
            <p className="text-muted small mb-3">
              The governance layer monitors 5 core AI agents: visitor tracking, intent scoring,
              revenue aggregation, forecasting, and calendar intent boosting.
            </p>
            <p className="text-muted small mb-3">
              Agents log every execution to the activity ledger. When an agent accumulates 3 or more
              consecutive failures, a system alert is raised automatically.
            </p>
            <p className="text-muted small mb-3">
              Use the Agents tab to view execution stats and toggle individual agents on/off.
              Alerts appear in the Alerts tab with severity indicators.
            </p>
            <p className="text-muted small mb-0">
              <strong>Governance monitors. Settings controls.</strong> Configuration values displayed
              on the Overview tab are read-only mirrors from the Settings page.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
