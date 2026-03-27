import type { OpenclawDashboard, OpenclawAgentActivity } from '../../../../../services/openclawApi';
import { RESULT_BADGES, timeAgo, formatMs } from './openclawUtils';

type SelectedAgent = OpenclawDashboard['agents'][number];

interface AgentDetailModalProps {
  agent: SelectedAgent | null;
  onClose: () => void;
  activity: OpenclawAgentActivity[];
  activityLoading: boolean;
  activityTotal: number;
  activityFilter: string;
  onActivityFilterChange: (val: string) => void;
}

export default function AgentDetailModal({
  agent,
  onClose,
  activity,
  activityLoading,
  activityTotal,
  activityFilter,
  onActivityFilterChange,
}: AgentDetailModalProps) {
  if (!agent) return null;

  return (
    <>
      <div className="modal-backdrop show" style={{ opacity: 0.5 }} onClick={onClose} />
      <div className="modal show d-block" role="dialog" aria-modal="true" onClick={onClose}>
        <div
          className="modal-dialog modal-lg modal-dialog-scrollable"
          style={{ maxWidth: 800 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-content">
            <div className="modal-header py-2">
              <h6 className="modal-title fw-semibold mb-0">
                {agent.name.replace(/^Openclaw/, '')} Agent
              </h6>
              <button type="button" className="btn-close btn-close-sm" onClick={onClose} aria-label="Close" />
            </div>
            <div className="modal-body p-3">
              {/* Agent Overview */}
              <div className="row g-2 mb-3">
                <div className="col-6 col-md-3">
                  <div className="card border-0 bg-light text-center py-2 px-1">
                    <div className="fw-bold" style={{ color: 'var(--color-primary)' }}>{agent.run_count}</div>
                    <div className="text-muted" style={{ fontSize: '0.65rem' }}>Total Runs</div>
                  </div>
                </div>
                <div className="col-6 col-md-3">
                  <div className="card border-0 bg-light text-center py-2 px-1">
                    <div className="fw-bold" style={{ color: agent.error_count > 0 ? '#e53e3e' : 'var(--color-accent)' }}>
                      {agent.error_count}
                    </div>
                    <div className="text-muted" style={{ fontSize: '0.65rem' }}>Errors</div>
                  </div>
                </div>
                <div className="col-6 col-md-3">
                  <div className="card border-0 bg-light text-center py-2 px-1">
                    <div className="fw-bold" style={{ color: '#2b6cb0' }}>{formatMs(agent.avg_duration_ms)}</div>
                    <div className="text-muted" style={{ fontSize: '0.65rem' }}>Avg Duration</div>
                  </div>
                </div>
                <div className="col-6 col-md-3">
                  <div className="card border-0 bg-light text-center py-2 px-1">
                    <span className={`badge bg-${agent.status === 'idle' ? 'success' : agent.status === 'running' ? 'primary' : agent.status === 'error' ? 'danger' : 'secondary'}`}>
                      {agent.status}
                    </span>
                    <div className="text-muted mt-1" style={{ fontSize: '0.65rem' }}>Status</div>
                  </div>
                </div>
              </div>

              {/* Description */}
              {agent.description && (
                <p className="text-muted small mb-3">{agent.description}</p>
              )}

              {/* Last Result Summary */}
              {agent.last_result && (
                <div className="card border-0 bg-light mb-3">
                  <div className="card-body py-2 px-3">
                    <div className="fw-semibold small mb-1">Last Execution Result</div>
                    <div style={{ fontSize: '0.75rem' }}>
                      {agent.last_result.entities_processed != null && (
                        <span className="me-3">Entities: <strong>{agent.last_result.entities_processed}</strong></span>
                      )}
                      {agent.last_result.duration_ms != null && (
                        <span className="me-3">Duration: <strong>{formatMs(agent.last_result.duration_ms)}</strong></span>
                      )}
                      {agent.last_result.errors && agent.last_result.errors.length > 0 && (
                        <span className="text-danger">Errors: {agent.last_result.errors.join(', ')}</span>
                      )}
                      {agent.last_result.actions_taken && agent.last_result.actions_taken.length > 0 && (
                        <div className="mt-1">
                          <strong>Actions:</strong>
                          <ul className="mb-0 ps-3" style={{ fontSize: '0.7rem' }}>
                            {agent.last_result.actions_taken.slice(0, 8).map((a: any, i: number) => (
                              <li key={i} className="text-muted">
                                <span className={`badge bg-${RESULT_BADGES[a.result] || 'secondary'} me-1`} style={{ fontSize: '0.6rem' }}>
                                  {a.result}
                                </span>
                                {a.action}: {a.reason}
                              </li>
                            ))}
                            {agent.last_result.actions_taken.length > 8 && (
                              <li className="text-muted">...and {agent.last_result.actions_taken.length - 8} more</li>
                            )}
                          </ul>
                        </div>
                      )}
                      {(!agent.last_result.actions_taken || agent.last_result.actions_taken.length === 0) &&
                       (!agent.last_result.errors || agent.last_result.errors.length === 0) && (
                        <span className="text-muted">No actions taken in last run</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Config */}
              {agent.config && Object.keys(agent.config).length > 0 && (
                <details className="mb-3">
                  <summary className="fw-semibold small" style={{ cursor: 'pointer' }}>Configuration</summary>
                  <pre className="bg-light rounded p-2 mt-1 mb-0" style={{ fontSize: '0.7rem', maxHeight: 150, overflow: 'auto' }}>
                    {JSON.stringify(agent.config, null, 2)}
                  </pre>
                </details>
              )}

              {/* Activity Log */}
              <div className="d-flex justify-content-between align-items-center mb-2">
                <span className="fw-semibold small">Activity Log ({activityTotal})</span>
                <select
                  className="form-select form-select-sm"
                  style={{ width: 'auto', fontSize: '0.7rem' }}
                  value={activityFilter}
                  onChange={(e) => onActivityFilterChange(e.target.value)}
                >
                  <option value="">All Results</option>
                  <option value="success">Success</option>
                  <option value="failed">Failed</option>
                  <option value="skipped">Skipped</option>
                  <option value="flagged">Flagged</option>
                </select>
              </div>

              {activityLoading ? (
                <div className="text-center py-3">
                  <div className="spinner-border spinner-border-sm text-primary" role="status">
                    <span className="visually-hidden">Loading activity...</span>
                  </div>
                </div>
              ) : activity.length > 0 ? (
                <div className="table-responsive" style={{ maxHeight: 350, overflow: 'auto' }}>
                  <table className="table table-hover mb-0" style={{ fontSize: '0.72rem' }}>
                    <thead className="table-light sticky-top">
                      <tr>
                        <th>Action</th>
                        <th>Result</th>
                        <th>Reason</th>
                        <th>Confidence</th>
                        <th>Duration</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activity.map((act) => (
                        <tr key={act.id}>
                          <td className="fw-medium">{act.action}</td>
                          <td>
                            <span className={`badge bg-${RESULT_BADGES[act.result] || 'secondary'}`} style={{ fontSize: '0.6rem' }}>
                              {act.result}
                            </span>
                          </td>
                          <td>
                            <span
                              className="text-muted text-truncate d-inline-block"
                              style={{ maxWidth: 250 }}
                              title={act.reason || ''}
                            >
                              {act.reason || '\u2014'}
                            </span>
                          </td>
                          <td>{act.confidence != null ? `${(act.confidence * 100).toFixed(0)}%` : '\u2014'}</td>
                          <td>{formatMs(act.duration_ms)}</td>
                          <td className="text-muted text-nowrap">{timeAgo(act.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-muted text-center py-3 small">
                  No activity recorded yet — the agent will log actions on its next scheduled run
                </div>
              )}
            </div>
            <div className="modal-footer py-2">
              <span className="text-muted me-auto" style={{ fontSize: '0.65rem' }}>
                Last run: {timeAgo(agent.last_run_at)}
              </span>
              <button className="btn btn-sm btn-outline-secondary" onClick={onClose}>Close</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
