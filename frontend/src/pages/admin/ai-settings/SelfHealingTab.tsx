import React, { useState, useCallback, useEffect } from 'react';
import api from '../../../utils/api';

// ─── Types ──────────────────────────────────────────────────────────

interface HealingAction {
  id: string;
  action_type: 'prompt_rewrite' | 'variable_fix' | 'flow_adjustment' | 'structure_improvement';
  target_id: string;
  target_label: string;
  prompt_field?: string;
  description: string;
  risk_level: 'low' | 'medium' | 'high';
  blocked: boolean;
  block_reason?: string;
  status: 'pending' | 'approved' | 'applied' | 'rejected' | 'skipped';
  before_value?: any;
  after_value?: any;
  changes_explanation?: string;
  evidence: Record<string, any>;
}

interface HealingPlan {
  id: string;
  status: 'draft' | 'preview' | 'approved' | 'applied' | 'rejected' | 'partial';
  overall_risk_level: 'low' | 'medium' | 'high';
  source_diagnostics: Record<string, any>;
  actions: HealingAction[];
  governance_insight_id?: string;
  rejection_reason?: string;
  applied_action_ids?: string[];
  created_at: string;
  applied_at?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

function actionTypeBadge(type: string): string {
  switch (type) {
    case 'prompt_rewrite': return 'info';
    case 'variable_fix': return 'success';
    case 'flow_adjustment': return 'warning';
    case 'structure_improvement': return 'secondary';
    default: return 'secondary';
  }
}

function riskBadge(risk: string): string {
  return risk === 'high' ? 'danger' : risk === 'medium' ? 'warning' : 'success';
}

function statusBadge(status: string): string {
  switch (status) {
    case 'draft': return 'secondary';
    case 'preview': return 'info';
    case 'applied': return 'success';
    case 'partial': return 'warning';
    case 'rejected': return 'danger';
    default: return 'secondary';
  }
}

function healthColor(score: number): string {
  return score > 80 ? 'success' : score > 50 ? 'warning' : 'danger';
}

// ─── Component ──────────────────────────────────────────────────────

const SelfHealingTab: React.FC = () => {
  const [plan, setPlan] = useState<HealingPlan | null>(null);
  const [history, setHistory] = useState<HealingPlan[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [expandedAction, setExpandedAction] = useState<string | null>(null);
  const [selectedActions, setSelectedActions] = useState<Set<string>>(new Set());
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await api.get('/api/admin/orchestration/self-healing/history');
      setHistory(res.data);
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await api.get('/api/admin/orchestration/self-healing/plan');
      setPlan(res.data);
      setSelectedActions(new Set());
      setShowRejectForm(false);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to generate healing plan');
    } finally {
      setGenerating(false);
    }
  }, []);

  const handlePreview = useCallback(async () => {
    if (!plan) return;
    setPreviewing(true);
    setError(null);
    try {
      const res = await api.post(`/api/admin/orchestration/self-healing/plan/${plan.id}/preview`);
      setPlan(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Preview failed');
    } finally {
      setPreviewing(false);
    }
  }, [plan]);

  const handleApply = useCallback(async () => {
    if (!plan || selectedActions.size === 0) return;
    setApplying(true);
    setError(null);
    try {
      const res = await api.post(`/api/admin/orchestration/self-healing/plan/${plan.id}/apply`, {
        actionIds: [...selectedActions],
      });
      setPlan(res.data);
      setSelectedActions(new Set());
      fetchHistory();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Apply failed');
    } finally {
      setApplying(false);
    }
  }, [plan, selectedActions, fetchHistory]);

  const handleReject = useCallback(async () => {
    if (!plan) return;
    setError(null);
    try {
      const res = await api.post(`/api/admin/orchestration/self-healing/plan/${plan.id}/reject`, {
        reason: rejectReason || 'Rejected by admin',
      });
      setPlan(res.data);
      setRejectReason('');
      setShowRejectForm(false);
      fetchHistory();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Reject failed');
    }
  }, [plan, rejectReason, fetchHistory]);

  const toggleAction = (actionId: string) => {
    setSelectedActions(prev => {
      const next = new Set(prev);
      if (next.has(actionId)) next.delete(actionId);
      else next.add(actionId);
      return next;
    });
  };

  const selectAllSafe = () => {
    if (!plan) return;
    const safe = plan.actions.filter(a => !a.blocked && a.status === 'pending').map(a => a.id);
    setSelectedActions(new Set(safe));
  };

  const diag = plan?.source_diagnostics;
  const canGenerate = !plan || plan.status === 'applied' || plan.status === 'rejected';
  const canPreview = plan?.status === 'draft';
  const canApply = plan?.status === 'preview' && selectedActions.size > 0;

  return (
    <div>
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6 className="fw-semibold mb-0">Self-Healing Engine</h6>
        {canGenerate && (
          <button className="btn btn-sm btn-primary" onClick={handleGenerate} disabled={generating}>
            {generating ? (
              <>
                <span className="spinner-border spinner-border-sm me-1" role="status">
                  <span className="visually-hidden">Generating...</span>
                </span>
                Analyzing...
              </>
            ) : 'Generate Healing Plan'}
          </button>
        )}
      </div>

      {error && <div className="alert alert-danger small">{error}</div>}

      {/* Panel 1: Health Summary */}
      {diag && (
        <div className="card border-0 shadow-sm mb-3">
          <div className="card-header bg-white fw-semibold">Health Summary</div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-3">
                <div className="text-muted small">System Health</div>
                <div className="fs-4 fw-bold">
                  {diag.system_health_score ?? '—'}
                  {diag.system_health_score != null && (
                    <span className={`badge bg-${healthColor(diag.system_health_score)} ms-1`}>
                      {diag.system_health_score > 80 ? 'Healthy' : diag.system_health_score > 50 ? 'Fair' : 'At Risk'}
                    </span>
                  )}
                </div>
              </div>
              <div className="col-md-3">
                <div className="text-muted small">Unstable Lessons</div>
                <div className="fs-4 fw-bold">{diag.unstable_lessons ?? 0}</div>
              </div>
              <div className="col-md-3">
                <div className="text-muted small">Variable Failures</div>
                <div className="fs-4 fw-bold">{diag.variable_failures ?? 0}</div>
              </div>
              <div className="col-md-3">
                <div className="text-muted small">Timeline Violations</div>
                <div className="fs-4 fw-bold">{diag.timeline_violations ?? 0}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Panel 2: Healing Plan */}
      {plan && (
        <div className="card border-0 shadow-sm mb-3">
          <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
            <div>
              Healing Plan
              <span className={`badge bg-${statusBadge(plan.status)} ms-2`}>{plan.status}</span>
              <span className={`badge bg-${riskBadge(plan.overall_risk_level)} ms-1`}>Risk: {plan.overall_risk_level}</span>
              <span className="badge bg-secondary ms-1">{plan.actions.length} actions</span>
            </div>
          </div>
          <div className="card-body p-0">
            {plan.status === 'applied' && (
              <div className="alert alert-success m-3 small mb-0">
                Plan applied successfully. {plan.applied_action_ids?.length || 0} actions were executed.
                {plan.governance_insight_id && (
                  <span className="ms-1">Governance insight: <code>{plan.governance_insight_id.substring(0, 8)}...</code></span>
                )}
              </div>
            )}

            {plan.status === 'partial' && (
              <div className="alert alert-warning m-3 small mb-0">
                Plan partially applied. Some actions were skipped or blocked.
              </div>
            )}

            {plan.status === 'rejected' && (
              <div className="alert alert-danger m-3 small mb-0">
                Plan rejected. {plan.rejection_reason && <>Reason: {plan.rejection_reason}</>}
              </div>
            )}

            {plan.actions.length === 0 ? (
              <div className="text-muted text-center py-4 small">
                No healing actions needed — system is healthy.
              </div>
            ) : (
              <ul className="list-group list-group-flush">
                {plan.actions.map(action => (
                  <li key={action.id} className="list-group-item p-0">
                    {/* Action Summary Row */}
                    <div
                      className="d-flex align-items-center gap-2 px-3 py-2"
                      style={{ cursor: 'pointer' }}
                      onClick={() => setExpandedAction(expandedAction === action.id ? null : action.id)}
                    >
                      {plan.status === 'preview' && action.status === 'pending' && (
                        <input
                          type="checkbox"
                          className="form-check-input mt-0"
                          checked={selectedActions.has(action.id)}
                          disabled={action.blocked}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleAction(action.id);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                      <span className={`badge bg-${actionTypeBadge(action.action_type)}`}>
                        {action.action_type.replace(/_/g, ' ')}
                      </span>
                      <span className="small fw-medium flex-grow-1">{action.target_label}</span>
                      <span className={`badge bg-${riskBadge(action.risk_level)}`}>{action.risk_level}</span>
                      {action.blocked && <span className="badge bg-danger">blocked</span>}
                      {action.status !== 'pending' && (
                        <span className={`badge bg-${action.status === 'applied' ? 'success' : action.status === 'rejected' ? 'danger' : 'secondary'}`}>
                          {action.status}
                        </span>
                      )}
                      <span className="text-muted small">{expandedAction === action.id ? '▲' : '▼'}</span>
                    </div>

                    {/* Expanded Detail */}
                    {expandedAction === action.id && (
                      <div className="px-3 pb-3 border-top bg-light">
                        <div className="small text-muted mt-2">{action.description}</div>

                        {action.block_reason && (
                          <div className="alert alert-warning small mt-2 mb-0 py-1 px-2">{action.block_reason}</div>
                        )}

                        {/* Evidence */}
                        {Object.keys(action.evidence).length > 0 && (
                          <div className="mt-2">
                            <div className="text-muted small fw-medium">Evidence</div>
                            <div className="d-flex flex-wrap gap-1 mt-1">
                              {action.evidence.avg_quality_score != null && (
                                <span className="badge bg-light text-dark border">Quality: {action.evidence.avg_quality_score}</span>
                              )}
                              {action.evidence.failure_rate != null && (
                                <span className="badge bg-light text-dark border">Failure: {action.evidence.failure_rate}%</span>
                              )}
                              {action.evidence.total_executions != null && (
                                <span className="badge bg-light text-dark border">Runs: {action.evidence.total_executions}</span>
                              )}
                              {action.evidence.times_missing != null && (
                                <span className="badge bg-light text-dark border">Missing: {action.evidence.times_missing}x</span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Prompt Diff (for prompt_rewrite) */}
                        {action.action_type === 'prompt_rewrite' && action.before_value && (
                          <div className="mt-2">
                            <div className="row g-2">
                              <div className="col-md-6">
                                <div className="text-muted small fw-medium">Before</div>
                                <pre className="bg-white p-2 small border rounded mt-1 mb-0" style={{ maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                                  {action.before_value}
                                </pre>
                              </div>
                              <div className="col-md-6">
                                <div className="text-muted small fw-medium">After</div>
                                <pre className="bg-white p-2 small border rounded mt-1 mb-0" style={{ maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                                  {action.after_value || '(will be generated during preview)'}
                                </pre>
                              </div>
                            </div>
                            {action.changes_explanation && (
                              <div className="text-muted small mt-1">
                                <strong>Changes:</strong> {action.changes_explanation}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Variable Fix Detail */}
                        {action.action_type === 'variable_fix' && action.after_value && (
                          <div className="mt-2">
                            <div className="text-muted small fw-medium">Proposed Definition</div>
                            <div className="d-flex flex-wrap gap-1 mt-1">
                              <span className="badge bg-light text-dark border">key: {action.after_value.key}</span>
                              <span className="badge bg-light text-dark border">type: {action.after_value.data_type}</span>
                              <span className="badge bg-light text-dark border">scope: {action.after_value.scope}</span>
                              <span className="badge bg-light text-dark border">source: {action.after_value.source_type}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* Action Bar */}
            {plan.actions.length > 0 && (plan.status === 'draft' || plan.status === 'preview') && (
              <div className="d-flex gap-2 p-3 border-top flex-wrap align-items-center">
                {canPreview && (
                  <button className="btn btn-sm btn-primary" onClick={handlePreview} disabled={previewing}>
                    {previewing ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-1" role="status">
                          <span className="visually-hidden">Previewing...</span>
                        </span>
                        Generating Previews...
                      </>
                    ) : 'Preview Plan'}
                  </button>
                )}

                {plan.status === 'preview' && (
                  <>
                    <button className="btn btn-sm btn-outline-secondary" onClick={selectAllSafe}>
                      Select All Safe
                    </button>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={handleApply}
                      disabled={!canApply || applying}
                    >
                      {applying ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-1" role="status">
                            <span className="visually-hidden">Applying...</span>
                          </span>
                          Applying...
                        </>
                      ) : (
                        <>Apply Selected <span className="badge bg-white text-primary ms-1">{selectedActions.size}</span></>
                      )}
                    </button>
                  </>
                )}

                <div className="ms-auto">
                  {!showRejectForm ? (
                    <button className="btn btn-sm btn-outline-danger" onClick={() => setShowRejectForm(true)}>
                      Reject Plan
                    </button>
                  ) : (
                    <div className="d-flex gap-2 align-items-center">
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        placeholder="Rejection reason..."
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        style={{ width: 200 }}
                      />
                      <button className="btn btn-sm btn-danger" onClick={handleReject}>Reject</button>
                      <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowRejectForm(false)}>Cancel</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* No plan state */}
      {!plan && !generating && !loading && (
        <div className="card border-0 shadow-sm mb-3">
          <div className="card-body text-center py-5 text-muted">
            <div className="mb-2">No active healing plan.</div>
            <div className="small">Click "Generate Healing Plan" to analyze your curriculum and generate improvement suggestions.</div>
          </div>
        </div>
      )}

      {/* Panel 3: History */}
      <div className="card border-0 shadow-sm">
        <div
          className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center"
          style={{ cursor: 'pointer' }}
          onClick={() => setShowHistory(!showHistory)}
        >
          <span>Plan History {history.length > 0 && <span className="badge bg-secondary ms-1">{history.length}</span>}</span>
          <span className="text-muted small">{showHistory ? '▲' : '▼'}</span>
        </div>
        {showHistory && (
          <div className="card-body p-0">
            {history.length === 0 ? (
              <div className="text-muted text-center py-3 small">No previous plans</div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th className="small fw-medium">Date</th>
                      <th className="small fw-medium">Status</th>
                      <th className="small fw-medium text-end">Actions</th>
                      <th className="small fw-medium text-end">Applied</th>
                      <th className="small fw-medium text-end">Risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(h => (
                      <tr
                        key={h.id}
                        style={{ cursor: 'pointer' }}
                        onClick={async () => {
                          try {
                            const res = await api.get(`/api/admin/orchestration/self-healing/plan/${h.id}`);
                            setPlan(res.data);
                            setSelectedActions(new Set());
                          } catch { /* ignore */ }
                        }}
                      >
                        <td className="small">{new Date(h.created_at).toLocaleDateString()}</td>
                        <td><span className={`badge bg-${statusBadge(h.status)}`}>{h.status}</span></td>
                        <td className="small text-end">{h.actions.length}</td>
                        <td className="small text-end">{h.applied_action_ids?.length || 0}</td>
                        <td className="text-end"><span className={`badge bg-${riskBadge(h.overall_risk_level)}`}>{h.overall_risk_level}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SelfHealingTab;
