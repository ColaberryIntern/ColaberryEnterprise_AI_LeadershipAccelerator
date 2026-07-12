import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import QuickAddLeadModal from '../../components/admin/QuickAddLeadModal';
import BatchActionBar from '../../components/admin/BatchActionBar';
import TemperatureBadge from '../../components/TemperatureBadge';
import TableSkeleton from '../../components/ui/TableSkeleton';
import Pagination from '../../components/ui/Pagination';
import useDebounce from '../../hooks/useDebounce';
import { PageHeader, StatCard, StatusBadge, SectionCard } from '../../components/admin/shell';
import { TrustSignal, TrustLevel } from '../../components/admin/shell/trust';

interface LeadStats {
  total: number;
  byStatus: Record<string, number>;
  conversionRate: string;
  highIntent: number;
  thisMonth: number;
}

interface Lead {
  id: number;
  name: string;
  email: string;
  company: string;
  title: string;
  phone: string;
  status: string;
  lead_score: number;
  lead_temperature?: string;
  source: string;
  form_type: string;
  executive_briefing_score?: number;
  executive_briefing_requested?: boolean;
  sponsorship_kit_requested?: boolean;
  sponsorship_readiness_score?: number;
  sponsorship_stage?: string;
  created_at: string;
  assignedAdmin?: { id: string; email: string };
  ghl_contact_id?: string;
}

const GHL_LOCATION_ID = 'JFWwp8q7l6T12NWTIOKG';
const ghlContactUrl = (contactId: string) =>
  `https://app.gohighlevel.com/v2/location/${GHL_LOCATION_ID}/contacts/detail/${contactId}`;

const STATUS_OPTIONS = ['new', 'contacted', 'qualified', 'enrolled', 'lost'];

const SOURCE_OPTIONS = [
  { value: '', label: 'All Sources' },
  { value: 'executive_overview_download', label: 'Executive Briefing' },
  { value: 'contact', label: 'Contact Form' },
  { value: 'interest', label: 'Interest Form' },
  { value: 'sponsorship_inquiry', label: 'Sponsorship' },
  { value: 'sponsorship_pipeline', label: 'Sponsorship Pipeline' },
];

const TEMP_OPTIONS = [
  { value: '', label: 'All Temps' },
  { value: 'hot', label: 'Hot' },
  { value: 'warm', label: 'Warm' },
  { value: 'cool', label: 'Cool' },
  { value: 'cold', label: 'Cold' },
  { value: 'qualified', label: 'Qualified' },
];

function AdminLeadsPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<LeadStats | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [tempFilter, setTempFilter] = useState(() => new URLSearchParams(window.location.search).get('temperature') || '');
  const [scoreMin, setScoreMin] = useState('');
  const [scoreMax, setScoreMax] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounce(searchInput, 300);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchLeads = useCallback(async () => {
    try {
      const params: Record<string, string> = { page: String(page), limit: '25' };
      if (statusFilter) params.status = statusFilter;
      if (sourceFilter) params.source = sourceFilter;
      if (tempFilter) params.temperature = tempFilter;
      if (scoreMin) params.scoreMin = scoreMin;
      if (scoreMax) params.scoreMax = scoreMax;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      if (search) params.search = search;
      const res = await api.get('/api/admin/leads', { params });
      setLeads(res.data.leads);
      setTotal(res.data.total);
      setTotalPages(res.data.totalPages);
    } catch (err) {
      console.error('Failed to fetch leads:', err);
    }
  }, [page, statusFilter, sourceFilter, tempFilter, scoreMin, scoreMax, dateFrom, dateTo, search]);

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

  const clearFilters = () => {
    setSearchInput('');
    setStatusFilter('');
    setSourceFilter('');
    setScoreMin('');
    setScoreMax('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === leads.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(leads.map((l) => l.id));
    }
  };

  const handleBatchComplete = () => {
    fetchLeads();
    fetchStats();
  };

  const hasFilters = search || statusFilter || sourceFilter || scoreMin || scoreMax || dateFrom || dateTo;

  // Per-page trust signal (Basecamp todo 10027085963) derived from live lead pipeline health.
  const trust: TrustSignal = useMemo(() => {
    const totalLeads = stats?.total ?? 0;
    const newLeads = stats?.byStatus.new ?? 0;
    const highIntent = stats?.highIntent ?? 0;
    const level: TrustLevel = totalLeads > 0 ? 'live' : 'unverified';
    return {
      level,
      source: 'leads table',
      updatedAt: new Date().toISOString(),
      summary: `${totalLeads} leads in pipeline, ${newLeads} new, ${highIntent} high-intent.`,
      href: '/admin/trust',
      pillars: [
        {
          name: 'Pipeline',
          status: level,
          evidence: [
            { label: 'Total', value: String(totalLeads) },
            { label: 'New', value: String(newLeads) },
          ],
        },
      ],
    };
  }, [stats]);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getScoreBadge = (score: number) => {
    if (score > 80) return 'bg-danger';
    if (score > 60) return 'bg-warning text-dark';
    if (score > 30) return 'bg-info';
    return 'bg-light text-dark';
  };

  if (loading) {
    return (
      <>
        <PageHeader
          title="Lead Management"
          icon="group-line"
          subtitle="Track, qualify, and convert every inbound lead across all sources."
          breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Leads' }]}
          trust={trust}
        />
        <SectionCard padded={false}>
          <TableSkeleton rows={8} columns={7} />
        </SectionCard>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Lead Management"
        icon="group-line"
        subtitle="Track, qualify, and convert every inbound lead across all sources."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Leads' }]}
        trust={trust}
        actions={
          <>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)}>
              + Add Lead
            </button>
            <button className="btn btn-outline-primary btn-sm" onClick={() => navigate('/admin/import')}>
              Import CSV
            </button>
            <button className="btn btn-outline-primary btn-sm" onClick={() => navigate('/admin/apollo')}>
              Apollo Enrich
            </button>
            <button className="btn btn-outline-secondary btn-sm" onClick={handleExport}>
              Export CSV
            </button>
          </>
        }
      >
        {stats && (
          <div className="row g-3">
            <div className="col-6 col-md">
              <StatCard label="Total" value={stats.total} icon="group-line" tone="neutral" />
            </div>
            <div className="col-6 col-md">
              <StatCard label="New" value={stats.byStatus.new || 0} icon="user-add-line" tone="info" />
            </div>
            <div className="col-6 col-md">
              <StatCard label="High-Intent" value={stats.highIntent} icon="fire-line" tone="danger" />
            </div>
            <div className="col-6 col-md">
              <StatCard label="This Month" value={stats.thisMonth} icon="calendar-line" tone="primary" />
            </div>
            <div className="col-6 col-md">
              <StatCard label="Conversion" value={stats.conversionRate} unit="%" icon="line-chart-line" tone="success" />
            </div>
          </div>
        )}
      </PageHeader>

      {/* Filters */}
      <div className="mb-4">
        <SectionCard>
          <div className="row g-3 align-items-end">
            <div className="col-md-3">
              <label className="form-label small text-muted">Search</label>
              <input
                type="text"
                className="form-control"
                placeholder="Name, email, company..."
                value={searchInput}
                onChange={(e) => { setSearchInput(e.target.value); setPage(1); }}
                aria-label="Search leads"
              />
            </div>
            <div className="col-md-2">
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
            <div className="col-md-2">
              <label className="form-label small text-muted">Source</label>
              <select
                className="form-select"
                value={sourceFilter}
                onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
              >
                {SOURCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label small text-muted">Temperature</label>
              <select
                className="form-select"
                value={tempFilter}
                onChange={(e) => { setTempFilter(e.target.value); setPage(1); }}
              >
                {TEMP_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="col-md-2">
              <label className="form-label small text-muted">Score Range</label>
              <div className="input-group input-group-sm">
                <input
                  type="number"
                  className="form-control"
                  placeholder="Min"
                  value={scoreMin}
                  min="0"
                  onChange={(e) => { setScoreMin(e.target.value); setPage(1); }}
                />
                <span className="input-group-text">-</span>
                <input
                  type="number"
                  className="form-control"
                  placeholder="Max"
                  value={scoreMax}
                  max="200"
                  onChange={(e) => { setScoreMax(e.target.value); setPage(1); }}
                />
              </div>
            </div>
            <div className="col-md-2">
              <label className="form-label small text-muted">Date Range</label>
              <input
                type="date"
                className="form-control form-control-sm mb-1"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              />
              <input
                type="date"
                className="form-control form-control-sm"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              />
            </div>
            {hasFilters && (
              <div className="col-md-1">
                <button
                  className="btn btn-outline-secondary btn-sm"
                  onClick={clearFilters}
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      {/* Batch Actions */}
      {selectedIds.length > 0 && (
        <BatchActionBar
          selectedIds={selectedIds}
          onClearSelection={() => setSelectedIds([])}
          onActionComplete={handleBatchComplete}
        />
      )}

      {/* Leads Table */}
      <SectionCard title={`Leads (${total})`} padded={false}>
        <div className="table-responsive">
          <table className="table table-hover table-striped mb-0">
              <thead className="table-light">
                <tr>
                  <th style={{ width: '40px' }}>
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={leads.length > 0 && selectedIds.length === leads.length}
                      onChange={toggleSelectAll}
                      aria-label="Select all leads"
                    />
                  </th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Company</th>
                  <th>Title</th>
                  <th>Score</th>
                  <th>Temp</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center text-muted py-4">
                      {hasFilters ? 'No leads match the current filters.' : 'No leads yet. Click "+ Add Lead" to get started.'}
                    </td>
                  </tr>
                ) : (
                  leads.map((lead) => (
                    <tr key={lead.id}>
                      <td>
                        <input
                          type="checkbox"
                          className="form-check-input"
                          checked={selectedIds.includes(lead.id)}
                          onChange={() => toggleSelect(lead.id)}
                        />
                      </td>
                      <td className="fw-medium">
                        {lead.name}
                        {lead.executive_briefing_score != null && lead.executive_briefing_score > 7 && (
                          <span className="badge bg-danger ms-2" style={{ fontSize: '0.65rem', verticalAlign: 'middle' }}>High Intent Exec</span>
                        )}
                        {lead.sponsorship_readiness_score != null && lead.sponsorship_readiness_score > 12 && (
                          <span className="badge bg-warning text-dark ms-2" style={{ fontSize: '0.65rem', verticalAlign: 'middle' }}>Sponsor Likely</span>
                        )}
                        {lead.ghl_contact_id && (
                          <a
                            href={ghlContactUrl(lead.ghl_contact_id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="View in GoHighLevel"
                            className="ms-2"
                            style={{ verticalAlign: 'middle' }}
                          >
                            <img
                              src="/ghl-logo.svg"
                              alt="GHL"
                              width="18"
                              height="18"
                              style={{ borderRadius: '3px' }}
                            />
                          </a>
                        )}
                      </td>
                      <td className="small">{lead.email}</td>
                      <td>{lead.company || '-'}</td>
                      <td className="small">{lead.title || '-'}</td>
                      <td>
                        <span className={`badge ${getScoreBadge(lead.lead_score || 0)}`}>
                          {lead.lead_score || 0}
                        </span>
                      </td>
                      <td>
                        <TemperatureBadge temperature={lead.lead_temperature} />
                      </td>
                      <td>
                        <select
                          className="form-select form-select-sm border-0 fw-medium"
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
                        <StatusBadge label={lead.form_type || lead.source} tone="neutral" />
                      </td>
                      <td className="text-nowrap small">{formatDate(lead.created_at)}</td>
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

          {/* Pagination */}
          <div className="d-flex justify-content-between align-items-center p-3 border-top">
            <span className="text-muted small">Page {page} of {totalPages}</span>
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </SectionCard>

      {showAddModal && (
        <QuickAddLeadModal
          onClose={() => setShowAddModal(false)}
          onLeadCreated={() => { fetchLeads(); fetchStats(); }}
        />
      )}
    </>
  );
}

export default AdminLeadsPage;
