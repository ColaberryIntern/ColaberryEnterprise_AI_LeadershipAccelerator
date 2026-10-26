import React, { useEffect, useRef } from 'react';
import CampusTourEnd from './CampusTourEnd';
import type { ExplorerPathModel } from './campusPath';
import { trapTab } from './focusTrap';

/**
 * "Finish · see what you'd unlock" (WP-2, decision Q10): the Explorer's tour ends on this sheet instead of an end card. It holds
 * the existing opt-in (CampusTourEnd: only the learner's own click asks for an admissions handoff) and the path to enrolling.
 * A modal: focus moves in, Tab stays inside, Esc or the close button shuts it.
 */
export default function UnlockSheet({ pathModel, onNavigate, onClose }: { pathModel: ExplorerPathModel; onNavigate: () => void; onClose: () => void }): React.ReactElement {
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => { box.current?.focus(); }, []);
  return (
    <div className="cm-unlock-back" onClick={onClose} data-testid="cm-unlock-back">
      <div className="cm-unlock" role="dialog" aria-modal="true" aria-labelledby="cm-unlock-h" tabIndex={-1} ref={box} data-testid="cm-unlock"
        onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } else trapTab(e); }}>
        <button type="button" className="cm-unlock-x" onClick={onClose} aria-label="Close">×</button>
        <div className="cm-kicker">Explorer tour</div>
        <h2 id="cm-unlock-h">That&rsquo;s the whole campus</h2>
        <p className="cm-unlock-lead">Everything marked OPEN is yours to keep using. Enrolling opens the rest.</p>
        <CampusTourEnd pathModel={pathModel} onNavigate={onNavigate} />
      </div>
    </div>
  );
}
