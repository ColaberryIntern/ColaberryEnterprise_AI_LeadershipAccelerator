import React, { useState } from 'react';
import StatusBadge from '../../admin/shell/StatusBadge';
import SignalTimeline from '../../explorerGrowth/SignalTimeline';
import BuyingSignalsCard from '../../explorerGrowth/BuyingSignalsCard';
import LearnerName from '../../explorerGrowth/LearnerName';
import ScopeState from './ScopeState';
import WhyModal from './WhyModal';
import { useGrowthJourneyData } from '../useGrowthJourneyData';
import {
  getExplorerEligibility,
  getExplorerLearner,
  getExplorerLearnerDecisions,
  getExplorerLearnerSignals,
} from '../../../services/growthJourneyExplorerApi';

/**
 * One learner, in detail, brand-scoped.
 *
 * Addressed by `enrollment_id`, a UUID, and never by email. The address appears
 * in the body because an operator needs to recognise who they are looking at; it
 * must not become part of how the record is fetched or logged. Explorer's own
 * drawer says the same thing and it still holds here.
 *
 * ─── FOUR READS, FOUR SCOPE WRAPPERS, ON PURPOSE ────────────────────────────
 *
 * Profile, contactability, signals and decision history are four separate
 * requests, each with its own `ScopeState`, so one slow or refused read never
 * blanks the other three. That is the same reason Explorer's drawer gives four
 * `AsyncPanel`s rather than one.
 *
 * It also means a 403 shows four copies of the configuration notice rather than
 * one. That is accepted rather than worked around: collapsing them would need a
 * drawer-level scope decision taken before any read returns, and a wrapper that
 * guessed would be the thing that renders another brand's learner.
 *
 * `SignalTimeline`, `BuyingSignalsCard` and `LearnerName` are Explorer's and are
 * pure, so they are imported unchanged. Only the fetching is re-created.
 */

interface Props {
  brandId: string | null;
  brandName: string | null;
  enrollmentId: string;
  email: string;
  onClose: () => void;
}

export default function LearnerDrawer({
  brandId,
  brandName,
  enrollmentId,
  email,
  onClose,
}: Props) {
  const scope = { brandSelected: brandId !== null, brandName };
  const key = `${brandId ?? 'all'}:${enrollmentId}`;

  const profile = useGrowthJourneyData(
    () => getExplorerLearner(brandId, enrollmentId),
    `explorer-learner:${key}`
  );
  const signals = useGrowthJourneyData(
    () => getExplorerLearnerSignals(brandId, enrollmentId, 90),
    `explorer-signals:${key}`
  );
  const decisions = useGrowthJourneyData(
    () => getExplorerLearnerDecisions(brandId, enrollmentId, { limit: 50, offset: 0 }),
    `explorer-learner-decisions:${key}`
  );
  const eligibility = useGrowthJourneyData(
    () => getExplorerEligibility(brandId, enrollmentId),
    `explorer-eligibility:${key}`
  );

  const [why, setWhy] = useState<string | null>(null);

  return (
    <>
      <div
        className="modal show d-block"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        role="dialog"
        aria-modal="true"
        aria-label="Learner detail"
        onClick={onClose}
      >
        <div
          className="modal-dialog modal-xl modal-dialog-scrollable"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-content">
            <div className="modal-header">
              <div>
                <h5 className="modal-title">
                  <LearnerName
                    enrollmentId={enrollmentId}
                    email={email}
                    leadId={profile.data?.data?.lead_id}
                    ghlUrl={profile.data?.data?.ghl_url}
                  />
                </h5>
                <div className="text-muted small font-monospace">{enrollmentId}</div>
              </div>
              <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
            </div>

            <div className="modal-body">
              <div className="row g-3">
                <div className="col-12 col-lg-5">
                  <h6 className="text-uppercase text-muted small mb-2">Profile</h6>
                  <ScopeState state={profile} {...scope} onRetry={profile.reload}>
                    {(p) => (
                      <table className="table table-sm mb-0">
                        <tbody>
                          <tr>
                            <td className="text-muted">State</td>
                            <td>
                              {p.primary_state ? (
                                <StatusBadge
                                  label={p.primary_state.replace(/_/g, ' ')}
                                  tone="info"
                                />
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
                                    <StatusBadge
                                      key={o}
                                      label={o.replace(/_/g, ' ')}
                                      tone="neutral"
                                    />
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
                  </ScopeState>

                  <h6 className="text-uppercase text-muted small mt-4 mb-2">Contactability</h6>
                  <ScopeState state={eligibility} {...scope} onRetry={eligibility.reload}>
                    {(e) => (
                      <>
                        {e.contactability ? (
                          <div className="d-flex flex-wrap gap-2 mb-2">
                            {Object.entries(e.contactability)
                              .filter(
                                ([, v]) => v && typeof v === 'object' && 'eligible' in (v as object)
                              )
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
                  </ScopeState>
                </div>

                <div className="col-12 col-lg-7">
                  <h6 className="text-uppercase text-muted small mb-2">Signals</h6>
                  <ScopeState state={signals} {...scope} onRetry={signals.reload}>
                    {(s) => <SignalTimeline signals={s} />}
                  </ScopeState>

                  <h6 className="text-uppercase text-muted small mt-4 mb-2">Buying signals</h6>
                  <ScopeState state={signals} {...scope} onRetry={signals.reload}>
                    {(s) =>
                      s.buying_signals ? (
                        <BuyingSignalsCard signals={s.buying_signals} />
                      ) : (
                        <div className="text-muted small">
                          Not available from this server yet.
                        </div>
                      )
                    }
                  </ScopeState>

                  <h6 className="text-uppercase text-muted small mt-4 mb-2">Decision history</h6>
                  <ScopeState state={decisions} {...scope} onRetry={decisions.reload}>
                    {(d) =>
                      d.rows.length === 0 ? (
                        <div className="text-muted small">
                          No decision has been recorded for this learner.
                        </div>
                      ) : (
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
                          {/* "50 of 612", never a bare 50 - a page that reports
                              only what fits on it implies that is all there is. */}
                          <div className="form-text">
                            Showing {d.rows.length} of {d.total}.
                          </div>
                        </div>
                      )
                    }
                  </ScopeState>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {why && (
        <WhyModal
          brandId={brandId}
          brandName={brandName}
          decisionId={why}
          onClose={() => setWhy(null)}
        />
      )}
    </>
  );
}
