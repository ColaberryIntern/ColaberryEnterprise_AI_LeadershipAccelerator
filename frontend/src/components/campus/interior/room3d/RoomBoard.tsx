import React, { useLayoutEffect, useRef, useState } from 'react';
import type { PageSummary, SideTop } from '../pageSummary';
import type { PlanStop } from '../../campusPlan';

/**
 * The back-wall screen ("📺 the board", v6 D1; v3 §2.1) and the left-wall board.
 *  - The screen shows the building page's Next step (kicker with type and points, title, line, primary button, a Copy button when
 *    the page has one). Clicking the screen body opens the section page; the primary button opens the workstation for that card
 *    (the same thing as sitting at your spot). With no Next step it shows the building's plan step; with neither, a plain sign
 *    with the section name. Never placeholder bars.
 *  - The left wall carries ONE board: the card to the right of the Next step on the page. Clicking it opens it flat, with
 *    "See it on the page →".
 */
export interface BoardProps {
  summary: PageSummary | null;
  name: string;
  planStep?: PlanStop | null;
  onSection: () => void;
  onCard: (() => void) | null;
  onPlan?: (route: string) => void;
  /** A building's own board in place of the Next step (C21: Admissions' plans & pricing). */
  custom?: React.ReactNode;
}

const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

/**
 * C42 (room fix F2): the fit pass. The screen's text is sized from the room (--fw x --fit); when a long card still overflows the
 * screen, --fit steps down 5% at a time to 80%, so nothing is clipped. Set on the element directly (no re-render), on every render
 * and when the screen resizes.
 */
export function fitScreen(el: HTMLElement): number {
  const inner = el.querySelector<HTMLElement>('.inner');
  if (!inner) return 1;
  let fit = 1;
  el.style.setProperty('--fit', '1');
  while (inner.scrollHeight > inner.clientHeight + 1 && fit > 0.8 + 1e-9) {
    fit = Math.round((fit - 0.05) * 100) / 100;
    el.style.setProperty('--fit', String(fit));
  }
  return fit;
}
function useFitScreen(): React.RefObject<HTMLDivElement> {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { if (ref.current) fitScreen(ref.current); });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => fitScreen(el));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return ref;
}

export function RoomScreen({ summary, name, planStep, onSection, onCard, onPlan, custom }: BoardProps): React.ReactElement {
  const next = summary?.next ?? null;
  const [copied, setCopied] = useState(false);
  const screenRef = useFitScreen();
  const copy = (text: string) => { void navigator.clipboard?.writeText(text).then(() => setCopied(true), () => setCopied(false)); };
  let body: React.ReactNode;
  if (custom) {
    body = custom;
  } else if (next) {
    body = (
      <>
        <div className="k">{next.kicker}{next.points > 0 && <span className="pts">+{next.points} PTS</span>}</div>
        <h3 data-testid="cm-board-title">{next.title}</h3>
        {next.sub && <p>{next.sub}</p>}
        <div className="row">
          <button type="button" className="b red" onClick={stop(onCard ?? onSection)} data-testid="cm-board-primary">{next.cta} &rarr;</button>
          {next.secondary && <button type="button" className="b" onClick={stop(() => copy(next.secondary!.copy))} data-testid="cm-board-copy">{copied ? 'Copied ✓' : next.secondary.label}</button>}
          <button type="button" className="b" onClick={stop(onSection)} data-testid="cm-board-section">See all of {summary!.doorName}</button>
        </div>
      </>
    );
  } else if (planStep) {
    body = (
      <>
        <div className="k">Today&rsquo;s plan{planStep.minutes ? <span className="pts">{planStep.minutes} MIN</span> : null}</div>
        <h3 data-testid="cm-board-title">{planStep.label}</h3>
        <div className="row">
          <button type="button" className="b red" onClick={stop(() => onPlan?.(planStep.route))} data-testid="cm-board-primary">Open the card &rarr;</button>
          <button type="button" className="b" onClick={stop(onSection)} data-testid="cm-board-section">See all of {summary?.doorName ?? name}</button>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <h3 className="plain" data-testid="cm-board-title">{summary?.doorName ?? name}</h3>
        <div className="row"><button type="button" className="b red" onClick={stop(onSection)} data-testid="cm-board-primary">Open {summary?.doorName ?? name} &rarr;</button></div>
      </>
    );
  }
  return (
    // The screen body is a mouse shortcut to the section. It is not announced as a button (a button inside a button is invalid);
    // its own buttons are the controls, and "See all of ‹section›" / "Open ‹section›" is always one of them for the keyboard.
    <div className="cm-r3-screen" ref={screenRef} onClick={onSection} data-testid="cm-board" role="group" aria-label="The board">
      <div className="inner">{body}</div>
    </div>
  );
}

export function WallBoard({ side, onSection }: { side: SideTop; onSection: () => void }): React.ReactElement {
  const [flat, setFlat] = useState(false);
  return (
    <>
      <button type="button" className="cm-r3-wallboard" onClick={() => setFlat(true)} data-testid="cm-wall-board" aria-label={`${side.title}: open it flat`}>
        <span className="pin" aria-hidden="true" />
        <h4>{side.title}</h4>
        {side.rows.map((r) => (
          <React.Fragment key={r.label}>
            <span className="r"><span>{r.label}</span><b>{r.value}</b></span>
            {r.pct != null && <span className="bar"><i style={{ width: `${Math.max(3, r.pct)}%` }} /></span>}
          </React.Fragment>
        ))}
      </button>
      {flat && (
        <div className="cm-r3-flat" role="dialog" aria-modal="true" aria-label={side.title} data-testid="cm-wall-board-flat"
          onClick={(e) => { if (e.target === e.currentTarget) setFlat(false); }} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setFlat(false); } }}>
          <div className="card">
            <h3>{side.title}</h3>
            {side.rows.map((r) => <div key={r.label} className="kv"><span>{r.label}</span><b>{r.value}</b></div>)}
            <div className="row">
              <button type="button" className="cm-btn" onClick={onSection} data-testid="cm-wall-board-page">See it on the page &rarr;</button>
              <button type="button" className="cm-btn is-secondary" onClick={() => setFlat(false)} autoFocus>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
