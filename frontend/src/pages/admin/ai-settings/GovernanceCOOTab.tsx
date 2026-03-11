import React, { useState, useEffect, useCallback } from 'react';
import api from '../../../utils/api';

interface COOConfig {
  cory_status: string;
  cory_autonomy_level: string;
  cory_experiment_budget: number;
  cory_decision_authority: string;
  enable_agent_hiring: boolean;
  enable_experiments: boolean;
  enable_auto_optimization: boolean;
}

interface DepartmentSummary {
  department: string;
  agent_count: number;
  healthy: number;
  errored: number;
  paused: number;
  agents: Array<{
    id: string;
    agent_name: string;
    status: string;
    enabled: boolean;
    run_count: number;
    error_count: number;
    last_run_at: string | null;
  }>;
}

const STATUS_COLORS: Record<string, string> = {
  active: 'success',
  paused: 'warning',
  manual: 'secondary',
};

const DEPT_COLORS: Record<string, string> = {
  Intelligence: '#2b6cb0',
  Operations: '#38a169',
  Growth: '#805ad5',
  Maintenance: '#718096',
  Security: '#e53e3e',
};

export default function GovernanceCOOTab() {
  const [config, setConfig] = useState<COOConfig | null>(null);
  const [departments, setDepartments] = useState<DepartmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedDept, setExpandedDept] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [configRes, deptRes] = await Promise.all([
        api.get('/api/admin/governance/coo-config'),
        api.get('/api/admin/governance/departments'),
      ]);
      setConfig(configRes.data);
      setDepartments(deptRes.data.departments || []);
    } catch (err) {
      console.error('Failed to fetch COO config:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const { data } = await api.patch('/api/admin/governance/coo-config', config);
      setConfig(data);
    } catch (err) {
      alert('Failed to save COO config');
    }
    setSaving(false);
  };

  if (loading) return <div className="text-center p-4 text-muted">Loading COO configuration...</div>;
  if (!config) return <div className="text-center p-4 text-muted">Failed to load configuration.</div>;

  return (
    <div className="p-3">
      {/* Section 1: AI COO Controls */}
      <div className="card border-0 shadow-sm mb-3">
        <div className="card-header bg-white d-flex align-items-center gap-2">
          <div
            className="d-flex align-items-center justify-content-center rounded-circle fw-bold text-white"
            style={{ width: 32, height: 32, background: 'var(--color-primary)', fontSize: '0.85rem' }}
          >
            C
          </div>
          <div>
            <h6 className="fw-semibold mb-0" style={{ fontSize: '0.85rem' }}>Cory &mdash; AI Chief Operating Officer</h6>
            <small className="text-muted" style={{ fontSize: '0.68rem' }}>
              Controls autonomy, experiments, and agent hiring
            </small>
          </div>
          <span className={`badge bg-${STATUS_COLORS[config.cory_status] || 'secondary'} ms-auto`}>
            {config.cory_status}
          </span>
        </div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label small fw-medium">Status</label>
              <select
                className="form-select form-select-sm"
                value={config.cory_status}
                onChange={(e) => setConfig({ ...config, cory_status: e.target.value })}
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="manual">Manual</option>
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-medium">Autonomy Level</label>
              <select
                className="form-select form-select-sm"
                value={config.cory_autonomy_level}
                onChange={(e) => setConfig({ ...config, cory_autonomy_level: e.target.value })}
              >
                <option value="full">Full Autonomy</option>
                <option value="safe">Safe Mode</option>
                <option value="manual">Manual Only</option>
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-medium">Experiment Budget</label>
              <input
                type="number"
                className="form-control form-control-sm"
                value={config.cory_experiment_budget}
                onChange={(e) => setConfig({ ...config, cory_experiment_budget: parseInt(e.target.value, 10) || 0 })}
                min={0}
                max={20}
              />
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-medium">Decision Authority</label>
              <select
                className="form-select form-select-sm"
                value={config.cory_decision_authority}
                onChange={(e) => setConfig({ ...config, cory_decision_authority: e.target.value })}
              >
                <option value="auto_safe">Auto-execute safe actions</option>
                <option value="propose_all">Propose all (no auto-execute)</option>
                <option value="manual_only">Manual only</option>
              </select>
            </div>
          </div>

          <hr className="my-3" />

          <div className="row g-3">
            <div className="col-md-4">
              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  checked={config.enable_agent_hiring}
                  onChange={(e) => setConfig({ ...config, enable_agent_hiring: e.target.checked })}
                />
                <label className="form-check-label small">Enable Agent Hiring</label>
              </div>
            </div>
            <div className="col-md-4">
              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  checked={config.enable_experiments}
                  onChange={(e) => setConfig({ ...config, enable_experiments: e.target.checked })}
                />
                <label className="form-check-label small">Enable Experiments</label>
              </div>
            </div>
            <div className="col-md-4">
              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  checked={config.enable_auto_optimization}
                  onChange={(e) => setConfig({ ...config, enable_auto_optimization: e.target.checked })}
                />
                <label className="form-check-label small">Enable Auto-Optimization</label>
              </div>
            </div>
          </div>

          <div className="mt-3 text-end">
            <button className="btn btn-sm btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>
      </div>

      {/* Section 2: Department Structure */}
      <h6 className="fw-semibold mb-2" style={{ fontSize: '0.85rem' }}>Department Structure</h6>
      <div className="row g-2">
        {departments.map((dept) => (
          <div key={dept.department} className="col-12 col-md-6 col-xl-4">
            <div
              className="card border-0 shadow-sm h-100"
              style={{ cursor: 'pointer' }}
              onClick={() => setExpandedDept(expandedDept === dept.department ? null : dept.department)}
            >
              <div className="card-body p-3">
                <div className="d-flex align-items-center gap-2 mb-2">
                  <div
                    className="rounded-circle"
                    style={{ width: 12, height: 12, background: DEPT_COLORS[dept.department] || '#718096' }}
                  />
                  <span className="fw-semibold" style={{ fontSize: '0.82rem' }}>{dept.department}</span>
                  <span className="badge bg-light text-muted border ms-auto" style={{ fontSize: '0.6rem' }}>
                    {dept.agent_count}
                  </span>
                </div>
                <div className="d-flex gap-3" style={{ fontSize: '0.72rem' }}>
                  <span className="text-success">{dept.healthy} healthy</span>
                  <span className="text-danger">{dept.errored} errored</span>
                  <span className="text-warning">{dept.paused} paused</span>
                </div>
                <div className="progress mt-2" style={{ height: 4 }}>
                  <div className="progress-bar bg-success" style={{ width: `${(dept.healthy / Math.max(dept.agent_count, 1)) * 100}%` }} />
                  <div className="progress-bar bg-danger" style={{ width: `${(dept.errored / Math.max(dept.agent_count, 1)) * 100}%` }} />
                  <div className="progress-bar bg-warning" style={{ width: `${(dept.paused / Math.max(dept.agent_count, 1)) * 100}%` }} />
                </div>

                {expandedDept === dept.department && dept.agents.length > 0 && (
                  <div className="mt-2 pt-2 border-top">
                    {dept.agents.map((a) => (
                      <div key={a.id} className="d-flex align-items-center gap-2 py-1" style={{ fontSize: '0.7rem' }}>
                        <span
                          className="d-inline-block rounded-circle"
                          style={{
                            width: 6,
                            height: 6,
                            background: a.status === 'error' ? '#e53e3e' : a.enabled ? '#38a169' : '#d69e2e',
                          }}
                        />
                        <span className="text-truncate">{a.agent_name}</span>
                        <span className="text-muted ms-auto">{a.run_count} runs</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
