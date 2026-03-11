import React, { useState, useEffect, useCallback } from 'react';
import api from '../../../utils/api';

/* ── Types ───────────────────────────────────────────────────────── */

interface WebsiteIssue {
  id: string;
  agent_name: string;
  issue_type: string;
  page_url: string;
  severity: string;
  confidence: number;
  description: string;
  suggested_fix: string | null;
  element_selector: string | null;
  details: Record<string, any> | null;
  status: string;
  repaired_at: string | null;
  repaired_by: string | null;
  created_at: string;
}

interface Summary {
  total: number;
  open: number;
  auto_repaired: number;
  recent_24h: number;
  by_type: Record<string, number>;
  by_status: Record<string, number>;
  by_severity: Record<string, number>;
}

/* ── Constants ───────────────────────────────────────────────────── */

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'danger',
  high: 'warning',
  medium: 'info',
  low: 'secondary',
  info: 'light',
};

const STATUS_COLORS: Record<string, string> = {
  open: 'warning',
  auto_repaired: 'info',
  approved: 'success',
  rejected: 'secondary',
  resolved: 'success',
};

const TYPE_LABELS: Record<string, string> = {
  ui_visibility: 'UI/Accessibility',
  broken_link: 'Broken Links',
  conversion_flow: 'Conversion Flow',
  ux_heuristic: 'UX Heuristics',
  behavior: 'Behavior',
  recommendation: 'Recommendations',
};

/* ── Helpers ──────────────────────────────────────────────────────── */

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/* ── Component ───────────────────────────────────────────────────── */

