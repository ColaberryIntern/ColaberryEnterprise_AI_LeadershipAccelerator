import React, { useState, useEffect, useCallback } from 'react';
import api from '../../../utils/api';
import { useToast } from '../../../components/ui/ToastProvider';
import ClassificationBadge from '../../../components/admin/inbox/ClassificationBadge';
import EmailPreviewCard from '../../../components/admin/inbox/EmailPreviewCard';
import InboxBatchActionBar from '../../../components/admin/inbox/InboxBatchActionBar';
import Pagination from '../../../components/ui/Pagination';

interface Decision {
  id: string;
  email: {
    from_name: string;
    from_address: string;
    subject: string;
    body_text: string;
    received_at: string;
    provider: string;
    has_attachments: boolean;
  };
  classification: {
    state: 'INBOX' | 'AUTOMATION' | 'SILENT_HOLD' | 'ASK_USER';
    confidence: number;
    reasoning: string;
    classified_by: string;
  };
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export default function InboxDecisionsPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<'silent_hold' | 'all'>('silent_hold');
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Filters
  const [providerFilter, setProviderFilter] = useState('');
  const [confidenceMin, setConfidenceMin] = useState('');
  const [confidenceMax, setConfidenceMax] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchDecisions = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params: Record<string, string> = {
        page: String(page),
        limit: '50',
      };
      if (tab === 'silent_hold') params.state = 'SILENT_HOLD';
      if (providerFilter) params.provider = providerFilter;
      if (confidenceMin) params.confidence_min = confidenceMin;
      if (confidenceMax) params.confidence_max = confidenceMax;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;

