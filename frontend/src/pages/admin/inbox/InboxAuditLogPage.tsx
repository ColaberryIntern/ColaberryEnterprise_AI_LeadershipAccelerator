import React, { useState, useEffect, useCallback } from 'react';
import api from '../../../utils/api';
import Pagination from '../../../components/ui/Pagination';

interface AuditEntry {
  id: string;
  created_at: string;
  action: string;
  email_id?: string;
  email_subject?: string;
  old_state: string;
  new_state: string;
  confidence: number | null;
  actor: string;
  reasoning: string;
  metadata?: Record<string, any>;
}

const ACTION_COLORS: Record<string, string> = {
  classified: 'info',
  reclassified: 'warning',
  draft_created: 'secondary',
  draft_approved: 'success',
  draft_rejected: 'danger',
  draft_edited: 'warning',
  rule_matched: 'info',
  vip_detected: 'primary',
};

const ACTION_OPTIONS = [
  'classified',
  'reclassified',
  'draft_created',
  'draft_approved',
  'draft_rejected',
  'draft_edited',
  'rule_matched',
  'vip_detected',
];

export default function InboxAuditLogPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [actionFilter, setActionFilter] = useState<string[]>([]);
  const [actorFilter, setActorFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchAudit = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params: Record<string, string> = {
        page: String(page),
        limit: '50',
      };
      if (actionFilter.length > 0) params.action = actionFilter.join(',');
      if (actorFilter) params.actor = actorFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      const res = await api.get('/api/admin/inbox/audit', { params });
      setEntries(res.data.results || res.data.entries || []);
      setTotalPages(Math.ceil((res.data.total || 0) / 50) || 1);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter, actorFilter, dateFrom, dateTo]);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  const toggleActionFilter = (action: string) => {
    setActionFilter((prev) =>
      prev.includes(action) ? prev.filter((a) => a !== action) : [...prev, action]
    );
    setPage(1);
  };

  return (
    <div>
      <h4 className="mb-3">Audit Log</h4>

      {/* Filter bar */}
      <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
        <div className="dropdown">
          <button
            className="btn btn-sm btn-outline-secondary dropdown-toggle"
            type="button"
            data-bs-toggle="dropdown"
            aria-expanded="false"
          >
            Actions {actionFilter.length > 0 && `(${actionFilter.length})`}
          </button>
          <ul className="dropdown-menu p-2" style={{ minWidth: 200 }}>
            {ACTION_OPTIONS.map((action) => (
              <li key={action}>
                <label className="dropdown-item d-flex align-items-center gap-2 small">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    checked={actionFilter.includes(action)}
                    onChange={() => toggleActionFilter(action)}
                  />
                  {action.replace('_', ' ')}
                </label>
              </li>
            ))}
          </ul>
        </div>
        <input
          type="text"
          className="form-control form-control-sm"
          style={{ width: 160 }}
          placeholder="Actor..."
          value={actorFilter}
          onChange={(e) => { setActorFilter(e.target.value); setPage(1); }}
        />
        <input
          type="date"
          className="form-control form-control-sm"
          style={{ width: 'auto' }}
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
        />
        <span className="text-muted small">to</span>
        <input
          type="date"
          className="form-control form-control-sm"
          style={{ width: 'auto' }}
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
        />
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-5 text-muted">No audit entries found.</div>
      ) : (
        <>
          <div className="card border-0 shadow-sm">
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="table-light">
                  <tr>
                    <th>Timestamp</th>
                    <th>Action</th>
                    <th>Email Subject</th>
                    <th>State Change</th>
                    <th>Confidence</th>
                    <th>Actor</th>
                    <th>Reasoning</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <React.Fragment key={entry.id}>
                      <tr
                        style={{ cursor: 'pointer' }}
                        onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                        className={expandedId === entry.id ? 'table-active' : ''}
                      >
                        <td className="small text-muted text-nowrap">
                          {entry.created_at ? new Date(entry.created_at).toLocaleString() : '--'}
                        </td>
                        <td>
                          <span className={`badge bg-${ACTION_COLORS[entry.action] || 'secondary'}`}>
                            {entry.action.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="small fw-medium text-truncate" style={{ maxWidth: 200 }}>
                          {entry.email_subject || (entry.email_id ? `(email ${entry.email_id.slice(0,8)}...)` : '--')}
                        </td>
                        <td className="small">
                          {entry.old_state && entry.new_state ? (
                            <>
                              <span className="text-muted">{entry.old_state}</span>
                              {' '}&rarr;{' '}
                              <span className="fw-medium">{entry.new_state}</span>
                            </>
                          ) : entry.new_state ? (
                            <span className="fw-medium">{entry.new_state}</span>
                          ) : (
                            <span className="text-muted">--</span>
                          )}
                        </td>
                        <td className="small">
                          {entry.confidence != null ? `${Math.round(entry.confidence)}%` : '--'}
                        </td>
                        <td className="small">{entry.actor}</td>
                        <td className="small text-muted text-truncate" style={{ maxWidth: 200 }}>
                          {entry.reasoning || '--'}
                        </td>
                      </tr>
                      {expandedId === entry.id && entry.metadata && (
                        <tr>
                          <td colSpan={7} className="p-3 bg-light">
                            <div className="small">
                              <strong>Full Metadata</strong>
                              <pre className="mb-0 mt-1" style={{ maxHeight: 300, overflowY: 'auto', fontSize: '0.8rem' }}>
                                {JSON.stringify(entry.metadata, null, 2)}
                              </pre>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mt-3">
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </>
      )}
    </div>
  );
}
