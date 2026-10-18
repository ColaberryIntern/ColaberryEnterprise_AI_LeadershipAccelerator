import React, { useMemo } from 'react';
import { deriveMvpSchedule, PROPOSAL_BUFFER_WORKING_DAYS } from './govCountdown';

/**
 * MvpScheduleBanner (P5, Spec & MVP Gantt) — the back-planned headline above the build Gantt: "MVP demo-ready by
 * <date> - N working days before due", red when the work cannot fit. It is DETERMINISTIC (govCountdown.deriveMvpSchedule,
 * working-day aware, `now` injected) and never guesses - a missing deadline/plan renders "-" with the reason.
 *
 * `mvpStoryCount` is the build-story count; a dated MVP-subset (demo release only) is a later refinement, so this is
 * a conservative read (all build stories), documented.
 */
export function MvpScheduleBanner({ deadline, mvpStoryCount }: {
  deadline: string | null;
  mvpStoryCount: number | null;
}): React.ReactElement {
  const s = useMemo(() => deriveMvpSchedule({
    now: new Date(), deadline: deadline ? new Date(deadline) : null, mvpStoryCount,
  }), [deadline, mvpStoryCount]);

  const tone = s.feasible === null ? 'secondary' : s.feasible ? 'success' : 'danger';
  const icon = s.feasible === null ? 'ri-calendar-line' : s.feasible ? 'ri-calendar-check-line' : 'ri-calendar-close-line';

  return (
    <div className={`alert alert-${tone === 'secondary' ? 'light' : tone} py-2 d-flex flex-wrap align-items-center gap-2 mb-2`} role="status">
      <i className={`${icon}`} aria-hidden="true" />
      <strong>{s.headline}</strong>
      {s.shipBy && <span className="small ms-auto">Ship by (day before the deadline): <strong>{s.shipBy}</strong></span>}
      {s.latestMvpReadyBy && s.feasible !== null && (
        <span className="small">· latest the MVP can be ready: <strong>{s.latestMvpReadyBy}</strong> (leaves {PROPOSAL_BUFFER_WORKING_DAYS} working days to draft &amp; ship)</span>
      )}
    </div>
  );
}
