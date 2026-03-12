import { useState, useEffect, useCallback } from 'react';
import api from '../../../../utils/api';

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

interface SafetyTabProps {
  entityFilter?: { type: string; id: string; name: string } | null;
  layerFilter?: number | null;
}

const ACTION_COLORS: Record<string, string> = {
  auto_execute: 'success',
  require_approval: 'warning',
  allow_experiment: 'info',
  block: 'danger',
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function SafetyTab({ entityFilter }: SafetyTabProps) {
  const [rules, setRules] = useState<AutonomyRule[]>([]);
  const [limits, setLimits] = useState<SafetyLimits | null>(null);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRules, setSavingRules] = useState(false);
  const [savingLimits, setSavingLimits] = useState(false);
  const [selectedExperiment, setSelectedExperiment] = useState<Experiment | null>(null);
  const [selectedRule, setSelectedRule] = useState<{ rule: AutonomyRule; index: number } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [rulesRes, limitsRes, expRes] = await Promise.all([
        api.get('/api/admin/governance/autonomy-rules'),
        api.get('/api/admin/governance/safety-limits'),
        api.get('/api/admin/governance/experiments'),
      ]);
      setRules(rulesRes.data.rules || []);
      setLimits(limitsRes.data);
      let exps = expRes.data.experiments || [];
      // Filter experiments by entity if applicable
      if (entityFilter) {
        const t = entityFilter.type.toLowerCase();
        if (t === 'agent' || t === 'ai agents' || t === 'ai_agents') {
          exps = exps.filter((e: Experiment) =>
            e.agent?.toLowerCase().includes(entityFilter.name.toLowerCase())
          );
        }
      }
      setExperiments(exps);
    } catch (err) {
      console.error('Failed to fetch autonomy data:', err);
    }
    setLoading(false);
  }, [entityFilter]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

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

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border spinner-border-sm text-primary" role="status">
          <span className="visually-hidden">Loading safety controls...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3">
      {entityFilter && (
        <div className="alert alert-info py-2 d-flex align-items-center gap-2 small mb-3">
          <strong>Note:</strong> Safety rules are system-wide. Experiments filtered by <strong>{entityFilter.name}</strong>.
        </div>
      )}

      {/* Autonomy Rules */}
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
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule, i) => (
                  <tr key={i}>
                    <td className="fw-medium">{rule.name}</td>
                    <td className="text-center">{rule.risk_min} – {rule.risk_max}</td>
                    <td className="text-center">{rule.confidence_min} – {rule.confidence_max}</td>
                    <td className="text-center">
                      <span className={`badge bg-${ACTION_COLORS[rule.action] || 'secondary'}`}>
                        {rule.action.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>
                      <div className="d-flex gap-1">
                        <button
                          className="btn btn-sm btn-outline-primary py-0 px-2"
                          onClick={() => setSelectedRule({ rule, index: i })}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-sm btn-outline-danger py-0 px-2"
                          onClick={() => removeRule(i)}
                        >
                          &times;
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {rules.length === 0 && (
                  <tr><td colSpan={5} className="text-muted text-center py-3">No autonomy rules configured</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {rules.length > 0 && (
            <div className="p-2 text-end border-top">
              <button className="btn btn-sm btn-primary" onClick={handleSaveRules} disabled={savingRules}>
                {savingRules ? 'Saving...' : 'Save Rules'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Experiment Registry */}
      <div className="card border-0 shadow-sm mb-3">
        <div className="card-header bg-white d-flex align-items-center justify-content-between">
          <h6 className="fw-semibold mb-0" style={{ fontSize: '0.85rem' }}>
            Experiment Registry
            {entityFilter && <span className="text-muted fw-normal ms-2">({experiments.length})</span>}
          </h6>
        </div>
        <div className="card-body p-0">
          {experiments.length === 0 ? (
            <div className="text-center p-3 text-muted" style={{ fontSize: '0.75rem' }}>
              No experiments found{entityFilter ? ` for ${entityFilter.name}` : ''}
            </div>
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
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {experiments.map((exp) => (
                    <tr key={exp.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedExperiment(exp)}>
                      <td className="fw-medium">{exp.experiment_name}</td>
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
                      <td>
                        <button className="btn btn-sm btn-outline-primary py-0 px-2" onClick={(e) => { e.stopPropagation(); setSelectedExperiment(exp); }}>
                          Detail
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* AI Safety Controls */}
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

      {/* Rule Edit Modal */}
      {selectedRule && (
        <div className="modal show d-block" style={{ zIndex: 1060 }} role="dialog" aria-modal="true">
          <div className="modal-backdrop show" style={{ zIndex: -1 }} onClick={() => setSelectedRule(null)} />
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content border-0 shadow">
              <div className="modal-header" style={{ background: 'var(--color-primary)', color: '#fff' }}>
                <h6 className="modal-title mb-0">Edit Rule: {selectedRule.rule.name}</h6>
                <button className="btn-close btn-close-white" onClick={() => setSelectedRule(null)} />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label small fw-medium">Rule Name</label>
                  <input type="text" className="form-control form-control-sm"
                    value={rules[selectedRule.index]?.name || ''}
                    onChange={(e) => updateRule(selectedRule.index, 'name', e.target.value)} />
                </div>
                <div className="row g-3 mb-3">
                  <div className="col-6">
                    <label className="form-label small fw-medium">Risk Min</label>
                    <input type="number" className="form-control form-control-sm"
                      value={rules[selectedRule.index]?.risk_min || 0} min={0} max={100}
                      onChange={(e) => updateRule(selectedRule.index, 'risk_min', parseInt(e.target.value, 10) || 0)} />
                  </div>
                  <div className="col-6">
                    <label className="form-label small fw-medium">Risk Max</label>
                    <input type="number" className="form-control form-control-sm"
                      value={rules[selectedRule.index]?.risk_max || 0} min={0} max={100}
                      onChange={(e) => updateRule(selectedRule.index, 'risk_max', parseInt(e.target.value, 10) || 0)} />
                  </div>
                </div>
                <div className="row g-3 mb-3">
                  <div className="col-6">
                    <label className="form-label small fw-medium">Confidence Min</label>
                    <input type="number" className="form-control form-control-sm"
                      value={rules[selectedRule.index]?.confidence_min || 0} min={0} max={100}
                      onChange={(e) => updateRule(selectedRule.index, 'confidence_min', parseInt(e.target.value, 10) || 0)} />
                  </div>
                  <div className="col-6">
                    <label className="form-label small fw-medium">Confidence Max</label>
                    <input type="number" className="form-control form-control-sm"
                      value={rules[selectedRule.index]?.confidence_max || 0} min={0} max={100}
                      onChange={(e) => updateRule(selectedRule.index, 'confidence_max', parseInt(e.target.value, 10) || 0)} />
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label small fw-medium">Action</label>
                  <select className="form-select form-select-sm"
                    value={rules[selectedRule.index]?.action || 'require_approval'}
                    onChange={(e) => updateRule(selectedRule.index, 'action', e.target.value)}>
                    <option value="auto_execute">Auto Execute</option>
                    <option value="require_approval">Require Approval</option>
                    <option value="allow_experiment">Allow Experiment</option>
                    <option value="block">Block</option>
                  </select>
                </div>
                <div className="text-end">
                  <button className="btn btn-sm btn-primary" onClick={() => { setSelectedRule(null); }}>
                    Done
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Experiment Detail Modal */}
      {selectedExperiment && (
        <div className="modal show d-block" style={{ zIndex: 1060 }} role="dialog" aria-modal="true">
          <div className="modal-backdrop show" style={{ zIndex: -1 }} onClick={() => setSelectedExperiment(null)} />
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content border-0 shadow">
              <div className="modal-header" style={{ background: 'var(--color-primary)', color: '#fff' }}>
                <h6 className="modal-title mb-0">Experiment: {selectedExperiment.experiment_name}</h6>
                <button className="btn-close btn-close-white" onClick={() => setSelectedExperiment(null)} />
              </div>
              <div className="modal-body">
                <div className="row g-3">
                  <div className="col-sm-6">
                    <label className="form-label small fw-medium text-muted">Agent</label>
                    <div className="fw-semibold">{selectedExperiment.agent}</div>
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label small fw-medium text-muted">Status</label>
                    <div>
                      <span className={`badge bg-${selectedExperiment.status === 'monitoring' || selectedExperiment.status === 'executing' ? 'primary' : selectedExperiment.status === 'completed' ? 'success' : 'secondary'}`}>
                        {selectedExperiment.status}
                      </span>
                    </div>
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label small fw-medium text-muted">Risk Score</label>
                    <div>
                      <span className={`badge bg-${selectedExperiment.risk_score > 70 ? 'danger' : selectedExperiment.risk_score > 40 ? 'warning' : 'success'}`}>
                        {selectedExperiment.risk_score}/100
                      </span>
                    </div>
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label small fw-medium text-muted">Confidence Score</label>
                    <div>
                      <span className={`badge bg-${selectedExperiment.confidence_score >= 80 ? 'success' : selectedExperiment.confidence_score >= 60 ? 'warning' : 'danger'}`}>
                        {selectedExperiment.confidence_score}/100
                      </span>
                    </div>
                  </div>
                  <div className="col-sm-6">
                    <label className="form-label small fw-medium text-muted">Started</label>
                    <div>{selectedExperiment.start_time ? new Date(selectedExperiment.start_time).toLocaleString() : 'Not started'}</div>
                  </div>
                  {selectedExperiment.impact && (
                    <div className="col-12">
                      <label className="form-label small fw-medium text-muted">Impact</label>
                      <pre className="bg-light rounded p-2 small mb-0" style={{ maxHeight: 200, overflow: 'auto', fontSize: '0.72rem' }}>
                        {typeof selectedExperiment.impact === 'string'
                          ? selectedExperiment.impact
                          : JSON.stringify(selectedExperiment.impact, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
