import React, { useState, useEffect, useCallback } from 'react';
import { getInsights, actionInsight, feedbackInsight, type ReportingInsight } from '../../../../services/reportingApi';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'danger', warning: 'warning', opportunity: 'success', insight: 'info', info: 'secondary',
};

const TYPE_COLORS: Record<string, string> = {
  anomaly: 'danger', pattern: 'info', trend: 'primary', opportunity: 'success', risk: 'warning',
};

export default function InsightsTab() {
  const [insights, setInsights] = useState<ReportingInsight[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);

  const fetchInsights = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getInsights({ ...filters, page, limit: 20 });
      setInsights(result.rows);
      setCount(result.count);
    } catch { /* silent */ }
    setLoading(false);
  }, [filters, page]);

  useEffect(() => { fetchInsights(); }, [fetchInsights]);

  const handleAction = async (id: string, status: string) => {
    await actionInsight(id, status);
    fetchInsights();
  };

  const handleFeedback = async (id: string, type: 'useful' | 'not_useful' | 'favorite') => {
    await feedbackInsight(id, type);
    fetchInsights();
  };

  return (
    <div className="p-3">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 className="fw-semibold mb-0">Insights ({count})</h5>
        <div className="d-flex gap-2 flex-wrap">
          <select className="form-select form-select-sm" style={{ width: 130 }}
            value={filters.insight_type || ''} onChange={e => setFilters(f => ({ ...f, insight_type: e.target.value }))}>
            <option value="">All Types</option>
            {['anomaly', 'pattern', 'trend', 'opportunity', 'risk'].map(t =>
              <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="form-select form-select-sm" style={{ width: 130 }}
            value={filters.status || ''} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
            <option value="">All Status</option>
            {['new', 'acknowledged', 'actioned', 'dismissed'].map(s =>
              <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="form-select form-select-sm" style={{ width: 130 }}
            value={filters.alert_severity || ''} onChange={e => setFilters(f => ({ ...f, alert_severity: e.target.value }))}>
            <option value="">All Severity</option>
            {['info', 'insight', 'opportunity', 'warning', 'critical'].map(s =>
              <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-5"><div className="spinner-border spinner-border-sm" role="status"><span className="visually-hidden">Loading...</span></div></div>
      ) : insights.length === 0 ? (
        <div className="text-center text-muted py-5">No insights found</div>
      ) : (
        <div className="row g-3">
          {insights.map(insight => (
            <div key={insight.id} className="col-12">
              <div className="card border-0 shadow-sm">
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-start">
                    <div className="flex-grow-1">
                      <div className="d-flex align-items-center gap-2 mb-1">
                        <span className={`badge bg-${SEVERITY_COLORS[insight.alert_severity] || 'secondary'}`}>
                          {insight.alert_severity}
                        </span>
                        <span className={`badge bg-${TYPE_COLORS[insight.insight_type] || 'secondary'}`}>
                          {insight.insight_type}
                        </span>
                        {insight.department && <span className="badge bg-light text-dark">{insight.department}</span>}
                        <small className="text-muted">Score: {(insight.final_score * 100).toFixed(0)}%</small>
                      </div>
                      <h6 className="fw-semibold mb-1">{insight.title}</h6>
                      {insight.narrative && <p className="small text-muted mb-2">{insight.narrative.substring(0, 200)}{insight.narrative.length > 200 ? '...' : ''}</p>}
                      <div className="d-flex gap-3 small text-muted">
                        <span>Confidence: {(insight.confidence * 100).toFixed(0)}%</span>
                        <span>Impact: {(insight.impact * 100).toFixed(0)}%</span>
                        <span>Urgency: {(insight.urgency * 100).toFixed(0)}%</span>
                        <span>Source: {insight.source_agent}</span>
                      </div>
                    </div>
                    <div className="d-flex flex-column gap-1 ms-3">
                      <div className="btn-group btn-group-sm">
                        <button className="btn btn-outline-success btn-sm" title="Useful"
                          onClick={() => handleFeedback(insight.id, 'useful')}>&#128077;</button>
                        <button className="btn btn-outline-danger btn-sm" title="Not useful"
                          onClick={() => handleFeedback(insight.id, 'not_useful')}>&#128078;</button>
                        <button className="btn btn-outline-warning btn-sm" title="Favorite"
                          onClick={() => handleFeedback(insight.id, 'favorite')}>&#11088;</button>
                      </div>
                      {insight.status === 'new' && (
                        <div className="btn-group btn-group-sm">
                          <button className="btn btn-outline-primary btn-sm" onClick={() => handleAction(insight.id, 'acknowledged')}>Ack</button>
                          <button className="btn btn-outline-secondary btn-sm" onClick={() => handleAction(insight.id, 'dismissed')}>Dismiss</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {count > 20 && (
        <div className="d-flex justify-content-center mt-3 gap-2">
          <button className="btn btn-sm btn-outline-secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
          <span className="small align-self-center">Page {page} of {Math.ceil(count / 20)}</span>
          <button className="btn btn-sm btn-outline-secondary" disabled={page >= Math.ceil(count / 20)} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
