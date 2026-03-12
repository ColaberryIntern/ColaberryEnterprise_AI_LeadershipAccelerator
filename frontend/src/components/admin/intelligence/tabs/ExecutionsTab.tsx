import React, { useState, useEffect, useCallback } from 'react';
import { getExecutions, type ExecutionEntry } from '../../../../services/reportingApi';
import FeedbackButtons from '../FeedbackButtons';

const STATUS_COLORS: Record<string, string> = {
  pending: 'info',
  tracking: 'primary',
  completed: 'success',
  expired: 'secondary',
};

const PAGE_SIZE = 20;

export default function ExecutionsTab() {
  const [executions, setExecutions] = useState<ExecutionEntry[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedExecution, setSelectedExecution] = useState<ExecutionEntry | null>(null);

  const fetchExecutions = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { page, limit: PAGE_SIZE };
      if (statusFilter) params.status = statusFilter;
      const result = await getExecutions(params);
      setExecutions(result.rows);
      setCount(result.count);
    } catch { /* silent */ }
    setLoading(false);
  }, [statusFilter, page]);

  useEffect(() => { fetchExecutions(); }, [fetchExecutions]);

  const totalPages = Math.ceil(count / PAGE_SIZE);

  return (
    <div className="p-3">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 className="fw-semibold mb-0">Strategy Executions ({count})</h5>
        <select
          className="form-select form-select-sm"
          style={{ width: 150 }}
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="tracking">Tracking</option>
          <option value="completed">Completed</option>
          <option value="expired">Expired</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border spinner-border-sm" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      ) : executions.length === 0 ? (
        <div className="text-center text-muted py-5">
          <div className="mb-2" style={{ fontSize: 32 }}>&#9881;</div>
          <p className="mb-0">No executions yet. Use Simulate &rarr; Execute on any chart to create one.</p>
        </div>
      ) : (
        <div className="row g-3">
          {executions.map(exec => (
            <div key={exec.id} className="col-12 col-md-6">
              <div className="card border-0 shadow-sm h-100">
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <span
                      className="badge bg-info"
                      role="button"
                      style={{ cursor: 'pointer', color: 'var(--color-primary-light)' }}
                      onClick={() => setSelectedExecution(exec)}
                    >{exec.simulation_type}</span>
                    <span className={`badge bg-${STATUS_COLORS[exec.status] || 'secondary'}`}>
                      {exec.status}
                    </span>
                  </div>

                  {/* Predicted outcomes */}
                  {exec.predicted_outcome && (
                    <div className="row g-2 mb-2">
                      {[
                        { label: 'Leads', key: 'leads' },
                        { label: 'Conversions', key: 'conversions' },
                        { label: 'Enrollments', key: 'enrollments' },
                        { label: 'Revenue', key: 'revenue', isCurrency: true },
                      ].map(m => {
                        const val = exec.predicted_outcome?.[m.key];
                        if (val == null) return null;
                        return (
                          <div key={m.key} className="col-6">
                            <div className="small text-muted">{m.label}</div>
                            <div className="fw-semibold small" style={{ color: 'var(--color-primary)' }}>
                              {m.isCurrency ? `$${Number(val).toLocaleString()}` : val}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Confidence & Risk */}
                  <div className="d-flex gap-2 mb-2">
                    <span className={`badge bg-${exec.confidence >= 0.7 ? 'success' : exec.confidence >= 0.4 ? 'warning' : 'danger'}`}>
                      Confidence: {(exec.confidence * 100).toFixed(0)}%
                    </span>
                    <span className={`badge bg-${exec.risk_score >= 0.7 ? 'danger' : exec.risk_score >= 0.4 ? 'warning' : 'success'}`}>
                      Risk: {(exec.risk_score * 100).toFixed(0)}%
                    </span>
                  </div>

                  {/* Accuracy score for completed */}
                  {exec.status === 'completed' && exec.accuracy_score != null && (
                    <div className="mb-2">
                      <span className="small fw-medium">Accuracy: </span>
                      <span className={`badge bg-${exec.accuracy_score >= 0.7 ? 'success' : exec.accuracy_score >= 0.4 ? 'warning' : 'danger'}`}>
                        {(exec.accuracy_score * 100).toFixed(0)}%
                      </span>
                    </div>
                  )}

                  {/* Footer: ticket + date */}
                  <div className="d-flex justify-content-between align-items-center small text-muted mt-2 pt-2" style={{ borderTop: '1px solid var(--color-border, #e2e8f0)' }}>
                    {exec.ticket_id ? (
                      <span
                        className="fw-medium"
                        role="button"
                        style={{ color: 'var(--color-primary-light)', cursor: 'pointer' }}
                        title={exec.ticket_id}
                        onClick={() => setSelectedExecution(exec)}
                      >
                        TK-{exec.ticket_id.substring(0, 8)}
                      </span>
                    ) : (
                      <span>&mdash;</span>
                    )}
                    <div className="d-flex align-items-center gap-2">
                      <FeedbackButtons contentType="execution" contentKey={`exec_${exec.id.substring(0, 16)}`} />
                      <span>{new Date(exec.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {count > PAGE_SIZE && (
        <div className="d-flex justify-content-center mt-3 gap-2">
          <button className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            Prev
          </button>
          <span className="small align-self-center">Page {page} of {totalPages}</span>
          <button className="btn btn-sm btn-outline-secondary" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            Next
          </button>
        </div>
      )}

      {/* Detail Modal */}
      {selectedExecution && (
        <ExecutionDetailModal
          exec={selectedExecution}
          onClose={() => setSelectedExecution(null)}
        />
      )}
    </div>
  );
}

/* ─── Detail Modal ──────────────────────────────────────────────────────── */

const OUTCOME_FIELDS: readonly { label: string; key: string; isCurrency?: boolean }[] = [
  { label: 'Leads', key: 'leads' },
  { label: 'Conversions', key: 'conversions' },
  { label: 'Enrollments', key: 'enrollments' },
  { label: 'Revenue', key: 'revenue', isCurrency: true },
];

function ExecutionDetailModal({ exec, onClose }: { exec: ExecutionEntry; onClose: () => void }) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const ctx = exec.context || {};
  const accuracyPct = exec.accuracy_score != null ? Math.round(exec.accuracy_score * 100) : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="modal-backdrop show"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="modal show d-block"
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        onClick={onClose}
      >
        <div
          className="modal-dialog modal-dialog-centered"
          style={{ maxWidth: 520 }}
          onClick={e => e.stopPropagation()}
        >
          <div className="modal-content border-0 shadow">
            {/* Header */}
            <div className="modal-header py-2 px-3" style={{ borderBottom: '1px solid var(--color-border, #e2e8f0)' }}>
              <div className="d-flex align-items-center gap-2">
                <span className="fw-semibold" style={{ fontSize: '0.82rem' }}>
                  {exec.simulation_type}
                </span>
                <span
                  className={`badge bg-${STATUS_COLORS[exec.status] || 'secondary'}`}
                  style={{ fontSize: '0.65rem' }}
                >
                  {exec.status}
                </span>
              </div>
              <button
                type="button"
                className="btn-close"
                style={{ fontSize: '0.65rem' }}
                aria-label="Close"
                onClick={onClose}
              />
            </div>

            {/* Body */}
            <div className="modal-body px-3 py-2" style={{ fontSize: '0.75rem' }}>

              {/* Context Info */}
              {(ctx.entity_type || ctx.entity_id || ctx.strategy_type) && (
                <div className="mb-3">
                  <div className="fw-semibold mb-1" style={{ fontSize: '0.82rem', color: 'var(--color-primary)' }}>
                    Context
                  </div>
                  <div className="row g-2">
                    {ctx.entity_type && (
                      <div className="col-6">
                        <span className="text-muted">Entity Type</span>
                        <div className="fw-medium">{ctx.entity_type}</div>
                      </div>
                    )}
                    {ctx.entity_id && (
                      <div className="col-6">
                        <span className="text-muted">Entity ID</span>
                        <div className="fw-medium" style={{ wordBreak: 'break-all' }}>{ctx.entity_id}</div>
                      </div>
                    )}
                    {ctx.strategy_type && (
                      <div className="col-6">
                        <span className="text-muted">Strategy</span>
                        <div className="fw-medium">{ctx.strategy_type}</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Predicted Outcomes */}
              {exec.predicted_outcome && (
                <div className="mb-3">
                  <div className="fw-semibold mb-1" style={{ fontSize: '0.82rem', color: 'var(--color-primary)' }}>
                    Predicted Outcomes
                  </div>
                  <div className="row g-2">
                    {OUTCOME_FIELDS.map(m => {
                      const val = exec.predicted_outcome?.[m.key];
                      if (val == null) return null;
                      return (
                        <div key={m.key} className="col-6 col-sm-3">
                          <div className="text-muted">{m.label}</div>
                          <div className="fw-semibold" style={{ color: 'var(--color-primary)' }}>
                            {m.isCurrency ? `$${Number(val).toLocaleString()}` : val}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Actual Outcomes */}
              {exec.status === 'completed' && exec.actual_outcome && (
                <div className="mb-3">
                  <div className="fw-semibold mb-1" style={{ fontSize: '0.82rem', color: 'var(--color-accent, #38a169)' }}>
                    Actual Outcomes
                  </div>
                  <div className="row g-2">
                    {OUTCOME_FIELDS.map(m => {
                      const val = exec.actual_outcome?.[m.key];
                      if (val == null) return null;
                      return (
                        <div key={m.key} className="col-6 col-sm-3">
                          <div className="text-muted">{m.label}</div>
                          <div className="fw-semibold" style={{ color: 'var(--color-accent, #38a169)' }}>
                            {m.isCurrency ? `$${Number(val).toLocaleString()}` : val}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Accuracy Score with bar */}
              {accuracyPct != null && (
                <div className="mb-3">
                  <div className="fw-semibold mb-1" style={{ fontSize: '0.82rem', color: 'var(--color-primary)' }}>
                    Accuracy Score
                  </div>
                  <div className="d-flex align-items-center gap-2">
                    <div className="progress flex-grow-1" style={{ height: 8 }}>
                      <div
                        className={`progress-bar bg-${accuracyPct >= 70 ? 'success' : accuracyPct >= 40 ? 'warning' : 'danger'}`}
                        role="progressbar"
                        style={{ width: `${accuracyPct}%` }}
                        aria-valuenow={accuracyPct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      />
                    </div>
                    <span className="fw-semibold" style={{ minWidth: 36, textAlign: 'right' }}>{accuracyPct}%</span>
                  </div>
                </div>
              )}

              {/* Confidence & Risk */}
              <div className="d-flex gap-2 mb-3">
                <span
                  className={`badge bg-${exec.confidence >= 0.7 ? 'success' : exec.confidence >= 0.4 ? 'warning' : 'danger'}`}
                  style={{ fontSize: '0.65rem' }}
                >
                  Confidence: {(exec.confidence * 100).toFixed(0)}%
                </span>
                <span
                  className={`badge bg-${exec.risk_score >= 0.7 ? 'danger' : exec.risk_score >= 0.4 ? 'warning' : 'success'}`}
                  style={{ fontSize: '0.65rem' }}
                >
                  Risk: {(exec.risk_score * 100).toFixed(0)}%
                </span>
              </div>

              {/* Ticket ID */}
              <div className="d-flex justify-content-between align-items-center text-muted" style={{ borderTop: '1px solid var(--color-border, #e2e8f0)', paddingTop: 8 }}>
                <div>
                  <span className="fw-medium">Ticket: </span>
                  {exec.ticket_id ? (
                    <span style={{ color: 'var(--color-primary-light)' }}>{exec.ticket_id}</span>
                  ) : (
                    <span>&mdash;</span>
                  )}
                </div>
                <div>
                  <span className="fw-medium">Created: </span>
                  {new Date(exec.created_at).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="modal-footer py-2 px-3" style={{ borderTop: '1px solid var(--color-border, #e2e8f0)' }}>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={onClose}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
