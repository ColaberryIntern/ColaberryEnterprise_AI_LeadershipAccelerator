import React, { useState } from 'react';
import StatusBadge from '../admin/shell/StatusBadge';
import AsyncPanel from './AsyncPanel';
import SignalTimeline from './SignalTimeline';
import DecisionWhyModal from './DecisionWhyModal';
import { useExplorerData } from './useExplorerData';
import {
  getEligibility,
  getLearner,
  getLearnerDecisions,
  getLearnerSignals,
} from '../../services/explorerGrowthApi';

/**
 * LearnerDrawer — one learner, in detail.
 *
 * Addressed by `enrollment_id`, a UUID, and never by email. The address appears
 * in the body because an operator needs to recognise who they are looking at;
 * it must not become part of how the record is fetched or logged.
 */

interface Props {
  enrollmentId: string;
  email: string;
  onClose: () => void;
}

export default function LearnerDrawer({ enrollmentId, email, onClose }: Props) {
  const profile = useExplorerData(() => getLearner(enrollmentId), `learner:${enrollmentId}`);
  const signals = useExplorerData(() => getLearnerSignals(enrollmentId, 90), `signals:${enrollmentId}`);
  const decisions = useExplorerData(
    () => getLearnerDecisions(enrollmentId, { limit: 50, offset: 0 }),
    `learnerDecisions:${enrollmentId}`,
  );
  const eligibility = useExplorerData(() => getEligibility(enrollmentId), `eligibility:${enrollmentId}`);
  const [why, setWhy] = useState<string | null>(null);

  return (
    <>
      <div
        className="modal show d-block"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        role="dialog"
        aria-modal="true"
        aria-label={`Learner detail`}
        onClick={onClose}
      >
        <div
          className="modal-dialog modal-xl modal-dialog-scrollable"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-content">
            <div className="modal-header">
              <div>
                <h5 className="modal-title">{email}</h5>
                <div className="text-muted small font-monospace">{enrollmentId}</div>
              </div>
              <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
            </div>

            <div className="modal-body">
              <div className="row g-3">
                <div className="col-12 col-lg-5">
                  <h6 className="text-uppercase text-muted small mb-2">Profile</h6>
                  <AsyncPanel state={profile} onRetry={profile.reload}>
                    {(p) => (
                      <table className="table table-sm mb-0">
                        <tbody>
                          <tr>
                            <td className="text-muted">State</td>
                            <td>
                              {p.primary_state ? (
                                <StatusBadge label={p.primary_state.replace(/_/g, ' ')} tone="info" />
                              ) : (
                                '—'
                              )}
                            </td>
                          </tr>
                          <tr>
                            <td className="text-muted">Overlays</td>
                            <td>
                              {p.overlays.length === 0 ? (
                                <span className="text-muted small">none</span>
                              ) : (
                                <div className="d-flex flex-wrap gap-1">
                                  {p.overlays.map((o) => (
                                    <StatusBadge key={o} label={o.replace(/_/g, ' ')} tone="neutral" />
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                          <tr>
                            <td className="text-muted">E / I / F</td>
                            <td className="fw-semibold">
                              {p.e_score ?? '—'} / {p.i_score ?? '—'} / {p.f_score ?? '—'}
                            </td>
                          </tr>
                          <tr>
                            <td className="text-muted">Idle</td>
                            <td>
                              {p.days_since_last_activity === null
                                ? '—'
                                : `${p.days_since_last_activity} days`}
                            </td>
                          </tr>
                          <tr>
                            <td className="text-muted">In state since</td>
                            <td>{p.state_entered_at ?? '—'}</td>
                          </tr>
                        </tbody>
                      </table>
                    )}
                  </AsyncPanel>

                  <h6 className="text-uppercase text-muted small mt-4 mb-2">Contactability</h6>
                  <AsyncPanel state={eligibility} onRetry={eligibility.reload}>
                    {(e) => (
                      <>
                        {e.contactability ? (
                          <div className="d-flex flex-wrap gap-2 mb-2">
                            {Object.entries(e.contactability)
                              .filter(([, v]) => v && typeof v === 'object' && 'eligible' in (v as object))
                              .map(([channel, v]) => {
                                const val = v as { eligible: boolean; reason?: string };
                                return (
                                  <StatusBadge
                                    key={channel}
                                    label={`${channel}${val.reason ? `: ${val.reason}` : ''}`}
                                    tone={val.eligible ? 'success' : 'neutral'}
                                  />
                                );
                              })}
                          </div>
                        ) : (
                          <div className="text-muted small">No contactability recorded.</div>
                        )}
                        {e.note && <div className="text-muted small">{e.note}</div>}
                        {e.as_of_decision_date && (
                          <div className="form-text">
                            As resolved on {e.as_of_decision_date} — read from that decision, not
                            re-evaluated now.
                          </div>
                        )}
                      </>
                    )}
                  </AsyncPanel>
                </div>

                <div className="col-12 col-lg-7">
                  <h6 className="text-uppercase text-muted small mb-2">Signals</h6>
                  <AsyncPanel state={signals} onRetry={signals.reload}>
                    {(s) => <SignalTimeline signals={s} />}
                  </AsyncPanel>

                  <h6 className="text-uppercase text-muted small mt-4 mb-2">Decision history</h6>
                  <AsyncPanel
                    state={decisions}
                    isEmpty={(d) => d.rows.length === 0}
                    emptyMessage="No decision has been recorded for this learner."
                    onRetry={decisions.reload}
                  >
                    {(d) => (
                      <div className="table-responsive">
                        <table className="table table-sm table-hover mb-0">
                          <thead className="table-light">
                            <tr>
                              <th>Date</th>
                              <th>Action</th>
                              <th className="text-end">Why</th>
                            </tr>
                          </thead>
                          <tbody>
                            {d.rows.map((r) => (
                              <tr key={r.id}>
                                <td className="text-nowrap">{r.decision_date}</td>
                                <td>
                                  <StatusBadge
                                    label={r.selected_action ?? '—'}
                                    tone={r.selected_action === 'WAIT' ? 'neutral' : 'info'}
                                  />
                                </td>
                                <td className="text-end">
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-primary"
                                    onClick={() => setWhy(r.id)}
                                  >
                                    Why?{' '}
                                    {r.suppressed_count > 0 && (
                                      <span className="badge bg-secondary ms-1">
                                        {r.suppressed_count}
                                      </span>
                                    )}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="form-text">
                          Showing {d.rows.length} of {d.total}.
                        </div>
                      </div>
                    )}
                  </AsyncPanel>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {why && <DecisionWhyModal decisionId={why} onClose={() => setWhy(null)} />}
    </>
  );
}
