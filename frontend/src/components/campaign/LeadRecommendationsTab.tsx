import React, { useEffect, useState } from 'react';

interface Recommendation {
  id: string;
  campaign_id: string;
  icp_profile_id: string;
  lead_data: {
    name: string;
    email: string | null;
    title: string | null;
    company: string | null;
    industry: string | null;
    employee_count: number | null;
    linkedin_url: string | null;
  };
  program_fit_score: number;
  probability_of_sale: number;
  expected_revenue: number | null;
  reasoning: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

interface Stats {
  total_discovered: number;
  pending: number;
  approved: number;
  rejected: number;
  estimated_revenue: number;
  avg_fit_score: number;
}

interface Props {
  campaignId: string;
  headers: Record<string, string>;
}

const FIT_BADGE: Record<string, string> = {
  high: 'success',
  medium: 'warning',
  low: 'danger',
};

function fitLevel(score: number): string {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

export default function LeadRecommendationsTab({ campaignId, headers }: Props) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('pending');

  useEffect(() => {
    loadData();
  }, [campaignId, page, statusFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [recRes, statsRes] = await Promise.all([
        fetch(`/api/admin/lead-recommendations?campaign_id=${campaignId}&status=${statusFilter}&page=${page}&per_page=20`, { headers }),
        fetch(`/api/admin/lead-recommendations/stats?campaign_id=${campaignId}`, { headers }),
      ]);
      if (recRes.ok) {
        const data = await recRes.json();
        setRecommendations(data.recommendations);
        setTotalPages(data.total_pages);
      }
      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
    } catch (err) {
      console.error('Failed to load recommendations:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    setActing(true);
    try {
      await fetch(`/api/admin/lead-recommendations/${id}/approve`, { method: 'POST', headers });
      await loadData();
    } catch (err) {
      console.error('Approve failed:', err);
    } finally {
      setActing(false);
    }
  };

  const handleReject = async (id: string) => {
    setActing(true);
    try {
      await fetch(`/api/admin/lead-recommendations/${id}/reject`, { method: 'POST', headers });
      await loadData();
    } catch (err) {
      console.error('Reject failed:', err);
    } finally {
      setActing(false);
    }
  };

  const handleBulkApprove = async () => {
    if (selected.size === 0) return;
    setActing(true);
    try {
      await fetch('/api/admin/lead-recommendations/bulk-approve', {
        method: 'POST',
        headers,
        body: JSON.stringify({ recommendation_ids: Array.from(selected) }),
      });
      setSelected(new Set());
      await loadData();
    } catch (err) {
      console.error('Bulk approve failed:', err);
    } finally {
      setActing(false);
    }
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleSelectAll = () => {
    if (selected.size === recommendations.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(recommendations.map(r => r.id)));
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border spinner-border-sm" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="row g-4">
      {/* Summary Stats */}
      <div className="col-12">
        <div className="row g-3">
          <div className="col-md-4">
            <div className="card border-0 shadow-sm">
              <div className="card-body text-center py-3">
                <div className="text-muted small">Pending Approval</div>
                <div className="fs-3 fw-bold text-primary">{stats?.pending || 0}</div>
              </div>
            </div>
          </div>
          <div className="col-md-4">
            <div className="card border-0 shadow-sm">
              <div className="card-body text-center py-3">
                <div className="text-muted small">Estimated Revenue</div>
                <div className="fs-3 fw-bold text-success">${(stats?.estimated_revenue || 0).toLocaleString()}</div>
              </div>
            </div>
          </div>
          <div className="col-md-4">
            <div className="card border-0 shadow-sm">
              <div className="card-body text-center py-3">
                <div className="text-muted small">Avg Fit Score</div>
                <div className="fs-3 fw-bold">{stats?.avg_fit_score || 0}<small className="text-muted fs-6">/100</small></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Actions */}
      <div className="col-12">
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white d-flex justify-content-between align-items-center">
            <div className="d-flex gap-2 align-items-center">
              <span className="fw-semibold">Lead Recommendations</span>
              <select
                className="form-select form-select-sm"
                style={{ width: 'auto' }}
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              >
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            {statusFilter === 'pending' && recommendations.length > 0 && (
              <div className="d-flex gap-2">
                <button
                  className="btn btn-sm btn-outline-success"
                  disabled={acting || selected.size === 0}
                  onClick={handleBulkApprove}
                >
                  Approve Selected ({selected.size})
                </button>
              </div>
            )}
          </div>
          <div className="card-body p-0">
            {recommendations.length === 0 ? (
              <p className="text-muted small p-3 mb-0">
                {statusFilter === 'pending'
                  ? 'No pending recommendations. The Apollo Lead Intelligence Agent discovers leads every 6 hours for autonomous campaigns with ICP profiles.'
                  : `No ${statusFilter} recommendations.`}
              </p>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover mb-0" style={{ fontSize: '0.8rem' }}>
                  <thead className="table-light">
                    <tr>
                      {statusFilter === 'pending' && (
                        <th style={{ width: 32 }}>
                          <input
                            type="checkbox"
                            className="form-check-input"
                            checked={selected.size === recommendations.length && recommendations.length > 0}
                            onChange={toggleSelectAll}
                          />
                        </th>
                      )}
                      <th>Name</th>
                      <th>Title</th>
                      <th>Company</th>
                      <th>Industry</th>
                      <th>Fit Score</th>
                      <th>Probability</th>
                      <th>Est. Revenue</th>
                      <th>Reasoning</th>
                      {statusFilter === 'pending' && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {recommendations.map((r) => (
                      <tr key={r.id}>
                        {statusFilter === 'pending' && (
                          <td>
                            <input
                              type="checkbox"
                              className="form-check-input"
                              checked={selected.has(r.id)}
                              onChange={() => toggleSelect(r.id)}
                            />
                          </td>
                        )}
                        <td>
                          <strong>{r.lead_data.name || '—'}</strong>
                          {r.lead_data.email && (
                            <div className="text-muted" style={{ fontSize: '0.7rem' }}>{r.lead_data.email}</div>
                          )}
                        </td>
                        <td>{r.lead_data.title || '—'}</td>
                        <td>{r.lead_data.company || '—'}</td>
                        <td>{r.lead_data.industry || '—'}</td>
                        <td>
                          <span className={`badge bg-${FIT_BADGE[fitLevel(r.program_fit_score)]}`}>
                            {r.program_fit_score}
                          </span>
                        </td>
                        <td>{Math.round(r.probability_of_sale * 100)}%</td>
                        <td>${(r.expected_revenue || 0).toLocaleString()}</td>
                        <td>
                          <span title={r.reasoning} style={{ cursor: 'help' }}>
                            {r.reasoning.length > 80 ? r.reasoning.slice(0, 80) + '...' : r.reasoning}
                          </span>
                        </td>
                        {statusFilter === 'pending' && (
                          <td>
                            <div className="d-flex gap-1">
                              <button
                                className="btn btn-sm btn-outline-success py-0 px-1"
                                style={{ fontSize: '0.7rem' }}
                                disabled={acting}
                                onClick={() => handleApprove(r.id)}
                              >
                                Approve
                              </button>
                              <button
                                className="btn btn-sm btn-outline-danger py-0 px-1"
                                style={{ fontSize: '0.7rem' }}
                                disabled={acting}
                                onClick={() => handleReject(r.id)}
                              >
                                Reject
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="card-footer bg-white d-flex justify-content-center gap-2">
              <button
                className="btn btn-sm btn-outline-secondary"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                Previous
              </button>
              <span className="small align-self-center text-muted">Page {page} of {totalPages}</span>
              <button
                className="btn btn-sm btn-outline-secondary"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
