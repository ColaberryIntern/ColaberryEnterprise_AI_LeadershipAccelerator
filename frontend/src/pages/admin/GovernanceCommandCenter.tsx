import React, { useState, useEffect, useCallback } from 'react';

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
              <span className={`badge ${config.source === 'database' ? 'bg-success' : 'bg-warning text-dark'} me-2`}>
                Source: {config.source}
              </span>
            </div>
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || Object.keys(edits).length === 0}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>

          <div className="card border-0 shadow-sm mb-4">
            <div className="card-header bg-white fw-semibold">Autonomy & Execution</div>
            <div className="card-body">
              <div className="row">
                {field('autonomy_mode', 'Autonomy Mode', 'select')}
                {field('max_auto_executions_per_hour', 'Max Auto-Executions / Hour')}
                {field('max_risk_budget_per_hour', 'Max Risk Budget / Hour')}
                {field('auto_execute_risk_threshold', 'Risk Threshold (auto-execute below)')}
                {field('auto_execute_confidence_threshold', 'Confidence Threshold (auto-execute above)')}
                {field('approval_required_for_critical', 'Require Approval for Critical Actions', 'boolean')}
              </div>
            </div>
          </div>

          <div className="card border-0 shadow-sm mb-4">
            <div className="card-header bg-white fw-semibold">Resource Limits</div>
            <div className="card-body">
              <div className="row">
                {field('max_dynamic_agents', 'Max Dynamic Agents')}
                {field('max_agents_total', 'Max Agents Total')}
                {field('max_proposed_pending', 'Max Pending Proposals')}
                {field('max_concurrent_monitoring', 'Max Concurrent Monitors')}
              </div>
            </div>
          </div>

          <div className="card border-0 shadow-sm mb-4">
            <div className="card-header bg-white fw-semibold">Experiments</div>
            <div className="card-body">
              <div className="row">
                {field('max_experiments_per_agent', 'Max Experiments per Agent')}
                {field('max_system_experiments', 'Max System Experiments')}
              </div>
            </div>
          </div>
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
    <div className="card border-0 shadow-sm mb-4">
      <div className="card-header bg-white fw-semibold">{title}</div>
      <div className="card-body p-0">
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
                  <span className={`badge ${val >= 70 ? 'bg-danger' : val >= 40 ? 'bg-warning text-dark' : 'bg-success'}`}>
                    {val}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div>
      {error && <div className="alert alert-danger alert-dismissible py-2 small"><button type="button" className="btn-close btn-close-sm" onClick={() => setError('')} />{error}</div>}
      {success && <div className="alert alert-success py-2 small">{success}</div>}

      {config && (
        <>
          <span className={`badge ${config.source === 'database' ? 'bg-success' : 'bg-warning text-dark'} mb-3`}>
            Source: {config.source}
          </span>

          <div className="card border-0 shadow-sm mb-4">
            <div className="card-header bg-white fw-semibold d-flex justify-content-between">
              <span>Intent Thresholds</span>
              <button className="btn btn-primary btn-sm" onClick={handleSaveIntents} disabled={saving || Object.keys(intentEdits).length === 0}>
                {saving ? 'Saving...' : 'Save Thresholds'}
              </button>
            </div>
            <div className="card-body">
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
            </div>
          </div>

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

      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-semibold">Active Autonomy Rules ({rules.length})</div>
        <div className="card-body p-0">
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
                      <span className={`badge ${rule.mode === 'full' ? 'bg-success' : rule.mode === 'safe' ? 'bg-warning text-dark' : 'bg-danger'}`}>
                        {rule.mode}
                      </span>
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
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

function GovernanceCommandCenter() {
  const [activeTab, setActiveTab] = useState('system');

  return (
    <div className="container-fluid py-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h4 className="mb-1 fw-bold" style={{ color: 'var(--color-primary)' }}>
            Governance Command Center
          </h4>
          <p className="text-muted small mb-0">
            Centralized control for all system governance, safety limits, agent schedules, and risk configuration.
          </p>
        </div>
      </div>

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
    </div>
  );
}

export default GovernanceCommandCenter;
