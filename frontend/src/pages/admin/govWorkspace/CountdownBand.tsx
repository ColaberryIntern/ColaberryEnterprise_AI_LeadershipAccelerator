import React, { useMemo } from 'react';
import { deriveCountdown } from './govCountdown';

/**
 * CountdownBand (P5) — the dark "are we going to make it?" band at the top of Step 5. It shows what is left to
 * submit, the ship-by date (the day before the deadline) with working days remaining, and a DETERMINISTIC on-time
 * probability (govCountdown; a missing input renders "-" with the reason, never a guess). Chips surface the live
 * counts that drive the risk: items waiting on your answer, and fillers that block export.
 *
 * Presentation only: the page measures the inputs (deadline, unbuilt-story count, blocked/filler counts) and passes
 * them in; the math is the pure, unit-tested govCountdown.deriveCountdown.
 */
export function CountdownBand({
  deadline, remainingStoryCount, humanBlockedCount, submitDone, submitTotal, fillerCount,
}: {
  deadline: string | null;
  remainingStoryCount: number | null;
  humanBlockedCount: number;
  submitDone: number;
  submitTotal: number;
  fillerCount: number;
}): React.ReactElement {
  const c = useMemo(() => deriveCountdown({
    now: new Date(),
    deadline: deadline ? new Date(deadline) : null,
    remainingStoryCount,
    humanBlockedCount,
  }), [deadline, remainingStoryCount, humanBlockedCount]);

  const prob = c.probability;
  const probTone = prob === null ? 'text-secondary' : prob >= 70 ? 'text-info' : prob >= 40 ? 'text-warning' : 'text-danger';
  const tooltip = c.probability === null ? (c.reason ?? 'missing inputs')
    : `${c.workingDaysToShipBy} working days to ship-by vs ${c.effectiveNeeded} needed `
      + `(${c.remainingBuildDays} build + ${c.humanBlockedCount} blocked x 2); ratio ${c.slackRatio}`;

  return (
    <div className="card text-bg-dark border-0 mb-3">
      <div className="card-body">
        <div className="row g-3 align-items-center">
          <div className="col-6 col-lg-3">
            <div className="small text-uppercase" style={{ letterSpacing: '.05em', opacity: .65 }}>Left to submit</div>
            <div className="fs-4 fw-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>{submitDone} <span style={{ opacity: .6 }}>of {submitTotal}</span></div>
          </div>
          <div className="col-6 col-lg-3">
            <div className="small text-uppercase" style={{ letterSpacing: '.05em', opacity: .65 }}>Ship by</div>
            <div className="fs-5 fw-bold" style={{ fontVariantNumeric: 'tabular-nums' }}>{c.shipBy ?? '—'}</div>
            <div className="small" style={{ opacity: .7 }}>{c.workingDaysToShipBy === null ? 'no deadline' : `${c.workingDaysToShipBy} working days`}</div>
          </div>
          <div className="col-6 col-lg-3">
            <div className="small text-uppercase" style={{ letterSpacing: '.05em', opacity: .65 }}>On-time probability</div>
            <div className={`fs-3 fw-bold ${probTone}`} title={tooltip} style={{ cursor: 'help' }}>{prob === null ? '—' : `${prob}%`}</div>
            <div className="small" style={{ opacity: .7 }}>{prob === null ? (c.reason ?? '') : 'deterministic (hover for inputs)'}</div>
          </div>
          <div className="col-6 col-lg-3">
            <div className="small text-uppercase" style={{ letterSpacing: '.05em', opacity: .65 }}>Biggest risk</div>
            <div className="small">{c.reason && prob !== null ? c.reason : prob === null ? 'resolve the missing input above' : 'on track'}</div>
          </div>
        </div>
        <div className="d-flex flex-wrap gap-2 mt-2">
          {humanBlockedCount > 0 && <span className="badge bg-warning-subtle text-warning-emphasis"><i className="ri-question-answer-line me-1" aria-hidden="true" />{humanBlockedCount} need your answer</span>}
          {fillerCount > 0 && <span className="badge bg-danger-subtle text-danger-emphasis"><i className="ri-error-warning-line me-1" aria-hidden="true" />{fillerCount} filler blocking export</span>}
          {humanBlockedCount === 0 && fillerCount === 0 && <span className="badge bg-success-subtle text-success-emphasis"><i className="ri-check-line me-1" aria-hidden="true" />nothing waiting on a human</span>}
        </div>
      </div>
    </div>
  );
}
