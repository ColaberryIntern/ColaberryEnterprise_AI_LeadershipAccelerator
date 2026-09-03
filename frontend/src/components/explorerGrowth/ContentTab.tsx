import React from 'react';
import SectionCard from '../admin/shell/SectionCard';
import StatCard from '../admin/shell/StatCard';
import StatusBadge from '../admin/shell/StatusBadge';
import AsyncPanel from './AsyncPanel';
import { useExplorerData } from './useExplorerData';
import { getContentHealth, type ExplorerContentHealth } from '../../services/explorerGrowthApi';

/**
 * Content — the registry, and the gaps it explains.
 *
 * ── THE COUNT ALONE IS MISLEADING, WHICH IS WHY THE MATRIX IS HERE ──────────
 *
 * "646 assets" reads healthy. What it hides, measured on production: every one
 * of the 206 learning-stage assets is `full_access`, and the catalogue's only
 * free-preview content is 23 activation assets. **A free-tier learner past week
 * 0 therefore has an empty candidate set by construction** — not because
 * content is missing, but because none of it is theirs to see.
 *
 * That is why 12 decisions reported a gap on 2026-09-02 and zero did on 08-31:
 * the entitlement filter shipped on 09-01 and is working exactly as designed.
 * It is a decision about what the free tier should include, not a bug — and the
 * cross-tab is what makes that legible instead of alarming.
 */

/** Stage order matches the learner's progression, not the alphabet. */
const STAGE_ORDER = ['activation', 'learning', 'evergreen'];

/** Exported so the cross-tab can be asserted directly with renderToStaticMarkup. */
export function Matrix({ matrix }: { matrix: ExplorerContentHealth['matrix'] }) {
  const stages = STAGE_ORDER.filter((s) => matrix.some((m) => m.stage === s));
  const audiences = Array.from(new Set(matrix.map((m) => m.audience))).sort();
  const at = (stage: string, audience: string) =>
    matrix.find((m) => m.stage === stage && m.audience === audience)?.count ?? 0;

  return (
    <>
      <div className="table-responsive">
        <table className="table table-sm table-bordered mb-2">
          <thead className="table-light">
            <tr>
              <th>Stage</th>
              {audiences.map((a) => (
                <th key={a} className="text-end">
                  {a.replace(/_/g, ' ')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stages.map((s) => (
              <tr key={s}>
                <td className="fw-semibold">{s}</td>
                {audiences.map((a) => {
                  const n = at(s, a);
                  return (
                    <td key={a} className={`text-end${n === 0 ? ' table-warning' : ''}`}>
                      {n === 0 ? (
                        <span title="No asset a learner in this stage and tier could receive">
                          0
                        </span>
                      ) : (
                        n.toLocaleString()
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="form-text">
        Each cell is &ldquo;assets a learner in this stage and tier could receive&rdquo;.{' '}
        <strong>Do not add the cells up</strong> — an asset carrying both audience tags is counted
        in both columns, so the total exceeds the real asset count. The totals are above.
      </div>
    </>
  );
}

export default function ContentTab() {
  const health = useExplorerData(() => getContentHealth({}), 'content');

  return (
    <AsyncPanel
      state={health}
      isEmpty={(h) => h.total === 0}
      emptyMessage="The content registry is empty."
      emptyHint="The nightly sync projects published curriculum into it. If it has never run, nothing here is wrong — there is simply nothing yet."
      onRetry={health.reload}
    >
      {(h) => (
        <div className="row g-3">
          <div className="col-12">
            <div className="row g-3">
              <div className="col-6 col-lg-3">
                <StatCard label="Assets" value={h.total.toLocaleString()} icon="book-open-line" tone="primary" />
              </div>
              <div className="col-6 col-lg-3">
                <StatCard label="Active" value={h.active.toLocaleString()} icon="checkbox-circle-line" tone="success" />
              </div>
              <div className="col-6 col-lg-3">
                <StatCard label="Emailable" value={h.emailable.toLocaleString()} icon="mail-send-line" tone="info" />
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
                  Before treating this as missing content, read the matrix below. A gap can mean the
                  content exists but the learner&rsquo;s tier cannot see it.
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
                      <th></th>
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
                  <div className="text-uppercase text-muted small mb-2">Why those are declared gaps</div>
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
    </AsyncPanel>
  );
}
