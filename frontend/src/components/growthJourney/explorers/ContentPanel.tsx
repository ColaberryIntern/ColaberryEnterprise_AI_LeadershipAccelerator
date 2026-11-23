import React, { useMemo, useState } from 'react';
import SectionCard from '../../admin/shell/SectionCard';
import StatCard from '../../admin/shell/StatCard';
import StatusBadge from '../../admin/shell/StatusBadge';
import { Matrix } from '../../explorerGrowth/ContentTab';
import ScopeState from './ScopeState';
import { useGrowthJourneyData } from '../useGrowthJourneyData';
import { getExplorerContent } from '../../../services/growthJourneyExplorerApi';

/**
 * What may be said: the content registry's health, brand-scoped.
 *
 * ─── THE READ PANELS ONLY. THE WRITES ARE DEFERRED. ─────────────────────────
 *
 * Explorer's `ContentTab` is 420 lines, and about 230 of them are the knowledge
 * UPLOAD panel and the review queue - both writes. The contract defers every
 * Explorer write: "they stay reachable nowhere in this build". So this carries
 * the four read panels (totals, the named gaps, the stage x audience matrix and
 * coverage by purpose) and neither renders nor imports the two write panels.
 *
 * `Matrix` is Explorer's and pure, so the cross-tab that explains a gap comes
 * from one definition. The rest is re-created, because Explorer's tab fetches
 * from its unscoped client.
 *
 * ─── THE DATE SCOPES ONE PANEL, AND SAYS SO ─────────────────────────────────
 *
 * `contentQuerySchema` accepts `date`, but the backend threads it only into the
 * decision-gap query. The asset totals, the matrix and the coverage table are a
 * snapshot of the registry NOW and have no run to be "as of". A control labelled
 * "date" above all four panels would be read as filtering all four, so the label
 * names what it actually does. Scoping the asset queries by run date would be a
 * lie of a different kind: assets do not belong to a run.
 */

interface Props {
  brandId: string | null;
  brandName: string | null;
}

export default function ContentPanel({ brandId, brandName }: Props) {
  const [date, setDate] = useState('');
  const query = useMemo(() => (date ? { date } : {}), [date]);

  const health = useGrowthJourneyData(
    () => getExplorerContent(brandId, query),
    `explorer-content:${brandId ?? 'all'}:${JSON.stringify(query)}`
  );

  return (
    <SectionCard title="What may be said" icon="book-open-line">
      <ScopeState
        state={health}
        brandSelected={brandId !== null}
        brandName={brandName}
        onRetry={health.reload}
      >
      {(h) => (
        <div className="row g-3">
          <div className="col-12">
            <div className="d-flex gap-2 flex-wrap align-items-center">
              <label className="form-label small mb-0" htmlFor="gj-content-gap-date">
                Gap panel — run of
              </label>
              <input
                id="gj-content-gap-date"
                type="date"
                className="form-control form-control-sm"
                style={{ maxWidth: 170 }}
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Decision run date for the gap panel"
              />
              {date && (
                <button
                  type="button"
                  className="btn btn-sm btn-link text-decoration-none"
                  onClick={() => setDate('')}
                >
                  Latest run
                </button>
              )}
              <span className="text-muted small">
                Totals, matrix and coverage below describe the registry as it is now, not a run.
              </span>
            </div>
          </div>

          <div className="col-12">
            <div className="row g-3">
              <div className="col-6 col-lg-3">
                <StatCard
                  label="Assets"
                  value={h.total.toLocaleString()}
                  icon="book-open-line"
                  tone="primary"
                />
              </div>
              <div className="col-6 col-lg-3">
                <StatCard
                  label="Active"
                  value={h.active.toLocaleString()}
                  icon="checkbox-circle-line"
                  tone="success"
                />
              </div>
              <div className="col-6 col-lg-3">
                <StatCard
                  label="Emailable"
                  value={h.emailable.toLocaleString()}
                  icon="mail-send-line"
                  tone="info"
                />
              </div>
              <div className="col-6 col-lg-3">
                <StatCard
                  label="Decisions with a gap"
                  value={h.decision_gaps.gap_count.toLocaleString()}
                  icon="error-warning-line"
                  tone={h.decision_gaps.gap_count > 0 ? 'warning' : 'neutral'}
                  hint={h.decision_gaps.decision_date ?? undefined}
                />
              </div>
            </div>
          </div>

          {h.decision_gaps.gap_count > 0 && (
            <div className="col-12">
              <SectionCard title="What the Governor could not find" icon="search-eye-line">
                <p className="small mb-2">
                  <strong>{h.decision_gaps.gap_count}</strong> decision
                  {h.decision_gaps.gap_count === 1 ? '' : 's'} on{' '}
                  {h.decision_gaps.decision_date ?? 'the latest run'} selected an action and had
                  nothing to carry. The Governor named the gap itself:
                </p>
                <ul className="list-unstyled mb-2">
                  {h.decision_gaps.named.map((g) => (
                    <li key={g} className="font-monospace small">
                      <i className="ri-arrow-right-s-line" aria-hidden="true" />
                      {g}
                    </li>
                  ))}
                </ul>
                <div className="alert alert-info py-2 px-3 small mb-0">
                  Before treating this as missing content, read the matrix below. A gap can mean
                  the content exists but the learner&rsquo;s tier cannot see it.
                </div>
              </SectionCard>
            </div>
          )}

          <div className="col-12 col-xl-6">
            <SectionCard
              title="Stage × audience"
              icon="grid-line"
              subtitle="Who can actually receive what — the cross-tab that explains the gap above."
            >
              <Matrix matrix={h.matrix} />
            </SectionCard>
          </div>

          <div className="col-12 col-xl-6">
            <SectionCard
              title="Coverage by purpose"
              icon="focus-3-line"
              subtitle="What each kind of message has to draw on."
            >
              <div className="table-responsive">
                <table className="table table-sm mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>Purpose</th>
                      <th className="text-end">Free</th>
                      <th className="text-end">Full</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {h.purposes.map((p) => (
                      <tr key={p.purpose}>
                        <td>
                          <div className="small">{p.purpose.replace(/_/g, ' ')}</div>
                          {p.pinned_stages && (
                            <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                              pinned to {p.pinned_stages.join(', ')}
                            </div>
                          )}
                        </td>
                        <td className="text-end">{p.supported ? p.free_preview : '—'}</td>
                        <td className="text-end">{p.supported ? p.full_access : '—'}</td>
                        <td>
                          {p.supported ? (
                            <StatusBadge label="supported" tone="success" />
                          ) : (
                            <StatusBadge label="declared gap" tone="warning" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* A declared gap is a decision with a reason, not an oversight.
                  Showing the reason is the difference between "someone chose
                  this" and "someone forgot". */}
              {h.purposes.some((p) => !p.supported) && (
                <div className="mt-3">
                  <div className="text-uppercase text-muted small mb-2">
                    Why those are declared gaps
                  </div>
                  {h.purposes
                    .filter((p) => !p.supported && p.declared_gap_reason)
                    .map((p) => (
                      <div key={p.purpose} className="mb-2">
                        <div className="fw-semibold small">{p.purpose.replace(/_/g, ' ')}</div>
                        <div className="text-muted small">{p.declared_gap_reason}</div>
                      </div>
                    ))}
                </div>
              )}
            </SectionCard>
          </div>
        </div>
        )}
      </ScopeState>
    </SectionCard>
  );
}
