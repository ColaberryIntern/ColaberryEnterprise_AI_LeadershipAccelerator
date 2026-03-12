import React, { useState, useEffect, useCallback } from 'react';
import { getExecutions, type ExecutionEntry } from '../../../../services/reportingApi';

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
                    <span className="badge bg-info">{exec.simulation_type}</span>
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
                        style={{ color: 'var(--color-primary-light)', cursor: 'pointer' }}
                        title={exec.ticket_id}
                      >
                        TK-{exec.ticket_id.substring(0, 8)}
                      </span>
                    ) : (
                      <span>&mdash;</span>
                    )}
                    <span>{new Date(exec.created_at).toLocaleDateString()}</span>
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
    </div>
  );
}
