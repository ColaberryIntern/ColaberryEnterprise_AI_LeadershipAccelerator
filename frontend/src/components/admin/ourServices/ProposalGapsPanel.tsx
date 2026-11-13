import React from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../shell';
import type { DecideNow, EvidenceService, IntakeSummaryItem } from '../../../services/ourServicesApi';
import { daysUntil, fitStepHref, formatCentralDate, gapsByPursuit, possibleProofForGap } from './ourServicesModel';

/**
 * ProposalGapsPanel - capabilities that "Can we deliver it?" marked Partly or New across OPEN pursuits, with the
 * buyer, the deadline (Central), the mapped service and its evidence score.
 *
 * Possible proof: the summary feed does not carry the Fit step's per-capability `possibleProof` list, so this panel
 * checks the capability name against the Intake queue's keywords (deterministic overlap) and labels it as a hint.
 * The authoritative list is on the pursuit's Fit step, which "Re-assess fit" opens.
 */
interface Props {
  openFitGaps: DecideNow['openFitGaps'];
  services: EvidenceService[];
  intake: IntakeSummaryItem[];
  now: Date;
  onReviewIntake: () => void;
}

const BADGE = { partial: { label: 'Partly', className: 'bg-warning-subtle text-warning-emphasis' }, new: { label: 'New capability', className: 'bg-danger-subtle text-danger-emphasis' } } as const;

export default function ProposalGapsPanel({ openFitGaps, services, intake, now, onReviewIntake }: Props): React.ReactElement {
  const byId = new Map(services.map((s) => [s.id, s]));
  const groups = gapsByPursuit(openFitGaps.items);
  return (
    <>
      {openFitGaps.count == null ? (
        <EmptyState icon="error-warning-line" tone="quiet" title="Open proposal gaps could not be read right now." description="Reload the page to try again." />
      ) : !groups.length ? (
        <EmptyState icon="checkbox-circle-line" tone="quiet" title="No open pursuit has a Partly or New capability." description="Gaps appear here after a pursuit's Fit step is assessed." />
      ) : (
        <div>
          {groups.map((g) => {
            const left = daysUntil(g.closeDate, now);
            return (
              <div key={g.key} className="mb-3">
                <div className="d-flex flex-wrap align-items-baseline gap-2 border-bottom pb-1 mb-1">
                  <span className="fw-bold">{g.title ?? 'Untitled pursuit'}</span>
                  <span className="small text-secondary">{g.buyer ?? 'Buyer not recorded'} · closes {formatCentralDate(g.closeDate)} (Central){Number.isFinite(left) ? ` · ${Math.max(0, left)} day${left === 1 ? '' : 's'} left` : ''}</span>
                  <Link to={fitStepHref(g.key)} className="btn btn-outline-secondary btn-sm ms-auto"><i className="ri-refresh-line me-1" aria-hidden="true" />Re-assess fit</Link>
                </div>
                {g.gaps.map((gap) => {
                  const svc = gap.matchedServiceId ? byId.get(gap.matchedServiceId) : undefined;
                  const proof = possibleProofForGap(gap.name, intake);
                  return (
                    <div key={gap.capabilityId} className="d-grid gap-3 align-items-center py-2 border-bottom" style={{ gridTemplateColumns: '1fr auto' }} data-testid={`gap-${gap.capabilityId}`}>
                      <div>
                        <span className="fw-semibold">{gap.name}</span> <span className={`badge rounded-pill ${BADGE[gap.assessment].className}`}>{BADGE[gap.assessment].label}</span>
                        <div className="small text-secondary mt-1">
                          {svc ? <>Maps to <b>{svc.name}</b> (evidence {svc.evidenceScore}). </> : 'No service in the catalog matches it yet. '}
                          {proof.length
                            ? <>💡 Possible unlinked proof (keyword overlap, check it): {proof.map((p, i) => <React.Fragment key={p.item.id}>{i > 0 && ', '}<b>{p.item.title}</b></React.Fragment>)} (waiting in Intake)</>
                            : 'No unlinked case study in Intake overlaps it. The pursuit\'s Fit step lists any proof linked elsewhere.'}
                        </div>
                      </div>
                      <div>
                        {proof.length > 0 && <button type="button" className="btn btn-primary btn-sm text-nowrap" onClick={onReviewIntake}>Review in intake →</button>}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
      <div className="d-flex gap-3 align-items-center rounded-3 p-3 mt-3 bg-dark text-white">
        <span className="fs-3" aria-hidden="true">💡</span>
        <div>
          <b>Rule: a service needs at least one case study before it counts as "We have it."</b>
          <div className="small opacity-75">Services added during a proposal start as 🌱 Growth. They count as Partly until a case study (inside or outside) is linked and a person promotes them.</div>
        </div>
      </div>
    </>
  );
}
