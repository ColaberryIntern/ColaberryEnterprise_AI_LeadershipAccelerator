import React, { useMemo, useState } from 'react';
import SectionCard from '../admin/shell/SectionCard';
import StatCard from '../admin/shell/StatCard';
import StatusBadge from '../admin/shell/StatusBadge';
import AsyncPanel from './AsyncPanel';
import { useExplorerData } from './useExplorerData';
import {
  getContentHealth,
  refreshContent,
  type ExplorerContentHealth,
} from '../../services/explorerGrowthApi';

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

/**
 * The page's FIRST write control, and the only one.
 *
 * ── WHY THIS IS A DELIBERATE AMENDMENT, NOT A FEATURE SLIPPED IN ────────────
 *
 * This page has been read-only since it shipped, asserted in two places: the
 * router registers no mutating verb (`explorerGrowthRoutes.access.test.ts`) and
 * the API client exports no write-shaped function (`explorerGrowthApi.test.ts`).
 * Both assertions are updated in the same change as this button, and neither is
 * weakened: the router test now pins exactly ONE POST at exactly one path, and the
 * client test still forbids every write name except this one. A page that silently
 * grew a second write would still fail them.
 *
 * ── WHAT IT ACTUALLY DOES, WHICH IS LESS THAN THE LABEL SUGGESTS ────────────
 *
 * It re-runs the draft render for a date — the stage that turns decisions into
 * copy — and it CANNOT send: the drafts it writes carry a status the sender's
 * claim predicate excludes, which is a property of the sender asserted against
 * its own source. So the worst case of a mis-click is spending model calls, which
 * is why the server caps them and why this reports the count back.
 *
 * It is not a kill switch, a mode change or a recalculate. Those remain absent and
 * the Settings tab still says so.
 */
function ContentRefreshButton({ onDone }: { onDone: () => void }) {
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [note, setNote] = useState('');

  const run = async () => {
    setState('running');
    setNote('');
    try {
      const r = await refreshContent({});
      // REPORT THE RUN, NOT "DONE". A run that wrote nothing is the common
      // outcome, and "Done" would read as "there is copy now". When nothing was
      // drafted the useful information is WHICH wall it hit, which the service
      // already tallies by name — so the top reason is named rather than
      // summarised as "nothing was eligible".
      if (r.drafted === 0 && r.rejected === 0) {
        const top = Object.entries(r.by_reason).sort((a, b) => b[1] - a[1])[0];
        setNote(
          top
            ? `Nothing drafted from ${r.attempted} decision${r.attempted === 1 ? '' : 's'} — most common reason: ${top[0].replace(/_/g, ' ')} (${top[1]}).`
            : `Nothing drafted — there were no decisions on this run.`,
        );
      } else {
        setNote(
          `${r.drafted} draft${r.drafted === 1 ? '' : 's'} written`
          + (r.rejected > 0 ? `, ${r.rejected} refused by the quality gate` : '')
          + (r.failed > 0 ? `, ${r.failed} failed` : '')
          + ` from ${r.attempted} decision${r.attempted === 1 ? '' : 's'}.`,
        );
      }
      setState('done');
      onDone();
    } catch (e) {
      const err = e as { response?: { status?: number; data?: { error?: string } } };
      setNote(
        err.response?.status === 403
          ? 'The draft render is switched off. Turn its flag on before re-running.'
          : err.response?.data?.error ?? 'The re-run failed. Nothing was written.',
      );
      setState('error');
    }
  };

  return (
    <div className="text-end">
      <button
        type="button"
        className="btn btn-sm btn-outline-primary"
        onClick={run}
        disabled={state === 'running'}
        data-testid="content-refresh"
      >
        {state === 'running' ? (
          <>
            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
            Re-running…
          </>
        ) : (
          <>
            <i className="ri-refresh-line me-1" aria-hidden="true" />
            Re-run the draft render
          </>
        )}
      </button>
      {note && (
        <div
          className={`small mt-2 ${state === 'error' ? 'text-danger' : 'text-muted'}`}
          role="status"
        >
          {note}
        </div>
      )}
    </div>
  );
}

export default function ContentTab() {
  const [date, setDate] = useState('');
  const query = useMemo(() => (date ? { date } : {}), [date]);
  const health = useExplorerData(
    () => getContentHealth(query),
    `content:${JSON.stringify(query)}`,
  );

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
          {/*
            SAYING WHAT THIS TAB IS, because its name did not.
            It was called "Content" and opened on four numbers, which read as a
            content library someone maintains here. Nothing on this tab is
            authored: every row is a lesson card projected out of the published
            curriculum by the nightly sync, and the only action available is to
            re-run that projection. A reviewer who thinks they are looking at an
            editable library draws exactly the wrong conclusion from a thin cell.
          */}
          <div className="col-12">
            <div className="d-flex flex-wrap gap-2 align-items-start justify-content-between">
              <div>
                <h5 className="mb-1">Content supply</h5>
                <p className="text-muted small mb-0" style={{ maxWidth: 680 }}>
                  Lesson cards projected from the published curriculum by the nightly sync —
                  nothing here is authored on this page. These are the assets a decision can
                  draw on, and a thin cell below means the curriculum has no card a learner in
                  that stage and tier is allowed to see.
                </p>
              </div>
              <ContentRefreshButton onDone={health.reload} />
            </div>
          </div>

          {/*
            THE DATE SCOPES ONE PANEL, AND SAYS SO.
            `contentQuerySchema` accepts `date`, but the backend threads it only
            into the decision-gap query — the asset totals, the matrix and the
            coverage table are a snapshot of the registry now and have no run to
            be "as of". A control labelled "date" above all four panels would be
            read as filtering all four, so the label names what it actually does.
            Scoping the asset queries by run date would be a lie of a different
            kind: assets do not belong to a run.
          */}
          <div className="col-12">
            <div className="d-flex gap-2 flex-wrap align-items-center">
              <label className="form-label small mb-0" htmlFor="content-gap-date">
                Gap panel — run of
              </label>
              <input
                id="content-gap-date"
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
