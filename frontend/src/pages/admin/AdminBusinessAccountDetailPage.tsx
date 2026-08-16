import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader, StatCard, StatusBadge, SectionCard } from '../../components/admin/shell';
import {
  getOrganization,
  setOrganizationStatus,
  addCohortToOrganization,
  removeCohortFromOrganization,
  describeApiError,
  listCohortsForLinking,
  getViewAsUrl,
  OrgDetailResponse,
} from '../../services/adminOrgApi';

/**
 * AdminBusinessAccountDetailPage — one company, everything staff needs.
 *
 * SEATS vs PLACEMENT, the distinction this page exists to keep honest:
 * `seats_sponsored` is what the company committed to; `members placed` counts
 * roster members whose *enrollment* actually sits in that cohort. Linking a
 * cohort to a company deliberately moves nobody into it (per-person placement
 * lives on enrollments.cohort_id and drives which curriculum a real person
 * sees), so the two numbers legitimately differ and the gap is the unfilled
 * seats. Showing one number would hide that.
 */

/**
 * Dates arrive as ISO strings or null. `new Date(null|undefined)` yields
 * "Invalid Date", which is exactly what the Created column showed for every
 * business account until the backend's created_at mapping was fixed. Never
 * print a date this function cannot parse.
 */
function formatDate(value: string | null | undefined, withTime = false): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return withTime ? d.toLocaleString() : d.toLocaleDateString();
}

interface CohortOption {
  id: string;
  name: string;
}