      const res = await api.get('/api/admin/inbox/decisions', { params });
      setDecisions(res.data.results || res.data.decisions || []);
      setTotalPages(Math.ceil((res.data.total || 0) / 50) || 1);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load decisions');
    } finally {
      setLoading(false);
    }
  }, [tab, page, providerFilter, confidenceMin, confidenceMax, dateFrom, dateTo]);

  useEffect(() => {
    fetchDecisions();
  }, [fetchDecisions]);

  // Polling every 30s
  useEffect(() => {
    const interval = setInterval(fetchDecisions, 30000);
    return () => clearInterval(interval);
  }, [fetchDecisions]);

  const handleReclassify = async (emailId: string, newState: string) => {
    try {
      await api.patch(`/api/admin/inbox/decisions/${emailId}/reclassify`, { new_state: newState });
      showToast(`Email moved to ${newState}`, 'success');
      fetchDecisions();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Reclassify failed', 'error');
    }
  };

  const handleBatchAction = async (action: string) => {
    if (selectedIds.length === 0) return;
    const newState = action === 'DISMISS' ? 'AUTOMATION' : action;
    try {
      await api.post('/api/admin/inbox/decisions/batch', { email_ids: selectedIds, new_state: newState });
      showToast(`${selectedIds.length} emails updated`, 'success');
      setSelectedIds([]);
      fetchDecisions();
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Batch action failed', 'error');
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === decisions.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(decisions.map((d) => d.classification.email_id));
    }
  };

  const confidenceBadge = (confidence: number) => {
    const pct = Math.round(confidence);
    const color = pct >= 80 ? 'success' : pct >= 50 ? 'warning' : 'danger';
    return <span className={`badge bg-${color}`}>{pct}%</span>;
  };

  const providerBadge = (email: any) => {
    if (!email) return <span className="badge bg-secondary">unknown</span>;
    const isForwarded = email.provider === 'gmail_colaberry' &&
      (email.from_address?.includes('hotmail.com') || email.from_address?.includes('outlook.com') ||
       email.subject?.includes('Fwd:') || email.headers?.['x-forwarded-to']);
    if (isForwarded) return <span className="badge" style={{ backgroundColor: '#0078d4', color: 'white' }}>hotmail (fwd)</span>;
    const colors: Record<string, { bg: string; label: string }> = {
      gmail_colaberry: { bg: '#ea4335', label: 'Colaberry' },
      gmail_personal: { bg: '#34a853', label: 'Personal' },
      hotmail: { bg: '#0078d4', label: 'Hotmail' },
    };
    const p = colors[email.provider] || { bg: '#6c757d', label: email.provider };
    return <span className="badge" style={{ backgroundColor: p.bg, color: 'white' }}>{p.label}</span>;
  };

  return (
    <div>
      <h4 className="mb-3">Email Decisions</h4>

      {/* Tabs */}
      <ul className="nav nav-tabs mb-4">
        <li className="nav-item">
          <button
            className={`nav-link ${tab === 'silent_hold' ? 'active' : ''}`}
            onClick={() => { setTab('silent_hold'); setPage(1); }}
          >
            Silent Hold
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link ${tab === 'all' ? 'active' : ''}`}
            onClick={() => { setTab('all'); setPage(1); }}
          >
            All Decisions
          </button>
        </li>
      </ul>

      {/* Filter bar */}
      <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
        <select
          className="form-select form-select-sm"
          style={{ width: 'auto' }}
          value={providerFilter}
          onChange={(e) => { setProviderFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Providers</option>
          <option value="google">Google</option>
          <option value="microsoft">Microsoft</option>
        </select>
        <input
          type="number"
          className="form-control form-control-sm"
          style={{ width: 100 }}
          placeholder="Min %"
          value={confidenceMin}
          onChange={(e) => { setConfidenceMin(e.target.value); setPage(1); }}
          min={0}
          max={100}
        />
        <input
          type="number"
          className="form-control form-control-sm"
          style={{ width: 100 }}
          placeholder="Max %"
          value={confidenceMax}
          onChange={(e) => { setConfidenceMax(e.target.value); setPage(1); }}
          min={0}
          max={100}
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

      {/* Batch action bar */}
      <InboxBatchActionBar selectedCount={selectedIds.length} onAction={handleBatchAction} />

      {/* Error */}
      {error && <div className="alert alert-danger">{error}</div>}

      {/* Loading */}
      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      ) : decisions.length === 0 ? (
        <div className="text-center py-5 text-muted">No decisions found.</div>
      ) : (
        <>
          <div className="card border-0 shadow-sm">
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="table-light">
                  <tr>
                    <th style={{ width: 40 }}>
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={selectedIds.length === decisions.length && decisions.length > 0}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <th>From</th>
                    <th>Subject</th>
                    <th>Received</th>
                    <th>Confidence</th>
                    <th>Reasoning</th>
                    <th>Provider</th>
                    <th style={{ width: 160 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {decisions.map((d) => (
                    <React.Fragment key={d.classification.email_id}>
                      <tr
                        style={{ cursor: 'pointer' }}
                        onClick={() => setExpandedId(expandedId === d.classification.email_id ? null : d.classification.email_id)}
                        className={expandedId === d.classification.email_id ? 'table-active' : ''}
                      >
                        <td onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="form-check-input"
                            checked={selectedIds.includes(d.classification.email_id)}
                            onChange={() => toggleSelect(d.classification.email_id)}
                          />
                        </td>
                        <td className="small">{d.email.from_name}</td>
                        <td className="small text-truncate" style={{ maxWidth: 200 }}>{d.email.subject}</td>
                        <td className="small text-muted">{formatRelativeTime(d.email.received_at)}</td>
                        <td>{confidenceBadge(d.classification.confidence)}</td>
                        <td className="small text-muted text-truncate" style={{ maxWidth: 200 }}>{d.classification.reasoning}</td>
                        <td>{providerBadge(d.email)}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="d-flex gap-1">
                            <button
                              className="btn btn-sm btn-success"
                              onClick={() => handleReclassify(d.classification.email_id, 'INBOX')}
                              title="Promote to Inbox"
                            >
                              Promote
                            </button>
                            <button
                              className="btn btn-sm btn-outline-secondary"
                              onClick={() => handleReclassify(d.classification.email_id, 'AUTOMATION')}
                              title="Dismiss to Automation"
                            >
                              Dismiss
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedId === d.classification.email_id && (
                        <tr>
                          <td colSpan={8} className="p-3 bg-light">
                            <EmailPreviewCard email={d.email} classification={d.classification} />
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
