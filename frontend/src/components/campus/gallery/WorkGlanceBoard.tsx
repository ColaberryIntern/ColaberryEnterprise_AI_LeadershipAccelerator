import React, { useEffect, useState } from 'react';
import { fetchMyWork, type WorkItem } from '../../../services/myWorkApi';
import { dayShort, summarize } from '../../../pages/portal/portfolio/myWork/workSummary';
import './workGlance.css';

/**
 * The Showcase Gallery's back-wall board (C129, phase 2 of the approved C127 design): "Your work at a glance". The learner's own
 * pieces: the total and the date range, then one bar per kind they have. "Open my dashboard" opens the Dashboard room; "See all
 * my work" opens My work. No pieces yet: the empty line and the same two doors. Nothing is shown that the learner did not make.
 *
 * Each row is a data-fit-box, so the screen's fit pass (C117) shrinks the board until nothing overflows.
 */
const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };
export const DASHBOARD = '/portal/portfolio/dashboard';
export const MY_WORK = '/portal/portfolio/work';
const MAX_KINDS = 6;

/** The learner's pieces for the board; null while loading or when the read failed (the board then shows its doors only). */
export function useMyWorkGlance(enabled: boolean): WorkItem[] | null {
  const [items, setItems] = useState<WorkItem[] | null>(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    fetchMyWork().then((l) => { if (live) setItems(l); }).catch(() => { if (live) setItems(null); });
    return () => { live = false; };
  }, [enabled]);
  return enabled ? items : null;
}

export default function WorkGlanceBoard({ items, onOpen }: { items: WorkItem[] | null; onOpen: (route: string) => void }): React.ReactElement {
  const s = summarize(items ?? []);
  const kinds = s.kinds.slice(0, MAX_KINDS);
  const max = Math.max(1, ...kinds.map((k) => k.n));
  return (
    <>
      <div className="k">Your portfolio</div>
      <h3 className="cm-wg-h" data-testid="cm-board-title">Your work at a glance</h3>
      {s.total > 0 && s.first && s.last ? (
        <>
          <div className="cm-wg-total" data-testid="cm-wg-total">
            <b>{s.total}</b>
            <span>{s.total === 1 ? 'piece of work' : 'pieces of work'} · {dayShort(s.first)} to {dayShort(s.last)}</span>
          </div>
          <div className="cm-wg-kinds" data-testid="cm-wg-kinds">
            {kinds.map((k) => (
              <div key={k.group} className="cm-wg-row" data-fit-box="">
                <span className="l">{k.label}</span>
                <span className="t" aria-hidden="true"><i style={{ width: `${Math.max(4, (k.n / max) * 100)}%`, background: k.color }} /></span>
                <b>{k.n}</b>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="cm-wg-empty" data-testid="cm-wg-empty">{items === null ? 'Your work shows here.' : 'No work yet. Every lab, build task and reflection adds a piece.'}</p>
      )}
      <div className="row">
        <button type="button" className="b red" onClick={stop(() => onOpen(DASHBOARD))} data-testid="cm-board-primary">Open my dashboard &rarr;</button>
        <button type="button" className="b" onClick={stop(() => onOpen(MY_WORK))} data-testid="cm-board-section">See all my work</button>
      </div>
    </>
  );
}