function AdminBusinessAccountDetailPage(): React.ReactElement {
  const { id = '' } = useParams<{ id: string }>();
  const [data, setData] = useState<OrgDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [cohortOptions, setCohortOptions] = useState<CohortOption[]>([]);
  const [selectedCohort, setSelectedCohort] = useState('');
  const [seats, setSeats] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await getOrganization(id));
      setLoadError(null);
    } catch (err) {
      setLoadError(describeApiError(err, 'this business account'));
      setData(null);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    // Cohort list powers the "add cohort" picker. A failure here disables that
    // one control rather than breaking the page.
    listCohortsForLinking()
      .then((rows) =>
        setCohortOptions(
          rows.map((c) => ({
            id: c.id,
            // Status in the label so an admin does not silently link a completed
            // cohort thinking it is the upcoming one.
            name: c.status && c.status !== 'open' ? `${c.name} (${c.status})` : c.name,
          })),
        ),
      )
      .catch(() => setCohortOptions([]));
  }, []);

  /**
   * Open someone's portal exactly as they see it, read-only.
   *
   * Reuses the audited accelerator "view as" endpoint that the Accelerator and
   * Community Roles pages already use, rather than adding a second
   * impersonation path — one attributable way in is the point. The minted token
   * is read-only and carries `impersonated_by`.
   *
   * New tab on purpose: the participant session lives under a separate
   * `participant_token`, so this never logs the admin out of the tab they are in.
   *
   * A member with no `enrollment_id` was invited but never activated an account,
   * so there is nothing to open — the button is not rendered for them.
   */
  const openAccount = async (enrollmentId: string | null, who: string) => {
    if (!enrollmentId) return;
    setActionError(null);
    try {
      const url = await getViewAsUrl(enrollmentId);
      if (!url) {
        setActionError(`No portal link is available for ${who}.`);
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setActionError(describeApiError(err, `the portal for ${who}`));
    }
  };

  const toggleStatus = async () => {
    if (!data) return;
    const next = data.organization.status === 'active' ? 'suspended' : 'active';
    const verb = next === 'suspended' ? 'Suspend' : 'Re-enable';
    // Suspending is outward-facing: it is the switch that stops a paying
    // company's people getting in. Confirm before, not after.
    if (!window.confirm(`${verb} "${data.organization.name}"?`)) return;

    setBusy(true);
    setActionError(null);
    try {
      await setOrganizationStatus(id, next);
      await load();
    } catch (err) {
      setActionError(describeApiError(err, 'this business account'));
    } finally {
      setBusy(false);
    }
  };

  const onAddCohort = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCohort) return;
    setBusy(true);
    setActionError(null);
    try {
      await addCohortToOrganization(id, selectedCohort, seats.trim() === '' ? null : Number(seats));
      setSelectedCohort('');
      setSeats('');
      await load();
    } catch (err) {
      setActionError(describeApiError(err, 'this business account'));
    } finally {
      setBusy(false);
    }
  };

  const onRemoveCohort = async (cohortId: string, name: string) => {
    if (!window.confirm(`Unlink "${name}" from this business account?`)) return;
    setBusy(true);
    setActionError(null);
    try {
      await removeCohortFromOrganization(id, cohortId);
      await load();
    } catch (err) {
      setActionError(describeApiError(err, 'this business account'));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="container-fluid py-4">
        <p className="text-muted">Loading...</p>
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <div className="container-fluid py-4">
        <PageHeader
          title="Business Account"
          icon="building-line"
          breadcrumb={[
            { label: 'Admin', to: '/admin/dashboard' },
            { label: 'Business Accounts', to: '/admin/business-accounts' },
            { label: 'Detail' },
          ]}
        />
        <div className="alert alert-danger">{loadError || 'Business account not found.'}</div>
        <Link className="btn btn-outline-secondary" to="/admin/business-accounts">
          Back to all business accounts
        </Link>
      </div>
    );
  }

  const { organization: org, owner, lead, members, cohorts, stats } = data;
  const suspended = org.status === 'suspended';
  const linkedIds = new Set(cohorts.map((c) => c.cohort_id));
  const addable = cohortOptions.filter((c) => !linkedIds.has(c.id));

  return (
    <div className="container-fluid py-4">
      <PageHeader
        title={org.name}
        icon="building-line"
        subtitle={owner ? `Owned by ${owner.full_name} (${owner.email})` : 'No owner on record'}
        breadcrumb={[
          { label: 'Admin', to: '/admin/dashboard' },
          { label: 'Business Accounts', to: '/admin/business-accounts' },
          { label: org.name },
        ]}
        actions={
          <>
            <StatusBadge
              label={suspended ? 'Suspended' : 'Active'}
              tone={suspended ? 'danger' : 'success'}
            />
            {owner && (
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary ms-2"
                onClick={() => openAccount(owner.id, owner.full_name || owner.email)}
                title="Open the owner's portal read-only, in a new tab"
              >
                View account live
              </button>
            )}
            <button
              type="button"
              className={`btn btn-sm ms-2 ${suspended ? 'btn-success' : 'btn-outline-danger'}`}
              onClick={toggleStatus}
              disabled={busy}
            >
              {suspended ? 'Re-enable account' : 'Suspend account'}
            </button>
          </>
        }
      />

      {actionError && <div className="alert alert-danger">{actionError}</div>}

      {suspended && (
        <div className="alert alert-warning">
          This account is suspended{org.status_changed_by ? ` by ${org.status_changed_by}` : ''}
          {org.status_changed_at ? ` on ${formatDate(org.status_changed_at)}` : ''}
          .
        </div>
      )}

      <div className="row g-3 mb-4">
        <div className="col-6 col-lg-3">
          <StatCard label="MEMBERS" value={stats.member_count} icon="team-line" tone="primary" />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard
            label="ACTIVE"
            value={stats.active_member_count}
            icon="check-line"
            tone="success"
            hint={stats.invited_member_count ? `${stats.invited_member_count} still invited` : undefined}
          />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard label="MANAGERS" value={stats.manager_count} icon="user-star-line" tone="info" />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard
            label="PLACED IN A COHORT"
            value={stats.members_with_cohort}
            icon="graduation-cap-line"
            tone={stats.members_without_cohort > 0 ? 'warning' : 'success'}
            hint={
              stats.members_without_cohort > 0
                ? `${stats.members_without_cohort} not placed`
                : 'everyone placed'
            }
          />
        </div>
      </div>

      <div className="row g-4">
        <div className="col-lg-8">
          <SectionCard title={`Members (${members.length})`} icon="team-line" padded={false}>
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Role</th>
                    <th>Team</th>
                    <th>Account</th>
                    <th>Cohort</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {members.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center text-muted py-4">
                        No members on this account yet.
                      </td>
                    </tr>
                  ) : (
                    members.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <div className="fw-bold">{m.full_name || m.email}</div>
                          {m.full_name && <div className="small text-muted">{m.email}</div>}
                        </td>
                        <td>
                          <StatusBadge
                            label={m.role === 'manager' ? 'Manager' : 'Member'}
                            tone={m.role === 'manager' ? 'info' : 'neutral'}
                          />
                        </td>
                        <td className="small text-muted">{m.team || '—'}</td>
                        <td className="small">
                          {/* Two different facts that disagree often enough to
                              matter: `invite_status` is whether they accepted the
                              invite; `enrollment_id` is whether an account exists
                              to open at all. Someone invited but never activated
                              has the first and not the second. */}
                          <StatusBadge
                            label={m.invite_status === 'active' ? 'Active' : 'Invited'}
                            tone={m.invite_status === 'active' ? 'success' : 'warning'}
                          />
                          {m.enrollment_id ? (
                            <div className="text-muted mt-1">
                              {m.tier || 'account'}
                              {m.portal_enabled === false && (
                                <span className="text-danger"> &middot; portal off</span>
                              )}
                            </div>
                          ) : (
                            <div className="text-muted mt-1">no account yet</div>
                          )}
                        </td>
                        <td className="small">
                          {m.cohort_id ? (
                            <span className="text-success">Placed</span>
                          ) : (
                            <span className="text-muted" title="This person is in no cohort">
                              Not placed
                            </span>
                          )}
                        </td>
                        <td className="text-end">
                          {m.enrollment_id && (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary"
                              onClick={() => openAccount(m.enrollment_id, m.full_name || m.email)}
                              title="Open this employee's portal read-only, in a new tab"
                            >
                              View account
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard
            title={`Cohorts (${cohorts.length})`}
            icon="graduation-cap-line"
            subtitle="Linking a cohort records the company relationship. It does not move anyone into it."
            className="mt-4"
            padded={false}
          >
            <div className="table-responsive">
              <table className="table align-middle mb-0">
                <thead>
                  <tr>
                    <th>Cohort</th>
                    <th>Starts</th>
                    <th>Status</th>
                    <th className="text-end">Seats sponsored</th>
                    <th className="text-end">Members placed</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {cohorts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center text-muted py-4">
                        This company is not linked to any cohort.
                      </td>
                    </tr>
                  ) : (
                    cohorts.map((c) => (
                      <tr key={c.link_id}>
                        <td className="fw-bold">{c.name}</td>
                        <td className="small text-muted">{formatDate(c.start_date)}</td>
                        <td className="small">{c.status || '-'}</td>
                        <td className="text-end">{c.seats_sponsored ?? '-'}</td>
                        <td className="text-end">
                          {c.members_placed}
                          {c.seats_sponsored != null && c.members_placed < c.seats_sponsored && (
                            <span className="text-warning small">
                              {' '}
                              ({c.seats_sponsored - c.members_placed} unfilled)
                            </span>
                          )}
                        </td>
                        <td className="text-end">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            disabled={busy}
                            onClick={() => onRemoveCohort(c.cohort_id, c.name)}
                          >
                            Unlink
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <form className="p-3 border-top" onSubmit={onAddCohort}>
              <div className="row g-2 align-items-end">
                <div className="col-md-6">
                  <label className="form-label small" htmlFor="ba-cohort">
                    Add a cohort
                  </label>
                  <select
                    id="ba-cohort"
                    className="form-select"
                    value={selectedCohort}
                    onChange={(e) => setSelectedCohort(e.target.value)}
                  >
                    <option value="">Select a cohort...</option>
                    {addable.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-3">
                  <label className="form-label small" htmlFor="ba-seats">
                    Seats (optional)
                  </label>
                  <input
                    id="ba-seats"
                    className="form-control"
                    type="number"
                    min={0}
                    value={seats}
                    onChange={(e) => setSeats(e.target.value)}
                  />
                </div>
                <div className="col-md-3">
                  <button
                    type="submit"
                    className="btn btn-danger w-100"
                    disabled={busy || !selectedCohort}
                  >
                    Add cohort
                  </button>
                </div>
              </div>
              {addable.length === 0 && cohortOptions.length > 0 && (
                <p className="small text-muted mt-2 mb-0">
                  Every cohort is already linked to this company.
                </p>
              )}
            </form>
          </SectionCard>
        </div>

        <div className="col-lg-4">
          <SectionCard title="Account" icon="information-line">
            <dl className="mb-0 small">
              <dt className="text-muted">Created</dt>
              <dd>{formatDate(org.created_at, true)}</dd>
              <dt className="text-muted">Auto staff sync</dt>
              <dd>{org.auto_staff_sync ? 'On' : 'Off'}</dd>
              <dt className="text-muted">Owner</dt>
              <dd>{owner ? `${owner.full_name} (${owner.email})` : 'None on record'}</dd>
              {org.status_changed_at && (
                <>
                  <dt className="text-muted">Status last changed</dt>
                  <dd>
                    {formatDate(org.status_changed_at, true)}
                    {org.status_changed_by ? ` by ${org.status_changed_by}` : ''}
                  </dd>
                </>
              )}
            </dl>
          </SectionCard>

          <SectionCard title="Originating lead" icon="user-search-line" className="mt-4">
            {lead ? (
              <dl className="mb-0 small">
                <dt className="text-muted">Lead</dt>
                <dd>
                  <Link to={`/admin/leads/${lead.id}`}>#{lead.id}</Link>
                </dd>
                <dt className="text-muted">Email</dt>
                <dd>{lead.email}</dd>
                <dt className="text-muted">Company on lead</dt>
                <dd>{lead.company || '-'}</dd>
                <dt className="text-muted">Status</dt>
                <dd>{lead.status}</dd>
                <dt className="text-muted">Source</dt>
                <dd>{lead.source || '-'}</dd>
              </dl>
            ) : (
              <p className="small text-muted mb-0">
                No lead is linked to this account, and none matches the owner&rsquo;s email.
                Accounts created through the &ldquo;skip&rdquo; path on signup have no lead.
              </p>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

export default AdminBusinessAccountDetailPage;
