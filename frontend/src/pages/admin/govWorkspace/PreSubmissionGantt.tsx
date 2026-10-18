import React, { useMemo } from 'react';
import { derivePreSubmissionGantt, type PreSubmissionBar, type PreSubmissionMarker } from './govCountdown';

/**
 * PreSubmissionGantt (P5, Spec & MVP schedule) — the VISUAL under the MvpScheduleBanner headline: the back-plan
 * drawn on a fixed today->deadline axis, so you can SEE whether the MVP build fits before the proposal is due. Two
 * bars (the MVP build, red when it overflows the latest-safe date; the draft/ship buffer) and four date markers
 * (today, the latest the MVP can be ready, ship-by, the deadline). DETERMINISTIC: all positions come from the PURE,
 * unit-tested `derivePreSubmissionGantt` (working-day aware, `now` injected). Distinct from the post-award GovBuildGantt
 * below it; this one asks "can we build a demo before the bid is due?", not "how will the awarded build run?".
 */
const BAR_COLOR: Record<PreSubmissionBar['tone'], string> = {
  critical: 'var(--bs-primary)',
  buffer: 'var(--bs-secondary)',
  overflow: 'var(--bs-danger)',
};
const MARK_COLOR: Record<PreSubmissionMarker['tone'], string> = {
  now: 'var(--bs-secondary)',
  constraint: 'var(--bs-warning)',
  ship: 'var(--bs-info)',
  deadline: 'var(--bs-danger)',
};
/** Pin a label to a marker without clipping it at the axis ends. */
function labelShift(leftPct: number): string {
  if (leftPct <= 1) return 'translateX(0)';
  if (leftPct >= 99) return 'translateX(-100%)';
  return 'translateX(-50%)';
}

export function PreSubmissionGantt({ deadline, mvpStoryCount }: {
  deadline: string | null;
  mvpStoryCount: number | null;
}): React.ReactElement | null {
  const g = useMemo(() => derivePreSubmissionGantt({
    now: new Date(), deadline: deadline ? new Date(deadline) : null, mvpStoryCount,
  }), [deadline, mvpStoryCount]);

  // No axis to draw (missing deadline/plan, or the deadline is today/past) — the banner already states the reason.
  if (g.bars.length === 0) return null;

  return (
    <div role="img" aria-label={g.headline}>
      <div className="position-relative">
        {/* vertical marker lines behind the bars */}
        <div className="position-absolute" style={{ left: 0, right: 0, top: 20, bottom: 18, pointerEvents: 'none' }} aria-hidden="true">
          {g.markers.map((m) => (
            <div key={m.key} style={{ position: 'absolute', left: `${m.leftPct}%`, top: 0, bottom: 0, borderLeft: `1px dashed ${MARK_COLOR[m.tone]}`, opacity: 0.6 }} />
          ))}
        </div>

        {/* marker names across the top */}
        <div className="position-relative" style={{ height: 18 }} aria-hidden="true">
          {g.markers.map((m) => (
            <span key={m.key} className="small fw-semibold" style={{ position: 'absolute', left: `${m.leftPct}%`, transform: labelShift(m.leftPct), whiteSpace: 'nowrap', color: MARK_COLOR[m.tone] }}>{m.label}</span>
          ))}
        </div>

        {/* the bars */}
        {g.bars.map((b) => (
          <div key={b.key} className="mb-2">
            <div className="small text-secondary mb-1">{b.label}</div>
            <div className="position-relative" style={{ height: 16, background: 'var(--bs-tertiary-bg, #eef0f3)', borderRadius: 3 }}>
              <div title={b.label} style={{ position: 'absolute', left: `${b.leftPct}%`, width: `${b.widthPct}%`, height: '100%', background: BAR_COLOR[b.tone], borderRadius: 3 }} />
            </div>
          </div>
        ))}

        {/* marker dates along the bottom */}
        <div className="position-relative" style={{ height: 16 }} aria-hidden="true">
          {g.markers.map((m) => (
            <span key={m.key} className="text-secondary" style={{ position: 'absolute', left: `${m.leftPct}%`, transform: labelShift(m.leftPct), whiteSpace: 'nowrap', fontSize: '0.72rem' }}>{m.date}</span>
          ))}
        </div>
      </div>

      <div className="small text-secondary mt-1">
        <span className="badge me-1" style={{ background: BAR_COLOR.critical }}>&nbsp;</span>MVP build
        <span className="badge ms-2 me-1" style={{ background: BAR_COLOR.buffer }}>&nbsp;</span>draft &amp; ship buffer
        {g.feasible === false && (<><span className="badge ms-2 me-1" style={{ background: BAR_COLOR.overflow }}>&nbsp;</span>build overflows the deadline</>)}
        <span className="d-block mt-1"><i className="ri-information-line me-1" aria-hidden="true" />Deterministic back-plan from the submission deadline; working-day aware. The build bar must finish by <strong>MVP ready by</strong> to leave time to draft and ship.</span>
      </div>
    </div>
  );
}
