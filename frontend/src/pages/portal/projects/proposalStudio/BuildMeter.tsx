import React, { useEffect, useRef, useState } from 'react';
import type { StudentGovProjectView } from '../../../../services/govProjectPortalApi';
import { buildableDocs, builtDocCount } from './buildProgress';

/**
 * BuildMeter - the live build bar shown in the shell while any document is building. It answers three of Ali's
 * questions at once:
 *   - "why does readiness not move while things build?" - because readiness is a QUALITY score (it moves only when a
 *     document passes its checks). This meter tracks BUILD progress instead, and moves as each document completes.
 *   - "can I have a meter that tells me how much time is left?" - elapsed time, plus an honest estimate once at least
 *     one document has finished during this build (extrapolated from the measured rate; omitted before that).
 *   - "can it run with the screen moving?" - a one-second ticking clock keeps the bar visibly alive without re-pulling
 *     any data or re-rendering the rest of the page.
 */

const fmtClock = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
};

export default function BuildMeter({ view, runningCount }: { view: StudentGovProjectView; runningCount: number }): React.ReactElement {
  const total = buildableDocs(view).length;
  const built = builtDocCount(view);
  const pct = total > 0 ? Math.round((built / total) * 100) : 0;

  // Captured when the bar first appears (the start of this build burst); used for elapsed + the rate-based estimate.
  const startRef = useRef<number>(Date.now());
  const baselineBuiltRef = useRef<number>(built);
  const [now, setNow] = useState<number>(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const elapsed = now - startRef.current;
  const doneSinceStart = Math.max(0, built - baselineBuiltRef.current);
  const remaining = Math.max(0, total - built);
  const etaMs = doneSinceStart > 0 && remaining > 0 ? (elapsed / doneSinceStart) * remaining : null;

  return (
    <div className="gps-building-bar" role="status" aria-live="polite" data-testid="building-bar">
      <span className="gps-building-dot" aria-hidden="true" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="gps-build-meter-line">
          <span>The agent is building. {runningCount} in progress now. This updates on its own, so you do not need to refresh.</span>
          <span className="gps-build-meter-stat" data-testid="build-meter-stat">Built {built} of {total} &middot; {fmtClock(elapsed)} elapsed{etaMs != null ? ` · about ${fmtClock(etaMs)} left` : ''}</span>
        </div>
        <div className="gps-build-track" aria-hidden="true"><div className="gps-build-fill" style={{ width: `${pct}%` }} /></div>
      </div>
    </div>
  );
}
