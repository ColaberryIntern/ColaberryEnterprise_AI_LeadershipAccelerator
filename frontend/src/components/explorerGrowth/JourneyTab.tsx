import React, { useMemo, useState } from 'react';
import SectionCard from '../admin/shell/SectionCard';
import StatusBadge from '../admin/shell/StatusBadge';
import AsyncPanel from './AsyncPanel';
import LearnerDrawer from './LearnerDrawer';
import { useExplorerData } from './useExplorerData';
import {
  getLearners,
  PRIMARY_STATE_ORDER,
  type ExplorerLearnerRow,
  type ExplorerOverlay,
  type ExplorerPrimaryState,
  type LearnersQuery,
} from '../../services/explorerGrowthApi';

/**
 * Journey — the roster, filtered and paged.
 *
 * Filters map one-to-one onto the query parameters the API already validates,
 * so an out-of-range value comes back as a 400 naming the field rather than
 * being silently clamped here. Clamping in the UI would answer a different
 * question than the one typed.
 */

const OVERLAYS: ExplorerOverlay[] = [
  'DORMANT',
  'HIGH_INTENT',
  'FRICTION',
  'NEEDS_SUPPORT',
  'EVENT_READY',
  'EVENT_REGISTERED',
  'EVENT_ATTENDED',
  'EVENT_NO_SHOW',
  'INTERNSHIP_READY',
  'SUBSCRIPTION_READY',
  'REFERRAL_READY',
  'IN_CONVERSATION',
];

const PAGE = 50;

function Score({ label, value }: { label: string; value: number | null }) {
  return (
    <span className="d-inline-block me-2 text-nowrap" title={label}>
      <span className="text-muted small">{label}</span>{' '}
      <span className="fw-semibold">{value ?? '—'}</span>
    </span>
  );
}

export default function JourneyTab() {
  const [state, setState] = useState<ExplorerPrimaryState | ''>('');
  const [overlay, setOverlay] = useState<ExplorerOverlay | ''>('');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<ExplorerLearnerRow | null>(null);

  const query: LearnersQuery = useMemo(
    () => ({
      ...(state ? { state } : {}),
      ...(overlay ? { overlay } : {}),
      ...(applied ? { search: applied } : {}),
      limit: PAGE,
      offset,
    }),
    [state, overlay, applied, offset],
  );

  const page = useExplorerData(() => getLearners(query), JSON.stringify(query));

  const reset = (fn: () => void) => {
    fn();
    setOffset(0); // a new filter starts at page 1, not wherever the old one ended
  };

  return (
    <>
      <SectionCard title="Learners" icon="group-line" padded={false}>
        <div className="d-flex gap-2 p-3 flex-wrap align-items-center border-bottom">
          <select
            className="form-select form-select-sm"
            style={{ maxWidth: 220 }}
            value={state}
            onChange={(e) => reset(() => setState(e.target.value as ExplorerPrimaryState | ''))}
            aria-label="Filter by state"
          >
            <option value="">All states</option>
            {PRIMARY_STATE_ORDER.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </select>

          <select
            className="form-select form-select-sm"
            style={{ maxWidth: 220 }}
            value={overlay}
            onChange={(e) => reset(() => setOverlay(e.target.value as ExplorerOverlay | ''))}
            aria-label="Filter by overlay"
          >
            <option value="">All overlays</option>
            {OVERLAYS.map((o) => (
              <option key={o} value={o}>
                {o.replace(/_/g, ' ')}
              </option>
            ))}
          </select>

          <form
            className="d-flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              reset(() => setApplied(search.trim()));
            }}
          >
            <input
              className="form-control form-control-sm"
              style={{ maxWidth: 240 }}
              placeholder="Search email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search by email"
            />
            <button type="submit" className="btn btn-sm btn-outline-primary">
              Search
            </button>
          </form>

          {(state || overlay || applied) && (
            <button
              type="button"
              className="btn btn-sm btn-link text-decoration-none"
              onClick={() =>
                reset(() => {
                  setState('');
                  setOverlay('');
                  setSearch('');
                  setApplied('');
                })
              }
            >
              Clear
            </button>
          )}

          <div className="ms-auto text-muted small">
            {page.data && (
              // "50 of 153", never a bare 50 — a page that reports only what
              // fits on it implies the filter matched that much.
              <>
                Showing <strong>{page.data.rows.length}</strong> of{' '}
                <strong>{page.data.total.toLocaleString()}</strong>
              </>
            )}
          </div>
        </div>

        <AsyncPanel
          state={page}
          isEmpty={(p) => p.rows.length === 0}
          emptyMessage="No learners match this filter."
          emptyHint="The request succeeded — this is an empty result, not a failure."
          onRetry={page.reload}
        >
          {(p) => (
            <>
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Learner</th>
                      <th>State</th>
                      <th>Overlays</th>
                      <th className="text-nowrap">E / I / F</th>
                      <th className="text-end text-nowrap">Idle (days)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.rows.map((r) => (
                      <tr
                        key={r.enrollment_id}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setOpen(r)}
                      >
                        <td>
                          <div className="fw-semibold">{r.email_normalized}</div>
                          <div className="text-muted small font-monospace">
                            {r.enrollment_id.slice(0, 8)}…
                          </div>
                        </td>
                        <td>
                          {r.primary_state ? (
                            <StatusBadge label={r.primary_state.replace(/_/g, ' ')} tone="info" />
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td>
                          {r.overlays.length === 0 ? (
                            <span className="text-muted small">none</span>
                          ) : (
                            <div className="d-flex flex-wrap gap-1">
                              {r.overlays.map((o) => (
                                <StatusBadge
                                  key={o}
                                  label={o.replace(/_/g, ' ')}
                                  tone={o === 'FRICTION' || o === 'DORMANT' ? 'warning' : 'neutral'}
                                />
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="text-nowrap">
                          <Score label="E" value={r.e_score} />
                          <Score label="I" value={r.i_score} />
                          <Score label="F" value={r.f_score} />
                        </td>
                        <td className="text-end">
                          {r.days_since_last_activity ?? <span className="text-muted">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="d-flex justify-content-between align-items-center p-3 border-top">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  disabled={offset === 0}
                  onClick={() => setOffset(Math.max(0, offset - PAGE))}
                >
                  <i className="ri-arrow-left-line me-1" aria-hidden="true" />
                  Previous
                </button>
                <span className="text-muted small">
                  {offset + 1}–{Math.min(offset + p.rows.length, p.total)} of {p.total}
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  disabled={offset + PAGE >= p.total}
                  onClick={() => setOffset(offset + PAGE)}
                >
                  Next
                  <i className="ri-arrow-right-line ms-1" aria-hidden="true" />
                </button>
              </div>
            </>
          )}
        </AsyncPanel>
      </SectionCard>

      {open && (
        <LearnerDrawer
          enrollmentId={open.enrollment_id}
          email={open.email_normalized}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}
