import React from 'react';
import { WhyBody } from '../../explorerGrowth/DecisionWhyModal';
import ScopeState from './ScopeState';
import { useGrowthJourneyData } from '../useGrowthJourneyData';
import { getExplorerWhy } from '../../../services/growthJourneyExplorerApi';

/**
 * Why a decision was made, brand-scoped. A thin shell over Explorer's own body.
 *
 * ─── WHAT IS REUSED, AND WHY IT IS SAFE TO ──────────────────────────────────
 *
 * `WhyBody` is exported from Explorer's modal and is deliberately PURE - its own
 * docstring says that purity is what makes its "every loser is rendered"
 * guarantee testable with `renderToStaticMarkup`. So the entire drilldown,
 * including the suppressed list that must never be truncated, comes from one
 * definition rather than a copy that could quietly start slicing.
 *
 * Only the fetch is re-created, because Explorer's `DecisionWhyModal` calls its
 * unscoped client internally.
 *
 * ─── WHAT IS DELIBERATELY ABSENT ────────────────────────────────────────────
 *
 * No `revision` node. `DraftRevisionPanel`'s regenerate action is a WRITE, and
 * the contract defers every Explorer write to a later change: "they stay
 * reachable nowhere in this build". `WhyBody` renders without it, which is what
 * every existing test of it already does, so the read content is complete and
 * the button simply is not there.
 */

interface Props {
  brandId: string | null;
  brandName: string | null;
  decisionId: string;
  onClose: () => void;
}

export default function WhyModal({ brandId, brandName, decisionId, onClose }: Props) {
  const why = useGrowthJourneyData(
    () => getExplorerWhy(brandId, decisionId),
    `explorer-why:${brandId ?? 'all'}:${decisionId}`
  );

  return (
    <div
      className="modal show d-block"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Why this decision was made"
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-lg modal-dialog-scrollable"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              <i className="ri-question-answer-line me-2" aria-hidden="true" />
              Why?
            </h5>
            <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
          </div>
          <div className="modal-body">
            <ScopeState
              state={why}
              brandSelected={brandId !== null}
              brandName={brandName}
              onRetry={why.reload}
            >
              {(w) => <WhyBody w={w} />}
            </ScopeState>
          </div>
        </div>
      </div>
    </div>
  );
}
