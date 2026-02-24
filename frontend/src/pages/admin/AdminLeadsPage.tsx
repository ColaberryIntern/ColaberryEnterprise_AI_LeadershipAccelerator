import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';

interface LeadStats {
  total: number;
  byStatus: Record<string, number>;
  conversionRate: string;
}

interface Lead {
  id: number;
  name: string;
  email: string;
  company: string;
  phone: string;
  status: string;
  source: string;
  form_type: string;
  created_at: string;
  assignedAdmin?: { id: string; email: string };
}

const STATUS_OPTIONS = ['new', 'contacted', 'qualified', 'enrolled', 'lost'];

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-info',
  contacted: 'bg-primary',
  qualified: 'bg-warning text-dark',
  enrolled: 'bg-success',
  lost: 'bg-secondary',
};

function AdminLeadsPage() {
  const [stats, setStats] = useState<LeadStats | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const fetchLeads = useCallback(async () => {
    try {
      const params: Record<string, string> = { page: String(page), limit: '25' };
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      const res = await api.get('/api/admin/leads', { params });
      setLeads(res.data.leads);
      setTotal(res.data.total);
      setTotalPages(res.data.totalPages);
    } catch (err) {
      console.error('Failed to fetch leads:', err);
    }
  }, [page, statusFilter, search]);

  const fetchStats = async () => {
    try {
      const res = await api.get('/api/admin/leads/stats');
      setStats(res.data.stats);
    } catch (err) {
      console.error('Failed to fetch lead stats:', err);
    }
  };

  useEffect(() => {
    Promise.all([fetchLeads(), fetchStats()]).finally(() => setLoading(false));
  }, [fetchLeads]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput);
  };

  const handleStatusChange = async (leadId: number, newStatus: string) => {
    try {
      await api.patch(`/api/admin/leads/${leadId}`, { status: newStatus });
      fetchLeads();
      fetchStats();
    } catch (err) {
      console.error('Failed to update lead status:', err);
    }
  };

  const handleExport = async () => {
    try {
      const res = await api.get('/api/admin/leads/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'leads-export.csv';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export leads:', err);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
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

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1 className="h3 fw-bold mb-0" style={{ color: 'var(--color-primary)' }}>
          Lead Management
        </h1>
        <button className="btn btn-outline-primary btn-sm" onClick={handleExport}>
          Export CSV
        </button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="row g-3 mb-4">
          <div className="col-md-2">
            <div className="card border-0 shadow-sm p-3 text-center">
              <div className="text-muted small mb-1">Total</div>
              <div className="h4 fw-bold mb-0">{stats.total}</div>
            </div>
          </div>
          {STATUS_OPTIONS.map((s) => (
            <div key={s} className="col-md-2">
              <div
                className="card border-0 shadow-sm p-3 text-center"
                style={{ cursor: 'pointer' }}
                onClick={() => { setStatusFilter(statusFilter === s ? '' : s); setPage(1); }}
              >
                <div className="text-muted small mb-1 text-capitalize">{s}</div>
                <div className="h4 fw-bold mb-0">{stats.byStatus[s] || 0}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="card border-0 shadow-sm mb-4">
        <div className="card-body">
          <div className="row g-3 align-items-end">
            <div className="col-md-4">
              <form onSubmit={handleSearch}>
                <label className="form-label small text-muted">Search</label>
                <div className="input-group">
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Name, email, or company..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                  />
                  <button className="btn btn-primary" type="submit">Search</button>
                </div>
              </form>
            </div>
            <div className="col-md-3">
              <label className="form-label small text-muted">Status</label>
              <select
                className="form-select"
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              >
                <option value="">All Statuses</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
            {(search || statusFilter) && (
              <div className="col-md-2">
                <button
                  className="btn btn-outline-secondary"
                  onClick={() => { setSearch(''); setSearchInput(''); setStatusFilter(''); setPage(1); }}
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Leads Table */}
      <div className="card border-0 shadow-sm">
        <div className="card-header bg-white fw-bold fs-6 py-3 d-flex justify-content-between">
          <span>Leads ({total})</span>
        </div>
        <div className="card-body p-0">
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Company</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center text-muted py-4">
                      No leads found
                    </td>
                  </tr>
                ) : (
                  leads.map((lead) => (
                    <tr key={lead.id}>
                      <td className="fw-medium">{lead.name}</td>
                      <td>{lead.email}</td>
                      <td>{lead.company || '-'}</td>
                      <td>{lead.phone || '-'}</td>
                      <td>
                        <select
                          className={`form-select form-select-sm border-0 fw-medium`}
                          style={{ width: 'auto', minWidth: '120px' }}
                          value={lead.status}
                          onChange={(e) => handleStatusChange(lead.id, e.target.value)}
                        >
                          {STATUS_OPTIONS.map((s) => (
                            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <span className="badge bg-light text-dark">{lead.source || lead.form_type}</span>
                      </td>
                      <td className="text-nowrap">{formatDate(lead.created_at)}</td>
                      <td>
                        <Link
                          to={`/admin/leads/${lead.id}`}
                          className="btn btn-outline-primary btn-sm"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="card-footer bg-white d-flex justify-content-between align-items-center">
            <span className="text-muted small">
              Page {page} of {totalPages}
            </span>
            <div>
              <button
                className="btn btn-sm btn-outline-primary me-2"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <button
                className="btn btn-sm btn-outline-primary"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default AdminLeadsPage;
