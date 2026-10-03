import React from 'react';
import AsyncPanel from '../explorerGrowth/AsyncPanel';
import { useGrowthJourneyData } from './useGrowthJourneyData';
import { listControls, clearPause, clearRollout } from '../../services/growthJourneyControlsApi';
import type { ControlRow } from '../../services/growthJourneyControlsApi';
import { safeText } from './journeyText';
import { JourneyEmpty } from './journeyPaging';
import PauseForm from './PauseForm';
import RolloutForm from './RolloutForm';

/**
 * The active controls, and the two forms that write them (Phase 6, T615).
 *
 * ── THIS READ HAS ITS OWN ENVELOPE, AND ASSUMING OTHERWISE WOULD BE SILENT ──
 *
 * `{ controls, count }`. Not `{ rows, total, limit, offset }` like the nine inspect
 * reads, and not a flat object like the status reads - a THIRD family on one
 * surface. A component written against `rows` renders an empty table here and looks
 * exactly like a working screen on a system with no controls, which is the worst
 * failure available: the operator concludes nothing is paused when they cannot see
 * whether anything is.
 *
 * `count` is `controls.length`, NOT a database total, and there is no `offset`. The
 * read is capped at 500 rows and cannot be paged past it, so the footer the other
 * tabs use would be lying here and is deliberately absent.
 *
 * ── A CLEAR DOES NOT UNDO ───────────────────────────────────────────────────
 *
 * Clearing a pause lets the scope resume; it does not retract whatever happened
 * while the pause was absent, and clearing a rollout does not unsend anything the
 * rollout permitted. The caption says so, because "clear" reads like "undo" and the
 * difference matters to someone deciding whether to clear in a hurry.
 *
 * A second clear is a 200 `already_cleared` with no second write, so a double-click
 * is harmless by the backend's design rather than by a guard here.
 */

interface Props {
  brandId?: string;
  programId?: string;
  unseeded?: boolean;
}

export default function ControlsTab({ brandId, programId, unseeded }: Props) {
  const controls = useGrowthJourneyData(
    () => listControls({ brand_id: brandId || undefined }),
    `controls:${brandId ?? ''}`,
  );

  const clear = async (row: ControlRow) => {
    try {
      if (row.kind === 'pause') await clearPause(row.id);
      else await clearRollout(row.id);
    } finally {
      // Reload either way: a failed clear leaves the row in force, and the table is
      // the only honest answer about what is actually active.
      controls.reload();
    }
  };

  return (
    <section>
      <h2 className="h5 mb-3">Pauses and rollouts</h2>

      <AsyncPanel state={controls} onRetry={controls.reload}>
        {(data) => (
          data.controls.length === 0 ? (
            <JourneyEmpty
              noun="active controls"
              unseeded={unseeded}
              hint="No pause and no rollout is in force, so every scope sits at whatever the flags make it."
            />
          ) : (
            <div className="card border-0 shadow-sm mb-4">
              <div className="card-header bg-white d-flex justify-content-between align-items-center flex-wrap gap-2">
                <span className="fw-semibold">Active controls</span>
                <span className="small text-muted">
                  {data.count} returned (this read is capped and not paged)
                </span>
              </div>
              <div className="card-body">
                <div className="table-responsive">
                  <table className="table table-hover mb-0 align-middle">
                    <caption className="small text-muted">
                      A pause lowers a scope to <code>off</code>; a rollout raises one to
                      <code className="mx-1">review</code> or <code>limited</code>.
                      Clearing a control lets the scope resume — it does not undo what
                      happened while the control was in force.
                    </caption>
                    <thead className="table-light">
                      <tr>
                        <th scope="col">Kind</th>
                        <th scope="col">Scope</th>
                        <th scope="col">Mode</th>
                        <th scope="col">Cohort</th>
                        <th scope="col">Reason</th>
                        <th scope="col">Since</th>
                        <th scope="col"><span className="visually-hidden">Clear</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.controls.map((row) => (
                        <tr key={row.id}>
                          <th scope="row" className="fw-normal">
                            <span className={`badge ${row.kind === 'pause' ? 'bg-secondary' : 'bg-info text-dark'}`}>
                              {safeText(row.kind)}
                            </span>
                          </th>
                          <td className="text-break"><code>{safeText(row.scope_key)}</code></td>
                          <td><code>{safeText(row.mode)}</code></td>
                          <td>
                            {row.cohort_lead_ids === null
                              ? <span className="text-muted">not a cohort</span>
                              : (
                                <>
                                  {row.cohort_lead_ids.length} lead
                                  {row.cohort_lead_ids.length === 1 ? '' : 's'}
                                  {row.daily_limit !== null && (
                                    <span className="small text-muted d-block">
                                      {row.daily_limit}/day
                                    </span>
                                  )}
                                </>
                              )}
                          </td>
                          {/* Free text, operator-written, echoed RAW by the API - this
                              route is on T612's privacy allowlist for exactly that. */}
                          <td className="text-break">{safeText(row.reason)}</td>
                          <td><span className="small text-muted">{safeText(row.created_at)}</span></td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-outline-secondary btn-sm"
                              onClick={() => clear(row)}
                            >
                              Clear
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )
        )}
      </AsyncPanel>

      <div className="row g-3">
        <div className="col-lg-6">
          <PauseForm brandId={brandId} programId={programId} onWritten={controls.reload} />
        </div>
        <div className="col-lg-6">
          <RolloutForm brandId={brandId} programId={programId} onWritten={controls.reload} />
        </div>
      </div>
    </section>
  );
}
