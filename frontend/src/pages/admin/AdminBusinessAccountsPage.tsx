import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, StatCard, StatusBadge, SectionCard } from '../../components/admin/shell';
import {
  listOrganizations,
  getOrganizationStats,
  describeApiError,
  OrgListRow,
  OrgPortfolioStats,
  OrganizationStatus,
} from '../../services/adminOrgApi';

/**
 * AdminBusinessAccountsPage — every company that has registered an account.
 *
 * This surface did not exist. Business accounts have been created from the public
 * site for months (registration writes an `organizations` row, an `enrollments`
 * row and a manager `org_members` row), but no admin page and no admin API could
 * see them: the org routes are participant-scoped and resolve the organization
 * from the requesting person's own enrollment, so they structurally cannot answer
 * "show me every company".
 *
 * The empty state deliberately distinguishes three cases — failed, filtered,
 * genuinely empty. The leads page shipped the collapsed version of this and told
 * an operator "No leads yet" against 24,244 real rows because the request had
 * failed and nothing said so.
 */

const STATUS_OPTIONS: { value: OrganizationStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
];

function AdminBusinessAccountsPage(): React.ReactElement {
  const [rows, setRows] = useState<OrgListRow[]>([]);
  const [stats, setStats] = useState<OrgPortfolioStats | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<OrganizationStatus | ''>('');

  // Debounced so typing a company name is not one request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchRows = useCallback(async () => {
    try {
      const data = await listOrganizations({ page, limit: 25, search, status });
      setRows(data.organizations);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setLoadError(null);
    } catch (err) {
      // Surfaced, never swallowed.
      setLoadError(describeApiError(err, 'business accounts'));
      setRows([]);
      setTotal(0);
    }
  }, [page, search, status]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchRows(),
      getOrganizationStats()
        .then(setStats)
        .catch(() => setStats(null)),
    ]).finally(() => setLoading(false));
  }, [fetchRows]);

  const hasFilters = Boolean(search || status);

  return (
    <div className="container-fluid py-4">
      <PageHeader
        title="Business Accounts"
        icon="building-line"
        subtitle="Every company that has registered an account, its roster, and the cohorts it is in."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Business Accounts' }]}
      />

      {stats && (
        <div className="row g-3 mb-4">
          <div className="col-6 col-lg-3">
            <StatCard label="TOTAL" value={stats.total} icon="building-line" tone="primary" />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="ACTIVE" value={stats.active} icon="check-line" tone="success" />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="SUSPENDED" value={stats.suspended} icon="pause-circle-line" tone="danger" />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard
              label="IN A COHORT"
              value={stats.with_cohorts}
              icon="graduation-cap-line"
              tone="info"
              hint="Companies linked to at least one cohort"
            />
          </div>
        </div>
      )}

      <SectionCard title="Filters" icon="filter-3-line" className="mb-4">
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label" htmlFor="ba-search">
              Search
            </label>
            <input
              id="ba-search"
              className="form-control"
              placeholder="Company name..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div className="col-md-4">
            <label className="form-label" htmlFor="ba-status">
              Status
            </label>
            <select
              id="ba-status"
              className="form-select"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as OrganizationStatus | '');
                setPage(1);
              }}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </SectionCard>

      <SectionCard title={`Business Accounts (${total})`} icon="building-line" padded={false}>
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>Company</th>
                <th>Owner</th>
                <th className="text-end">Members</th>
                <th className="text-end">Cohorts</th>
                <th>Status</th>
                <th>Lead</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="text-center text-muted py-4">
                    Loading...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  {/* Three states, three messages. "No business accounts yet" is a
                      claim about the database and must not appear when the request
                      failed. */}
                  <td
                    colSpan={8}
                    className={`text-center py-4 ${loadError ? 'text-danger' : 'text-muted'}`}
                  >
                    {loadError
                      ? loadError
                      : hasFilters
                        ? 'No business accounts match the current filters.'
                        : 'No business accounts yet.'}
                  </td>
                </tr>
              ) : (
                rows.map((org) => (
                  <tr key={org.id}>
                    <td className="fw-bold">
                      <Link to={`/admin/business-accounts/${org.id}`}>{org.name}</Link>
                    </td>
                    <td>
                      <div>{org.owner_name || '-'}</div>
                      <div className="small text-muted">{org.owner_email || '-'}</div>
                    </td>
                    <td className="text-end">
                      {org.member_count}
                      {org.active_member_count !== org.member_count && (
                        <span className="text-muted small"> ({org.active_member_count} active)</span>
                      )}
                    </td>
                    <td className="text-end">{org.cohort_count}</td>
                    <td>
                      <StatusBadge
                        label={org.status === 'suspended' ? 'Suspended' : 'Active'}
                        tone={org.status === 'suspended' ? 'danger' : 'success'}
                      />
                    </td>
                    <td>
                      {org.lead_id ? (
                        <Link to={`/admin/leads/${org.lead_id}`}>#{org.lead_id}</Link>
                      ) : (
                        <span
                          className="text-muted small"
                          title="No lead is linked to this account"
                        >
                          -
                        </span>
                      )}
                    </td>
                    <td className="small text-muted">
                      {new Date(org.created_at).toLocaleDateString()}
                    </td>
                    <td className="text-end">
                      <Link
                        className="btn btn-sm btn-outline-danger"
                        to={`/admin/business-accounts/${org.id}`}
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
        <div className="d-flex justify-content-between align-items-center p-3 border-top">
          <span className="small text-muted">
            Page {page} of {totalPages}
          </span>
          <div className="btn-group">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

export default AdminBusinessAccountsPage;