function WebsiteIntelligenceTab() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [issues, setIssues] = useState<WebsiteIssue[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);

  // Filters
  const [filterType, setFilterType] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPage, setFilterPage] = useState('');

  // Detail expansion
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterType) params.set('type', filterType);
      if (filterSeverity) params.set('severity', filterSeverity);
      if (filterStatus) params.set('status', filterStatus);
      if (filterPage) params.set('page', filterPage);
      params.set('limit', '50');

      const [summaryRes, issuesRes] = await Promise.all([
        api.get('/api/admin/website-intelligence/summary'),
        api.get(`/api/admin/website-intelligence/issues?${params}`),
      ]);

      setSummary(summaryRes.data);
      setIssues(issuesRes.data.issues);
      setTotal(issuesRes.data.total);
    } catch (err) {
      console.error('Failed to fetch website intelligence data:', err);
    } finally {
      setLoading(false);
    }
  }, [filterType, filterSeverity, filterStatus, filterPage]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleScan = async () => {
    setScanning(true);
    try {
      await api.post('/api/admin/website-intelligence/scan');
      // Refresh after a delay to let agents start
      setTimeout(() => {
        fetchData();
        setScanning(false);
      }, 3000);
    } catch {
      setScanning(false);
    }
  };

  const handleStatusChange = async (issueId: string, newStatus: string) => {
    try {
      await api.patch(`/api/admin/website-intelligence/issues/${issueId}`, { status: newStatus });
      setIssues((prev) =>
        prev.map((i) => (i.id === issueId ? { ...i, status: newStatus } : i))
      );
      // Refresh summary
      const summaryRes = await api.get('/api/admin/website-intelligence/summary');
      setSummary(summaryRes.data);
    } catch (err) {
      console.error('Failed to update issue status:', err);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  // Unique pages for filter dropdown
  const uniquePages = [...new Set(issues.map((i) => i.page_url))].sort();

  return (
    <div>
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div>
          <h5 className="fw-bold mb-1" style={{ color: 'var(--color-primary)' }}>
            Website Intelligence
          </h5>
          <p className="text-muted small mb-0">
            Autonomous scanning, issue detection, and improvement recommendations for public pages.
          </p>
        </div>
        <button
          className="btn btn-sm btn-primary"
          onClick={handleScan}
          disabled={scanning}
        >
          {scanning ? (
            <>
              <span className="spinner-border spinner-border-sm me-1" role="status" />
              Scanning...
            </>
          ) : (
            'Run Website Scan'
          )}
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="row g-3 mb-4">
          <div className="col-sm-6 col-lg-3">
            <div className="card border-0 shadow-sm">
              <div className="card-body text-center py-3">
                <div className="text-muted small fw-medium">Total Issues</div>
                <div className="fs-3 fw-bold" style={{ color: 'var(--color-primary)' }}>
                  {summary.total}
                </div>
              </div>
            </div>
          </div>
          <div className="col-sm-6 col-lg-3">
            <div className="card border-0 shadow-sm">
              <div className="card-body text-center py-3">
                <div className="text-muted small fw-medium">Open</div>
                <div className="fs-3 fw-bold text-warning">{summary.open}</div>
              </div>
            </div>
          </div>
          <div className="col-sm-6 col-lg-3">
            <div className="card border-0 shadow-sm">
              <div className="card-body text-center py-3">
                <div className="text-muted small fw-medium">Auto-Repaired</div>
                <div className="fs-3 fw-bold text-info">{summary.auto_repaired}</div>
              </div>
            </div>
          </div>
          <div className="col-sm-6 col-lg-3">
            <div className="card border-0 shadow-sm">
              <div className="card-body text-center py-3">
                <div className="text-muted small fw-medium">Last 24h</div>
                <div className="fs-3 fw-bold text-success">{summary.recent_24h}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Type breakdown */}
      {summary && Object.keys(summary.by_type).length > 0 && (
        <div className="d-flex gap-2 flex-wrap mb-3">
          {Object.entries(summary.by_type).map(([type, count]) => (
            <span key={type} className="badge bg-light text-dark border">
              {TYPE_LABELS[type] || type}: {count}
            </span>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="d-flex gap-2 mb-3 flex-wrap align-items-center">
        <select
          className="form-select form-select-sm"
          style={{ width: 'auto' }}
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="">All Types</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>

        <select
          className="form-select form-select-sm"
          style={{ width: 'auto' }}
          value={filterSeverity}
          onChange={(e) => setFilterSeverity(e.target.value)}
        >
          <option value="">All Severity</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
          <option value="info">Info</option>
        </select>

        <select
          className="form-select form-select-sm"
          style={{ width: 'auto' }}
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="">All Status</option>
          <option value="open">Open</option>
          <option value="auto_repaired">Auto-Repaired</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="resolved">Resolved</option>
        </select>

        {uniquePages.length > 0 && (
          <select
            className="form-select form-select-sm"
            style={{ width: 'auto' }}
            value={filterPage}
            onChange={(e) => setFilterPage(e.target.value)}
          >
            <option value="">All Pages</option>
            {uniquePages.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        )}

        <span className="text-muted small ms-auto">{total} issue{total !== 1 ? 's' : ''}</span>
      </div>

      {/* Issues Table */}
      <div className="table-responsive">
        <table className="table table-hover mb-0 small">
          <thead className="table-light">
            <tr>
              <th>Severity</th>
              <th>Type</th>
              <th>Page</th>
              <th>Description</th>
              <th>Confidence</th>
              <th>Status</th>
              <th>Found</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {issues.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center text-muted py-4">
                  No issues found. Run a scan to detect website issues.
                </td>
              </tr>
            ) : (
              issues.map((issue) => (
                <React.Fragment key={issue.id}>
                  <tr
                    style={{ cursor: 'pointer' }}
                    onClick={() => setExpandedId(expandedId === issue.id ? null : issue.id)}
                  >
                    <td>
                      <span className={`badge bg-${SEVERITY_COLORS[issue.severity] || 'secondary'}`}>
                        {issue.severity}
                      </span>
                    </td>
                    <td>
                      <span className="text-nowrap">
                        {TYPE_LABELS[issue.issue_type] || issue.issue_type}
                      </span>
                    </td>
                    <td>
                      <code className="small">{issue.page_url}</code>
                    </td>
                    <td style={{ maxWidth: '300px' }}>
                      <span className="text-truncate d-inline-block" style={{ maxWidth: '280px' }}>
                        {issue.description}
                      </span>
                    </td>
                    <td>
                      <span className={`fw-medium ${issue.confidence >= 0.9 ? 'text-success' : issue.confidence >= 0.7 ? 'text-warning' : 'text-muted'}`}>
                        {(issue.confidence * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td>
                      <span className={`badge bg-${STATUS_COLORS[issue.status] || 'secondary'}`}>
                        {issue.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="text-nowrap text-muted">{timeAgo(issue.created_at)}</td>
                    <td>
                      {issue.status === 'open' && (
                        <div className="d-flex gap-1">
                          <button
                            className="btn btn-outline-success btn-sm"
                            onClick={(e) => { e.stopPropagation(); handleStatusChange(issue.id, 'resolved'); }}
                            title="Mark Resolved"
                          >
                            Resolve
                          </button>
                          <button
                            className="btn btn-outline-secondary btn-sm"
                            onClick={(e) => { e.stopPropagation(); handleStatusChange(issue.id, 'rejected'); }}
                            title="Reject"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                  {expandedId === issue.id && (
                    <tr>
                      <td colSpan={8} className="bg-light">
                        <div className="p-2">
                          <div className="row g-3">
                            <div className="col-md-6">
                              <strong className="small">Description</strong>
                              <p className="small mb-2">{issue.description}</p>
                              {issue.suggested_fix && (
                                <>
                                  <strong className="small">Suggested Fix</strong>
                                  <p className="small mb-2 text-success">{issue.suggested_fix}</p>
                                </>
                              )}
                              {issue.element_selector && (
                                <>
                                  <strong className="small">Element</strong>
                                  <p className="small mb-0">
                                    <code>{issue.element_selector}</code>
                                  </p>
                                </>
                              )}
                            </div>
                            <div className="col-md-6">
                              <strong className="small">Agent</strong>
                              <p className="small mb-2">{issue.agent_name}</p>
                              {issue.repaired_by && (
                                <>
                                  <strong className="small">Repaired By</strong>
                                  <p className="small mb-2">
                                    {issue.repaired_by} {issue.repaired_at && `(${timeAgo(issue.repaired_at)})`}
                                  </p>
                                </>
                              )}
                              {issue.details && Object.keys(issue.details).length > 0 && (
                                <>
                                  <strong className="small">Details</strong>
                                  <pre className="small mb-0 bg-white p-2 rounded" style={{ maxHeight: '120px', overflow: 'auto' }}>
                                    {JSON.stringify(issue.details, null, 2)}
                                  </pre>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default WebsiteIntelligenceTab;
