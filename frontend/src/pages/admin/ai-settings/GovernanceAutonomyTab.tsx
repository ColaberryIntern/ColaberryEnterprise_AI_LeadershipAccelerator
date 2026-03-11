import React, { useState, useEffect, useCallback } from 'react';
import api from '../../../utils/api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AutonomyRule {
  name: string;
  risk_min: number;
  risk_max: number;
  confidence_min: number;
  confidence_max: number;
  action: string;
}

interface SafetyLimits {
  max_agents: number;
  max_experiments: number;
  max_autonomous_decisions_per_hour: number;
  approval_required_for_critical_actions: boolean;
}

interface Experiment {
  id: string;
  experiment_name: string;
  agent: string;
  status: string;
  start_time: string;
  impact: any;
  risk_score: number;
  confidence_score: number;
}

const ACTION_COLORS: Record<string, string> = {
  auto_execute: 'success',
  require_approval: 'warning',
  allow_experiment: 'info',
  block: 'danger',
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function GovernanceAutonomyTab() {
  const [rules, setRules] = useState<AutonomyRule[]>([]);
  const [limits, setLimits] = useState<SafetyLimits | null>(null);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRules, setSavingRules] = useState(false);
  const [savingLimits, setSavingLimits] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [rulesRes, limitsRes, expRes] = await Promise.all([
        api.get('/api/admin/governance/autonomy-rules'),
        api.get('/api/admin/governance/safety-limits'),
        api.get('/api/admin/governance/experiments'),
      ]);
      setRules(rulesRes.data.rules || []);
      setLimits(limitsRes.data);
      setExperiments(expRes.data.experiments || []);
    } catch (err) {
      console.error('Failed to fetch autonomy data:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSaveRules = async () => {
    setSavingRules(true);
    try {
      const { data } = await api.put('/api/admin/governance/autonomy-rules', { rules });
      setRules(data.rules || rules);
    } catch { alert('Failed to save rules'); }
    setSavingRules(false);
  };

  const handleSaveLimits = async () => {
    if (!limits) return;
    setSavingLimits(true);
    try {
      const { data } = await api.patch('/api/admin/governance/safety-limits', limits);
      setLimits(data);
    } catch { alert('Failed to save limits'); }
    setSavingLimits(false);
  };

  const addRule = () => {
    setRules([...rules, {
      name: `RULE_${rules.length + 1}`,
      risk_min: 0,
      risk_max: 100,
      confidence_min: 0,
      confidence_max: 100,
      action: 'require_approval',
    }]);
  };

  const removeRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  const updateRule = (index: number, field: keyof AutonomyRule, value: any) => {
    const updated = [...rules];
    (updated[index] as any)[field] = value;
    setRules(updated);
  };

  if (loading) return <div className="text-center p-4 text-muted">Loading autonomy controls...</div>;

  return (
    <div className="p-3">
      {/* Section 4: Autonomy Rules */}
      <div className="card border-0 shadow-sm mb-3">
        <div className="card-header bg-white d-flex align-items-center justify-content-between">
          <h6 className="fw-semibold mb-0" style={{ fontSize: '0.85rem' }}>Autonomy Rules</h6>
          <button className="btn btn-sm btn-outline-primary" onClick={addRule} style={{ fontSize: '0.72rem' }}>
            + Add Rule
          </button>
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover mb-0" style={{ fontSize: '0.72rem' }}>
              <thead className="table-light">
                <tr>
                  <th>Rule Name</th>
                  <th className="text-center">Risk Range</th>
                  <th className="text-center">Confidence Range</th>
                  <th className="text-center">Action</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        type="text"
                        className="form-control form-control-sm border-0 bg-transparent"
                        value={rule.name}
                        onChange={(e) => updateRule(i, 'name', e.target.value)}
                        style={{ fontSize: '0.72rem', minWidth: 140 }}
                      />
                    </td>
                    <td className="text-center">
                      <div className="d-flex align-items-center gap-1 justify-content-center">
                        <input type="number" className="form-control form-control-sm" value={rule.risk_min} min={0} max={100}
                          onChange={(e) => updateRule(i, 'risk_min', parseInt(e.target.value, 10) || 0)}
                          style={{ width: 50, fontSize: '0.7rem' }} />
                        <span>-</span>
                        <input type="number" className="form-control form-control-sm" value={rule.risk_max} min={0} max={100}
                          onChange={(e) => updateRule(i, 'risk_max', parseInt(e.target.value, 10) || 0)}
                          style={{ width: 50, fontSize: '0.7rem' }} />
                      </div>
                    </td>
                    <td className="text-center">
                      <div className="d-flex align-items-center gap-1 justify-content-center">
                        <input type="number" className="form-control form-control-sm" value={rule.confidence_min} min={0} max={100}
                          onChange={(e) => updateRule(i, 'confidence_min', parseInt(e.target.value, 10) || 0)}
                          style={{ width: 50, fontSize: '0.7rem' }} />
                        <span>-</span>
                        <input type="number" className="form-control form-control-sm" value={rule.confidence_max} min={0} max={100}
                          onChange={(e) => updateRule(i, 'confidence_max', parseInt(e.target.value, 10) || 0)}
                          style={{ width: 50, fontSize: '0.7rem' }} />
                      </div>
                    </td>
                    <td className="text-center">
                      <select className="form-select form-select-sm" value={rule.action}
                        onChange={(e) => updateRule(i, 'action', e.target.value)}
                        style={{ fontSize: '0.7rem' }}>
                        <option value="auto_execute">Auto Execute</option>
                        <option value="require_approval">Require Approval</option>
                        <option value="allow_experiment">Allow Experiment</option>
                        <option value="block">Block</option>
                      </select>
                    </td>
                    <td className="text-center">
                      <button className="btn btn-sm btn-outline-danger" onClick={() => removeRule(i)}
                        style={{ fontSize: '0.6rem', padding: '2px 6px' }}>
                        &times;
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-2 text-end border-top">
            <button className="btn btn-sm btn-primary" onClick={handleSaveRules} disabled={savingRules}>
              {savingRules ? 'Saving...' : 'Save Rules'}
            </button>
          </div>
        </div>
      </div>

      {/* Section 5: Experiment Registry */}
      <div className="card border-0 shadow-sm mb-3">
        <div className="card-header bg-white">
          <h6 className="fw-semibold mb-0" style={{ fontSize: '0.85rem' }}>Experiment Registry</h6>
        </div>
        <div className="card-body p-0">
          {experiments.length === 0 ? (
            <div className="text-center p-3 text-muted" style={{ fontSize: '0.75rem' }}>No experiments found</div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover mb-0" style={{ fontSize: '0.72rem' }}>
                <thead className="table-light">
                  <tr>
                    <th>Experiment</th>
                    <th>Agent</th>
                    <th className="text-center">Status</th>
                    <th>Started</th>
                    <th className="text-center">Risk</th>
                    <th className="text-center">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {experiments.map((exp) => (
                    <tr key={exp.id}>
                      <td>{exp.experiment_name}</td>
                      <td>{exp.agent}</td>
                      <td className="text-center">
                        <span className={`badge bg-${exp.status === 'monitoring' || exp.status === 'executing' ? 'primary' : exp.status === 'completed' ? 'success' : 'secondary'}`}
                          style={{ fontSize: '0.6rem' }}>
                          {exp.status}
                        </span>
                      </td>
                      <td>{exp.start_time ? new Date(exp.start_time).toLocaleDateString() : '-'}</td>
                      <td className="text-center">{exp.risk_score}</td>
                      <td className="text-center">{exp.confidence_score}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Section 7: AI Safety Controls */}
      {limits && (
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white">
            <h6 className="fw-semibold mb-0" style={{ fontSize: '0.85rem' }}>AI Safety Controls</h6>
          </div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label small fw-medium">Max Agents</label>
                <input type="number" className="form-control form-control-sm"
                  value={limits.max_agents}
                  onChange={(e) => setLimits({ ...limits, max_agents: parseInt(e.target.value, 10) || 0 })}
                  min={1} max={500} />
              </div>
              <div className="col-md-6">
                <label className="form-label small fw-medium">Max Experiments</label>
                <input type="number" className="form-control form-control-sm"
                  value={limits.max_experiments}
                  onChange={(e) => setLimits({ ...limits, max_experiments: parseInt(e.target.value, 10) || 0 })}
                  min={0} max={50} />
              </div>
              <div className="col-md-6">
                <label className="form-label small fw-medium">Max Autonomous Decisions/Hour</label>
                <input type="number" className="form-control form-control-sm"
                  value={limits.max_autonomous_decisions_per_hour}
                  onChange={(e) => setLimits({ ...limits, max_autonomous_decisions_per_hour: parseInt(e.target.value, 10) || 0 })}
                  min={0} max={100} />
              </div>
              <div className="col-md-6 d-flex align-items-end">
                <div className="form-check form-switch">
                  <input className="form-check-input" type="checkbox"
                    checked={limits.approval_required_for_critical_actions}
                    onChange={(e) => setLimits({ ...limits, approval_required_for_critical_actions: e.target.checked })} />
                  <label className="form-check-label small">Approval Required for Critical Actions</label>
                </div>
              </div>
            </div>
            <div className="mt-3 text-end">
              <button className="btn btn-sm btn-primary" onClick={handleSaveLimits} disabled={savingLimits}>
                {savingLimits ? 'Saving...' : 'Save Limits'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
