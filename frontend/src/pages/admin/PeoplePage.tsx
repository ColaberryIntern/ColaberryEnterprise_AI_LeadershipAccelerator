import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../../utils/api';
import { PageHeader, SectionCard } from '../../components/admin/shell';
import { fromDrilldownUrl } from '../../adminOs/drilldown';

/**
 * People — one row per person, not per record.
 *
 * WHAT THIS PAGE DOES NOT DO. It does not decide who you may see. The roster is
 * scoped server-side by lifecycle stage inside the SQL, so this component
 * renders whatever it is given and cannot widen it. Filtering here would be
 * decoration over data already sent to the browser.
 *
 * It arrives filtered when opened from a KPI: the drill-down contract carries
 * the metric and its filters in the URL, so the roster reproduces exactly the
 * population the tile counted, and Back works.
 */

interface PersonRow {
  email: string;
  name: string | null;
  stage: string;
  enrollmentStatus: string | null;
  tracedToLead: boolean;
  firstSeen: string | null;
  lastSeen: string | null;
}

interface Roster {
  rows: PersonRow[];
  total: number;
  visibleStages: string[];
  limit: number;
  offset: number;
}

const STAGE_LABEL: Record<string, string> = {
  anonymous_visitor: 'Anonymous visitor',
  identified_visitor: 'Identified visitor',
  lead: 'Lead',
  applicant: 'Applicant',
  enrolled_student: 'Enrolled',
  active_learner: 'Active learner',
  graduate: 'Graduate',
  returning_customer: 'Returning customer',
};

export default function PeoplePage() {
  const location = useLocation();

  /**
   * A drill-down arriving from a KPI, read from the URL as the INITIAL state.
   *
   * Deliberately a useState initialiser rather than an effect. An effect would
   * need its dependency list suppressed to run only on mount, and a suppression
   * comment is a note saying "this is wrong but leave it" — whereas an
   * initialiser genuinely runs once and needs no excuse. It also avoids a first
   * render with the wrong filter followed by a correcting one.
   */
  const [untracedOnly, setUntracedOnly] = useState(() => {
    const drilldown = fromDrilldownUrl(location.pathname, location.search);
    if (!drilldown) return false;
    return (
      drilldown.filters.unmatched !== undefined ||
      drilldown.metricKey === 'people.identity_coverage'
    );
  });

  const [roster, setRoster] = useState<Roster | null>(null);
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '50', offset: String(offset) });
      if (search.trim()) params.set('search', search.trim());
      if (untracedOnly) params.set('untraced', 'true');
      const res = await api.get(`/api/admin/people?${params.toString()}`);
      setRoster(res.data);
    } catch (err) {
      // Not an empty roster. "Nobody matches" and "we could not look" are
      // different statements and must not render the same.
      setRoster(null);
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(
        status === 403
          ? 'Your role does not include access to person records.'
          : 'Could not load the roster.',
      );
    } finally {
      setLoading(false);
    }
  }, [search, untracedOnly, offset]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="container-fluid py-4">
      <PageHeader
        title="People"
        subtitle="Everyone we can name, and how far they have come."
      />

      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <input
          className="form-control form-control-sm"
          style={{ maxWidth: 320 }}
          placeholder="Search name or email"
          value={search}
          onChange={(e) => { setOffset(0); setSearch(e.target.value); }}
          aria-label="Search people"
        />
        <div className="form-check ms-2">
          <input
            className="form-check-input"
            type="checkbox"
            id="untraced"
            checked={untracedOnly}
            onChange={(e) => { setOffset(0); setUntracedOnly(e.target.checked); }}
          />
          <label className="form-check-label small" htmlFor="untraced">
            Only people with no acquisition record
          </label>
        </div>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {roster && (
        <>
          <div className="text-muted small mb-2">
            {roster.total.toLocaleString()} {roster.total === 1 ? 'person' : 'people'}
            {' · '}
            {/* The scope is stated, not hidden. A reader seeing a short roster
                should be able to tell whether it is short because of the data or
                because of their own permissions. */}
            showing {roster.visibleStages.map((s) => STAGE_LABEL[s] ?? s).join(', ').toLowerCase()}
          </div>

          <SectionCard title="Roster">
            <div className="table-responsive">
              <table className="table table-sm align-middle mb-0">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Stage</th>
                    <th>Acquisition</th>
                    <th>Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {roster.rows.map((p) => (
                    <tr key={p.email}>
                      <td>{p.name || <span className="text-muted">Unknown</span>}</td>
                      <td className="text-muted small">{p.email}</td>
                      <td>
                        <span className="badge text-bg-light">
                          {STAGE_LABEL[p.stage] ?? p.stage}
                        </span>
                        {p.enrollmentStatus === 'withdrawn' && (
                          <span className="badge text-bg-warning ms-1">Withdrawn</span>
                        )}
                      </td>
                      <td>
                        {p.tracedToLead ? (
                          <span className="text-muted small">Traced</span>
                        ) : (
                          // Stated on the row, because it is a fact about this
                          // person: we do not know where they came from.
                          <span className="text-warning small">No record</span>
                        )}
                      </td>
                      <td className="text-muted small">
                        {p.lastSeen ? new Date(p.lastSeen).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                  {roster.rows.length === 0 && !loading && (
                    <tr>
                      <td colSpan={5} className="text-muted text-center py-4">
                        Nobody matches these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <div className="d-flex justify-content-between align-items-center mt-3">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - roster.limit))}
            >
              Previous
            </button>
            <span className="text-muted small">
              {roster.total === 0
                ? '—'
                : `${offset + 1}–${Math.min(offset + roster.limit, roster.total)} of ${roster.total.toLocaleString()}`}
            </span>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              disabled={offset + roster.limit >= roster.total}
              onClick={() => setOffset(offset + roster.limit)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
