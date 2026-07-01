import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PageHeader, StatCard, StatusBadge, SectionCard } from '../../components/admin/shell';
import { TrustSignal } from '../../components/admin/shell/trust';

const API = process.env.REACT_APP_API_URL || '';

// ─── Types ───────────────────────────────────────────────────────────────────

interface GovernanceConfig {
  autonomy_mode: string;
  max_dynamic_agents: number;
  max_agents_total: number;
  max_auto_executions_per_hour: number;
  max_risk_budget_per_hour: number;
  max_proposed_pending: number;
  max_concurrent_monitoring: number;
  auto_execute_risk_threshold: number;
  auto_execute_confidence_threshold: number;
  max_experiments_per_agent: number;
  max_system_experiments: number;
  approval_required_for_critical: boolean;
  autonomy_rules: any[];
  source: string;
}

interface CronSchedule {
  id: string;
  agent_name: string;
  default_schedule: string;
  active_schedule: string;
  enabled: boolean;
  updated_by: string | null;
  updated_at: string;
}

interface RiskConfig {
  blast_radius_weights: Record<string, number>;
  reversibility_weights: Record<string, number>;
  intent_thresholds: Record<string, number>;
  source: string;
}

// ─── Tabs ────────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'system', label: 'System Limits' },
  { key: 'schedules', label: 'Agent Schedules' },
  { key: 'risk', label: 'Risk Scoring' },
  { key: 'autonomy', label: 'Autonomy Rules' },
  { key: 'executive', label: 'Executive Awareness' },
  { key: 'aicoo', label: 'AI COO' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('admin_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${API}${path}`, { headers: authHeaders(), ...opts });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── System Limits Tab ───────────────────────────────────────────────────────

function SystemLimitsTab() {
  const [config, setConfig] = useState<GovernanceConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [edits, setEdits] = useState<Record<string, any>>({});

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch('/api/admin/governance-center/config');
      setConfig(data);
      setEdits({});
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (Object.keys(edits).length === 0) return;
    try {
      setSaving(true);
      setError('');
      const data = await apiFetch('/api/admin/governance-center/config', {
        method: 'PATCH',
        body: JSON.stringify(edits),
      });
      setConfig(data);
      setEdits({});
      setSuccess('Configuration saved');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const field = (key: string, label: string, type: 'number' | 'select' | 'boolean' = 'number') => {
    if (!config) return null;
    const value = edits[key] !== undefined ? edits[key] : (config as any)[key];

    if (type === 'boolean') {
      return (
        <div className="col-md-6 col-lg-4 mb-3" key={key}>
          <div className="form-check form-switch">
            <input
              className="form-check-input"
              type="checkbox"
              checked={!!value}
              onChange={(e) => setEdits({ ...edits, [key]: e.target.checked })}
            />
            <label className="form-check-label small fw-medium">{label}</label>
          </div>
        </div>
      );
    }

    if (type === 'select') {
      return (
        <div className="col-md-6 col-lg-4 mb-3" key={key}>
          <label className="form-label small fw-medium">{label}</label>
          <select
            className="form-select form-select-sm"
            value={value}
            onChange={(e) => setEdits({ ...edits, [key]: e.target.value })}
          >
            <option value="full">Full Autonomy</option>
            <option value="safe">Safe Mode</option>
            <option value="manual">Manual Only</option>
          </select>
        </div>
      );
    }

    return (
      <div className="col-md-6 col-lg-4 mb-3" key={key}>
        <label className="form-label small fw-medium">{label}</label>
        <input
          type="number"
          className="form-control form-control-sm"
          value={value}
          onChange={(e) => setEdits({ ...edits, [key]: parseInt(e.target.value, 10) || 0 })}
        />
      </div>
    );
  };

  if (loading) return <div className="text-center py-4"><div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div></div>;

  return (
    <div>
      {error && <div className="alert alert-danger alert-dismissible py-2 small"><button type="button" className="btn-close btn-close-sm" onClick={() => setError('')} />{error}</div>}
      {success && <div className="alert alert-success py-2 small">{success}</div>}
      {config && (
        <>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div>
              <StatusBadge
                label={`Source: ${config.source}`}
                tone={config.source === 'database' ? 'success' : 'warning'}
              />
            </div>
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || Object.keys(edits).length === 0}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>

          <SectionCard title="Autonomy & Execution" className="mb-4">
            <div className="row">
              {field('autonomy_mode', 'Autonomy Mode', 'select')}
              {field('max_auto_executions_per_hour', 'Max Auto-Executions / Hour')}
              {field('max_risk_budget_per_hour', 'Max Risk Budget / Hour')}
              {field('auto_execute_risk_threshold', 'Risk Threshold (auto-execute below)')}
              {field('auto_execute_confidence_threshold', 'Confidence Threshold (auto-execute above)')}
              {field('approval_required_for_critical', 'Require Approval for Critical Actions', 'boolean')}
            </div>
          </SectionCard>

          <SectionCard title="Resource Limits" className="mb-4">
            <div className="row">
              {field('max_dynamic_agents', 'Max Dynamic Agents')}
              {field('max_agents_total', 'Max Agents Total')}
              {field('max_proposed_pending', 'Max Pending Proposals')}
              {field('max_concurrent_monitoring', 'Max Concurrent Monitors')}
            </div>
          </SectionCard>

          <SectionCard title="Experiments" className="mb-4">
            <div className="row">
              {field('max_experiments_per_agent', 'Max Experiments per Agent')}
              {field('max_system_experiments', 'Max System Experiments')}
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}

// ─── Agent Schedules Tab ─────────────────────────────────────────────────────

function AgentSchedulesTab() {
  const [schedules, setSchedules] = useState<CronSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');
  const [editingAgent, setEditingAgent] = useState<string | null>(null);
  const [editSchedule, setEditSchedule] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch('/api/admin/governance-center/schedules');
      setSchedules(data.schedules || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleEnabled = async (agentName: string, enabled: boolean) => {
    try {
      await apiFetch(`/api/admin/governance-center/schedules/${agentName}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      });
      setSchedules((prev) =>
        prev.map((s) => (s.agent_name === agentName ? { ...s, enabled } : s))
      );
    } catch (err: any) {
      setError(err.message);
    }
  };

  const saveSchedule = async (agentName: string) => {
    try {
      await apiFetch(`/api/admin/governance-center/schedules/${agentName}`, {
        method: 'PATCH',
        body: JSON.stringify({ active_schedule: editSchedule }),
      });
      setSchedules((prev) =>
        prev.map((s) => (s.agent_name === agentName ? { ...s, active_schedule: editSchedule } : s))
      );
      setEditingAgent(null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const resetSchedule = async (agentName: string) => {
    try {
      const data = await apiFetch(`/api/admin/governance-center/schedules/${agentName}/reset`, {
        method: 'POST',
      });
      setSchedules((prev) =>
        prev.map((s) => (s.agent_name === agentName ? { ...s, active_schedule: data.default_schedule, enabled: true } : s))
      );
    } catch (err: any) {
      setError(err.message);
    }
  };

  const filtered = schedules.filter((s) =>
    s.agent_name.toLowerCase().includes(filter.toLowerCase())
  );

  if (loading) return <div className="text-center py-4"><div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div></div>;

  return (
    <div>
      {error && <div className="alert alert-danger alert-dismissible py-2 small"><button type="button" className="btn-close btn-close-sm" onClick={() => setError('')} />{error}</div>}

      <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
        <input
          type="text"
          className="form-control form-control-sm"
          placeholder="Filter agents..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ maxWidth: 300 }}
        />
        <span className="text-muted small">{filtered.length} of {schedules.length} agents</span>
      </div>

      <div className="table-responsive">
        <table className="table table-hover mb-0">
          <thead className="table-light">
            <tr>
              <th className="small fw-medium">Agent</th>
              <th className="small fw-medium">Active Schedule</th>
              <th className="small fw-medium">Default</th>
              <th className="small fw-medium text-center">Enabled</th>
              <th className="small fw-medium text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const isModified = s.active_schedule !== s.default_schedule;
              return (
                <tr key={s.agent_name} className={!s.enabled ? 'table-secondary' : ''}>
                  <td className="small fw-medium">{s.agent_name}</td>
                  <td className="small">
                    {editingAgent === s.agent_name ? (
                      <div className="d-flex gap-1">
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          value={editSchedule}
                          onChange={(e) => setEditSchedule(e.target.value)}
                          style={{ maxWidth: 260 }}
                        />
                        <button className="btn btn-success btn-sm" onClick={() => saveSchedule(s.agent_name)}>Save</button>
                        <button className="btn btn-outline-secondary btn-sm" onClick={() => setEditingAgent(null)}>Cancel</button>
                      </div>
                    ) : (
                      <span>
                        <code>{s.active_schedule}</code>
                        {isModified && <span className="badge bg-info ms-1">modified</span>}
                      </span>
                    )}
                  </td>
                  <td className="small"><code className="text-muted">{s.default_schedule}</code></td>
                  <td className="text-center">
                    <div className="form-check form-switch d-inline-block">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        checked={s.enabled}
                        onChange={(e) => toggleEnabled(s.agent_name, e.target.checked)}
                      />
                    </div>
                  </td>
                  <td className="text-end">
                    <button
                      className="btn btn-outline-secondary btn-sm me-1"
                      onClick={() => { setEditingAgent(s.agent_name); setEditSchedule(s.active_schedule); }}
                    >
                      Edit
                    </button>
                    {isModified && (
                      <button className="btn btn-outline-warning btn-sm" onClick={() => resetSchedule(s.agent_name)}>
                        Reset
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 small text-muted">
        Schedule changes take effect on next server restart. Use standard cron syntax (e.g. <code>*/15 * * * *</code>).
      </div>
    </div>
  );
}

// ─── Risk Scoring Tab ────────────────────────────────────────────────────────

function RiskScoringTab() {
  const [config, setConfig] = useState<RiskConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [intentEdits, setIntentEdits] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch('/api/admin/governance-center/risk-scoring');
      setConfig(data);
      setIntentEdits({});
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSaveIntents = async () => {
    if (Object.keys(intentEdits).length === 0 || !config) return;
    try {
      setSaving(true);
      const merged = { ...config.intent_thresholds, ...intentEdits };
      const data = await apiFetch('/api/admin/governance-center/risk-scoring', {
        method: 'PATCH',
        body: JSON.stringify({ intent_thresholds: merged }),
      });
      setConfig(data);
      setIntentEdits({});
      setSuccess('Intent thresholds saved');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-center py-4"><div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div></div>;

  const weightTable = (title: string, weights: Record<string, number>) => (
    <SectionCard title={title} padded={false} className="mb-4">
      <table className="table table-hover mb-0">
        <thead className="table-light">
          <tr>
            <th className="small fw-medium">Action Type</th>
            <th className="small fw-medium text-end">Weight</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(weights).sort(([,a], [,b]) => b - a).map(([key, val]) => (
            <tr key={key}>
              <td className="small">{key.replace(/_/g, ' ')}</td>
              <td className="small text-end">
                <StatusBadge
                  label={String(val)}
                  tone={val >= 70 ? 'danger' : val >= 40 ? 'warning' : 'success'}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </SectionCard>
  );

  return (
    <div>
      {error && <div className="alert alert-danger alert-dismissible py-2 small"><button type="button" className="btn-close btn-close-sm" onClick={() => setError('')} />{error}</div>}
      {success && <div className="alert alert-success py-2 small">{success}</div>}

      {config && (
        <>
          <div className="mb-3">
            <StatusBadge
              label={`Source: ${config.source}`}
              tone={config.source === 'database' ? 'success' : 'warning'}
            />
          </div>

          <SectionCard
            title="Intent Thresholds"
            className="mb-4"
            actions={
              <button className="btn btn-primary btn-sm" onClick={handleSaveIntents} disabled={saving || Object.keys(intentEdits).length === 0}>
                {saving ? 'Saving...' : 'Save Thresholds'}
              </button>
            }
          >
            <div className="row">
              {Object.entries(config.intent_thresholds).map(([key, val]) => {
                const edited = intentEdits[key] !== undefined ? intentEdits[key] : val;
                return (
                  <div className="col-md-6 col-lg-3 mb-3" key={key}>
                    <label className="form-label small fw-medium">{key.replace(/_/g, ' ')}</label>
                    <input
                      type="number"
                      className="form-control form-control-sm"
                      value={edited}
                      min={0}
                      max={100}
                      onChange={(e) => setIntentEdits({ ...intentEdits, [key]: parseInt(e.target.value, 10) || 0 })}
                    />
                  </div>
                );
              })}
            </div>
          </SectionCard>

          {weightTable('Blast Radius Weights', config.blast_radius_weights)}
          {weightTable('Reversibility Weights', config.reversibility_weights)}
        </>
      )}
    </div>
  );
}

// ─── Autonomy Rules Tab ──────────────────────────────────────────────────────

function AutonomyRulesTab() {
  const [config, setConfig] = useState<GovernanceConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch('/api/admin/governance-center/config');
      setConfig(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-center py-4"><div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div></div>;

  const rules = config?.autonomy_rules || [];

  return (
    <div>
      {error && <div className="alert alert-danger alert-dismissible py-2 small"><button type="button" className="btn-close btn-close-sm" onClick={() => setError('')} />{error}</div>}

      <SectionCard title={`Active Autonomy Rules (${rules.length})`} padded={false}>
        {rules.length === 0 ? (
          <div className="p-3 text-muted small">No autonomy rules configured.</div>
        ) : (
          <table className="table table-hover mb-0">
            <thead className="table-light">
              <tr>
                <th className="small fw-medium">Name</th>
                <th className="small fw-medium">Mode</th>
                <th className="small fw-medium">Priority</th>
                <th className="small fw-medium">Conditions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule: any, idx: number) => (
                <tr key={idx}>
                  <td className="small fw-medium">{rule.name || `Rule ${idx + 1}`}</td>
                  <td className="small">
                    <StatusBadge
                      label={rule.mode}
                      tone={rule.mode === 'full' ? 'success' : rule.mode === 'safe' ? 'warning' : 'danger'}
                    />
                  </td>
                  <td className="small">{rule.priority ?? 0}</td>
                  <td className="small text-muted">
                    {rule.conditions?.length ? `${rule.conditions.length} condition(s)` : 'No conditions'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

function GovernanceCommandCenter() {
  const [activeTab, setActiveTab] = useState('system');

  // Per-page trust signal (Basecamp todo 10027085963) — governance is a config
  // control surface, so the signal reflects that the limits/schedules shown are
  // the live source of record for the autonomy engine.
  const trust: TrustSignal = useMemo(() => ({
    level: 'live',
    source: 'governance / autonomy',
    updatedAt: new Date().toISOString(),
    summary: 'Live safety limits, agent schedules, and risk thresholds governing autonomous execution.',
    href: '/admin/trust',
    pillars: [
      {
        name: 'Governance Source',
        status: 'live',
        evidence: [{ label: 'Backed by', value: 'governance_center config' }],
      },
    ],
  }), []);

  return (
    <div className="container-fluid py-4">
      <PageHeader
        title="Governance Command Center"
        icon="shield-keyhole-line"
        subtitle="Centralized control for all system governance, safety limits, agent schedules, and risk configuration."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Governance' }]}
        trust={trust}
      />

      <ul className="nav nav-tabs mb-4">
        {TABS.map((tab) => (
          <li className="nav-item" key={tab.key}>
            <button
              className={`nav-link${activeTab === tab.key ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          </li>
        ))}
      </ul>

      {activeTab === 'system' && <SystemLimitsTab />}
      {activeTab === 'schedules' && <AgentSchedulesTab />}
      {activeTab === 'risk' && <RiskScoringTab />}
      {activeTab === 'autonomy' && <AutonomyRulesTab />}
      {activeTab === 'executive' && <ExecutiveAwarenessTab />}
      {activeTab === 'aicoo' && <AICOOTab />}
    </div>
  );
}

// ─── Executive Awareness Tab ────────────────────────────────────────────────

interface NotificationPolicy {
  enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  quiet_hours_timezone: string;
  weekend_policy: string;
  severity_channel_map: Record<string, string[]>;
  rate_limits: Record<string, { max_per_hour: number }>;
  cluster_window_minutes: number;
  digest_enabled: boolean;
  digest_morning_cron: string;
  digest_evening_cron: string;
  acknowledgment_suppresses: boolean;
}

interface ExecEvent {
  id: string;
  title: string;
  description?: string;
  severity: number;
  status: string;
  created_at: string;
  metadata?: Record<string, any>;
}

function ExecutiveAwarenessTab() {
  const [policy, setPolicy] = useState<NotificationPolicy | null>(null);
  const [events, setEvents] = useState<ExecEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [edits, setEdits] = useState<Record<string, any>>({});
  const [testSeverity, setTestSeverity] = useState('important');
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [policyRes, eventsRes] = await Promise.all([
        apiFetch('/api/admin/executive-awareness/policy'),
        apiFetch('/api/admin/executive-awareness/events?limit=20'),
      ]);
      setPolicy(policyRes.policy);
      setEvents(eventsRes.events || []);
      setEdits({});
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    if (Object.keys(edits).length === 0) return;
    try {
      setSaving(true);
      setError('');
      const res = await apiFetch('/api/admin/executive-awareness/policy', {
        method: 'PATCH',
        body: JSON.stringify(edits),
      });
      setPolicy(res.policy);
      setEdits({});
      setSuccess('Policy saved');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTestEscalation = async () => {
    try {
      setTesting(true);
      setError('');
      const res = await apiFetch('/api/admin/executive-awareness/test-escalation', {
        method: 'POST',
        body: JSON.stringify({ severity: testSeverity }),
      });
      setSuccess(res.message || 'Test event emitted');
      setTimeout(() => setSuccess(''), 3000);
      load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setTesting(false);
    }
  };

  const setEdit = (key: string, val: any) => setEdits({ ...edits, [key]: val });
  const getValue = (key: string): any => edits[key] !== undefined ? edits[key] : (policy as any)?.[key];

  if (loading) return <div className="text-center py-4"><div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div></div>;

  const severityBadge = (sev: number): { label: string; tone: 'danger' | 'warning' | 'info' | 'neutral' } => {
    if (sev >= 5) return { label: 'Critical', tone: 'danger' };
    if (sev >= 4) return { label: 'High', tone: 'warning' };
    if (sev >= 2) return { label: 'Important', tone: 'info' };
    return { label: 'Info', tone: 'neutral' };
  };

  return (
    <div>
      {error && <div className="alert alert-danger alert-dismissible py-2 small"><button type="button" className="btn-close btn-close-sm" onClick={() => setError('')} />{error}</div>}
      {success && <div className="alert alert-success py-2 small">{success}</div>}

      {policy && (
        <>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div className="d-flex align-items-center gap-2">
              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  checked={getValue('enabled')}
                  onChange={(e) => setEdit('enabled', e.target.checked)}
                />
                <label className="form-check-label small fw-medium">
                  {getValue('enabled') ? 'Enabled' : 'Disabled'}
                </label>
              </div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || Object.keys(edits).length === 0}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>

          {/* Quiet Hours & Weekend */}
          <SectionCard title="Quiet Hours & Weekend" className="mb-4">
            <div className="row">
                <div className="col-md-4 mb-3">
                  <label className="form-label small fw-medium">Quiet Start</label>
                  <input type="text" className="form-control form-control-sm" value={getValue('quiet_hours_start')} onChange={(e) => setEdit('quiet_hours_start', e.target.value)} placeholder="22:00" />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label small fw-medium">Quiet End</label>
                  <input type="text" className="form-control form-control-sm" value={getValue('quiet_hours_end')} onChange={(e) => setEdit('quiet_hours_end', e.target.value)} placeholder="07:00" />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label small fw-medium">Timezone</label>
                  <input type="text" className="form-control form-control-sm" value={getValue('quiet_hours_timezone')} onChange={(e) => setEdit('quiet_hours_timezone', e.target.value)} />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label small fw-medium">Weekend Policy</label>
                  <select className="form-select form-select-sm" value={getValue('weekend_policy')} onChange={(e) => setEdit('weekend_policy', e.target.value)}>
                    <option value="normal">Normal</option>
                    <option value="quiet_hours_only">Quiet Hours Only</option>
                    <option value="silent">Silent</option>
                  </select>
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label small fw-medium">Cluster Window (min)</label>
                  <input type="number" className="form-control form-control-sm" value={getValue('cluster_window_minutes')} onChange={(e) => setEdit('cluster_window_minutes', parseInt(e.target.value, 10) || 10)} />
                </div>
                <div className="col-md-4 mb-3">
                  <div className="form-check form-switch mt-4">
                    <input className="form-check-input" type="checkbox" checked={getValue('acknowledgment_suppresses')} onChange={(e) => setEdit('acknowledgment_suppresses', e.target.checked)} />
                    <label className="form-check-label small fw-medium">Ack suppresses</label>
                  </div>
                </div>
            </div>
          </SectionCard>

          {/* Severity → Channel Mapping */}
          <SectionCard title="Severity → Channel Mapping" padded={false} className="mb-4">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th className="small fw-medium">Severity</th>
                  <th className="small fw-medium">Channels</th>
                </tr>
              </thead>
              <tbody>
                {(['info', 'important', 'high', 'critical'] as const).map((sev) => {
                  const channels = (getValue('severity_channel_map') || {})[sev] || [];
                  return (
                    <tr key={sev}>
                      <td className="small fw-medium text-capitalize">{sev}</td>
                      <td className="small">
                        {channels.map((ch: string) => (
                          <span key={ch} className="badge bg-light text-dark me-1">{ch}</span>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </SectionCard>

          {/* Rate Limits */}
          <SectionCard title="Rate Limits" className="mb-4">
            <div className="row">
              {Object.entries(getValue('rate_limits') || {}).map(([ch, limit]: [string, any]) => (
                <div className="col-md-4 mb-3" key={ch}>
                  <label className="form-label small fw-medium">{ch} (max/hr)</label>
                  <input type="number" className="form-control form-control-sm" value={limit.max_per_hour} readOnly />
                </div>
              ))}
            </div>
          </SectionCard>

          {/* Digest Settings */}
          <SectionCard title="Digest Settings" className="mb-4">
            <div className="row">
              <div className="col-md-4 mb-3">
                <div className="form-check form-switch">
                  <input className="form-check-input" type="checkbox" checked={getValue('digest_enabled')} onChange={(e) => setEdit('digest_enabled', e.target.checked)} />
                  <label className="form-check-label small fw-medium">Digest Enabled</label>
                </div>
              </div>
              <div className="col-md-4 mb-3">
                <label className="form-label small fw-medium">Morning Cron</label>
                <input type="text" className="form-control form-control-sm" value={getValue('digest_morning_cron')} onChange={(e) => setEdit('digest_morning_cron', e.target.value)} />
              </div>
              <div className="col-md-4 mb-3">
                <label className="form-label small fw-medium">Evening Cron</label>
                <input type="text" className="form-control form-control-sm" value={getValue('digest_evening_cron')} onChange={(e) => setEdit('digest_evening_cron', e.target.value)} />
              </div>
            </div>
          </SectionCard>

          {/* Test Escalation */}
          <SectionCard title="Test Escalation" className="mb-4">
            <div className="d-flex gap-2 align-items-end">
              <div>
                <label className="form-label small fw-medium">Severity</label>
                <select className="form-select form-select-sm" value={testSeverity} onChange={(e) => setTestSeverity(e.target.value)}>
                  <option value="info">Info</option>
                  <option value="important">Important</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
              <button className="btn btn-outline-danger btn-sm" onClick={handleTestEscalation} disabled={testing}>
                {testing ? 'Sending...' : 'Send Test Event'}
              </button>
            </div>
          </SectionCard>

          {/* Recent Events */}
          <SectionCard title="Recent Executive Events" padded={false}>
            <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th className="small fw-medium">Time</th>
                      <th className="small fw-medium">Severity</th>
                      <th className="small fw-medium">Title</th>
                      <th className="small fw-medium">Category</th>
                      <th className="small fw-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.length === 0 ? (
                      <tr><td colSpan={5} className="text-center text-muted py-3 small">No executive events yet</td></tr>
                    ) : events.map((evt) => {
                      const badge = severityBadge(evt.severity);
                      return (
                        <tr key={evt.id}>
                          <td className="small text-muted text-nowrap">
                            {new Date(evt.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td><StatusBadge label={badge.label} tone={badge.tone} /></td>
                          <td className="small">{evt.title}</td>
                          <td className="small"><span className="badge bg-light text-dark">{evt.metadata?.executive_category || '-'}</span></td>
                          <td className="small">
                            <StatusBadge
                              label={evt.status}
                              tone={evt.status === 'new' ? 'info' : evt.status === 'acknowledged' ? 'success' : 'neutral'}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}

// ─── AI COO Tab ─────────────────────────────────────────────────────────────

interface RiskData {
  stabilityScore: number;
  components: Record<string, number>;
  riskLevel: string;
  topRisks: string[];
}

interface MetricsData {
  revenue: { totalRevenue: number; totalEnrollments: number; paidEnrollments: number; pendingInvoice: number; seatsRemaining: number };
  funnel: { totalLeads: number; conversionRate: number; highIntent: number; thisMonth: number };
  campaign: { activeCampaigns: number; avgOpenRate: number; avgReplyRate: number; totalMeetings: number };
  operations: { totalAgents: number; healthyAgents: number; erroredAgents: number; avgErrorRate: number; errors24h: number };
  visitors: { total: number; sessions: number; bounceRate: number; today: number };
  opportunities: { pipelineValue: number; projectedRevenue: number; stalledCount: number; totalScored: number; avgScore: number };
}

interface RecommendationData {
  priority: string;
  domain: string;
  summary: string;
  recommendation: string;
  projectedImpact: string;
  confidence: number;
}

interface SimResult {
  baseline: { revenue: number; enrollments: number; operationalLoad: number };
  projected: { revenue: number; enrollments: number; operationalLoad: number };
  delta: { revenue: number; enrollments: number; operationalLoad: number };
  riskShift: number;
  assumptions: string[];
  confidence: number;
}

function AICOOTab() {
  const [risk, setRisk] = useState<RiskData | null>(null);
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Scenario Lab state
  const [scenarioType, setScenarioType] = useState('ad_spend_change');
  const [scenarioMagnitude, setScenarioMagnitude] = useState(10);
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<SimResult | null>(null);

  // Narrative
  const [narrative, setNarrative] = useState<any>(null);
  const [narrativePeriod, setNarrativePeriod] = useState<'morning' | 'evening'>('morning');
  const [loadingNarrative, setLoadingNarrative] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [riskRes, metricsRes, recsRes] = await Promise.all([
        apiFetch('/api/admin/strategic-intelligence/risk'),
        apiFetch('/api/admin/strategic-intelligence/metrics'),
        apiFetch('/api/admin/strategic-intelligence/recommendations'),
      ]);
      setRisk(riskRes);
      setMetrics(metricsRes);
      setRecommendations(recsRes.recommendations || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSimulate = async () => {
    try {
      setSimulating(true);
      setError('');
      const result = await apiFetch('/api/admin/strategic-intelligence/simulate', {
        method: 'POST',
        body: JSON.stringify({ type: scenarioType, magnitude: scenarioMagnitude }),
      });
      setSimResult(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSimulating(false);
    }
  };

  const loadNarrative = async () => {
    try {
      setLoadingNarrative(true);
      const res = await apiFetch(`/api/admin/strategic-intelligence/narrative/${narrativePeriod}`);
      setNarrative(res);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingNarrative(false);
    }
  };

  if (loading) return <div className="text-center py-4"><div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div></div>;

  const stabilityColor = (score: number) => {
    if (score >= 80) return 'var(--status-success)';
    if (score >= 60) return 'var(--status-warning)';
    if (score >= 40) return 'var(--chart-4)';
    return 'var(--status-danger)';
  };

  const priorityTone = (p: string): 'danger' | 'warning' | 'info' | 'neutral' => {
    if (p === 'critical') return 'danger';
    if (p === 'high') return 'warning';
    if (p === 'medium') return 'info';
    return 'neutral';
  };

  const fmtCurrency = (v: number) => {
    if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
    if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`;
    return `$${v.toFixed(0)}`;
  };

  return (
    <div>
      {error && <div className="alert alert-danger alert-dismissible py-2 small"><button type="button" className="btn-close btn-close-sm" onClick={() => setError('')} />{error}</div>}

      {/* 1. Strategic Stability Score */}
      {risk && (
        <SectionCard title="Strategic Stability Score" className="mb-4">
          <div className="row align-items-center">
            <div className="col-md-3 text-center">
              <div style={{ fontSize: '3rem', fontWeight: 700, color: stabilityColor(risk.stabilityScore) } as React.CSSProperties}>
                {risk.stabilityScore}
              </div>
              <StatusBadge
                label={risk.riskLevel}
                tone={risk.riskLevel === 'stable' ? 'success' : risk.riskLevel === 'watch' || risk.riskLevel === 'elevated' ? 'warning' : 'danger'}
              />
            </div>
            <div className="col-md-9">
              <div className="row">
                {Object.entries(risk.components).map(([key, val]) => (
                  <div className="col-md-4 mb-2" key={key}>
                    <div className="d-flex justify-content-between small">
                      <span className="text-muted">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                      <span className="fw-medium">{val}</span>
                    </div>
                    <div className="progress" style={{ height: 6 }}>
                      <div className="progress-bar" role="progressbar" style={{ width: `${val}%`, backgroundColor: stabilityColor(100 - val) } as React.CSSProperties} />
                    </div>
                  </div>
                ))}
              </div>
              {risk.topRisks.length > 0 && (
                <div className="mt-2">
                  {risk.topRisks.map((r, i) => (
                    <span key={i} className="badge bg-light text-dark me-1 mb-1" style={{ fontSize: '0.65rem' }}>{r}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </SectionCard>
      )}

      {/* 2. Key Metrics Overview */}
      {metrics && (
        <div className="row g-3 mb-4">
          {[
            { label: 'Revenue', val: fmtCurrency(metrics.revenue.totalRevenue), sub: `${metrics.revenue.totalEnrollments} enrolled`, icon: 'money-dollar-circle-line', tone: 'success' as const },
            { label: 'Pipeline', val: fmtCurrency(metrics.opportunities.pipelineValue), sub: `${metrics.opportunities.stalledCount} stalled`, icon: 'funds-line', tone: 'info' as const },
            { label: 'Leads', val: String(metrics.funnel.totalLeads), sub: `${metrics.funnel.conversionRate}% conv.`, icon: 'user-add-line', tone: 'primary' as const },
            { label: 'Visitors Today', val: String(metrics.visitors.today), sub: `${metrics.visitors.bounceRate.toFixed(0)}% bounce`, icon: 'eye-line', tone: 'neutral' as const },
            { label: 'Agent Fleet', val: `${metrics.operations.healthyAgents}/${metrics.operations.totalAgents}`, sub: `${metrics.operations.errors24h} errors 24h`, icon: 'robot-2-line', tone: metrics.operations.erroredAgents > 0 ? 'warning' as const : 'success' as const },
            { label: 'Campaigns', val: String(metrics.campaign.activeCampaigns), sub: `${metrics.campaign.avgOpenRate.toFixed(1)}% open`, icon: 'megaphone-line', tone: 'info' as const },
          ].map((card, i) => (
            <div className="col-6 col-md-4 col-lg-2" key={i}>
              <StatCard label={card.label} value={card.val} icon={card.icon} tone={card.tone} hint={card.sub} />
            </div>
          ))}
        </div>
      )}

      {/* 3. Recommendations */}
      <SectionCard title={`Strategic Recommendations (${recommendations.length})`} padded={false} className="mb-4">
        {recommendations.length === 0 ? (
          <div className="p-3 text-muted small">No actionable recommendations at this time.</div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th className="small fw-medium">Priority</th>
                  <th className="small fw-medium">Domain</th>
                  <th className="small fw-medium">Insight</th>
                  <th className="small fw-medium">Action</th>
                  <th className="small fw-medium text-end">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {recommendations.slice(0, 10).map((rec, i) => (
                  <tr key={i}>
                    <td><StatusBadge label={rec.priority} tone={priorityTone(rec.priority)} /></td>
                    <td className="small"><span className="badge bg-light text-dark">{rec.domain}</span></td>
                    <td className="small">{rec.summary}</td>
                    <td className="small text-muted">{rec.recommendation}</td>
                    <td className="small text-end">{(rec.confidence * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* 4. Scenario Lab */}
      <SectionCard title="Scenario Lab" className="mb-4">
          <div className="row align-items-end mb-3">
            <div className="col-md-4">
              <label className="form-label small fw-medium">Scenario Type</label>
              <select className="form-select form-select-sm" value={scenarioType} onChange={(e) => setScenarioType(e.target.value)}>
                <option value="ad_spend_change">Ad Spend Change</option>
                <option value="conversion_lift">Conversion Lift</option>
                <option value="pricing_change">Pricing Change</option>
                <option value="alignment_day_add">Alignment Day Capacity</option>
                <option value="roi_engagement_boost">ROI Engagement Boost</option>
              </select>
            </div>
            <div className="col-md-4">
              <label className="form-label small fw-medium">Magnitude: {scenarioMagnitude}%</label>
              <input type="range" className="form-range" min={-50} max={100} value={scenarioMagnitude} onChange={(e) => setScenarioMagnitude(parseInt(e.target.value, 10))} />
            </div>
            <div className="col-md-4">
              <button className="btn btn-primary btn-sm" onClick={handleSimulate} disabled={simulating}>
                {simulating ? 'Simulating...' : 'Simulate'}
              </button>
            </div>
          </div>

          {simResult && (
            <div className="row">
              {[
                { label: 'Revenue', base: fmtCurrency(simResult.baseline.revenue), proj: fmtCurrency(simResult.projected.revenue), delta: fmtCurrency(simResult.delta.revenue) },
                { label: 'Enrollments', base: simResult.baseline.enrollments.toFixed(1), proj: simResult.projected.enrollments.toFixed(1), delta: simResult.delta.enrollments.toFixed(1) },
                { label: 'Ops Load', base: String(simResult.baseline.operationalLoad), proj: String(simResult.projected.operationalLoad), delta: String(simResult.delta.operationalLoad) },
              ].map((col, i) => (
                <div className="col-md-4" key={i}>
                  <div className="card border-0 bg-light mb-2">
                    <div className="card-body py-2 px-3 text-center">
                      <div className="text-muted" style={{ fontSize: '0.65rem' }}>{col.label}</div>
                      <div className="small">Baseline: <strong>{col.base}</strong></div>
                      <div className="small">Projected: <strong style={{ color: 'var(--color-primary)' }}>{col.proj}</strong></div>
                      <div className="small">Delta: <strong className={simResult.delta.revenue >= 0 ? 'text-success' : 'text-danger'}>{col.delta}</strong></div>
                    </div>
                  </div>
                </div>
              ))}
              <div className="col-12 mt-2">
                <div className="small text-muted">
                  Confidence: {(simResult.confidence * 100).toFixed(0)}% | Risk shift: {simResult.riskShift > 0 ? '+' : ''}{simResult.riskShift}
                </div>
                <div className="small text-muted mt-1">
                  Assumptions: {simResult.assumptions.join(' | ')}
                </div>
              </div>
            </div>
          )}
      </SectionCard>

      {/* 5. Executive Narrative */}
      <SectionCard
        title="Executive Report"
        className="mb-4"
        actions={
          <div className="d-flex gap-2 align-items-center">
            <select className="form-select form-select-sm" value={narrativePeriod} onChange={(e) => setNarrativePeriod(e.target.value as 'morning' | 'evening')} style={{ width: 120 }}>
              <option value="morning">Morning</option>
              <option value="evening">Evening</option>
            </select>
            <button className="btn btn-outline-secondary btn-sm" onClick={loadNarrative} disabled={loadingNarrative}>
              {loadingNarrative ? 'Loading...' : 'Generate'}
            </button>
          </div>
        }
      >
        {narrative ? (
          <>
            <div className="d-flex justify-content-between align-items-center mb-3">
              <span className="badge bg-light text-dark">{narrative.period} report</span>
              <span style={{ fontSize: '0.75rem', color: stabilityColor(narrative.stabilityScore) } as React.CSSProperties}>
                Stability: {narrative.stabilityScore}/100
              </span>
            </div>
            {narrative.topActions?.length > 0 && (
              <div className="alert alert-info py-2 small mb-3">
                <strong>Top Actions:</strong>
                <ul className="mb-0 mt-1">
                  {narrative.topActions.map((a: string, i: number) => <li key={i}>{a}</li>)}
                </ul>
              </div>
            )}
            {Object.entries(narrative.sections || {}).map(([key, val]) => (
              <div key={key} className="mb-3">
                <h6 className="small fw-bold text-capitalize mb-1" style={{ color: 'var(--text-strong)' }}>
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </h6>
                <pre className="small text-muted mb-0" style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: '0.75rem' }}>
                  {val as string}
                </pre>
              </div>
            ))}
          </>
        ) : null}
      </SectionCard>
    </div>
  );
}

export default GovernanceCommandCenter;
