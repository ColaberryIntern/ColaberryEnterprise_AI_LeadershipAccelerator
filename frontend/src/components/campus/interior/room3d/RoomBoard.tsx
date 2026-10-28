import React, { useLayoutEffect, useRef, useState } from 'react';
import type { PageSummary, SideTop } from '../pageSummary';
import type { PlanStop } from '../../campusPlan';

/**
 * The back-wall screen ("📺 the board", v6 D1; v3 §2.1) and the left-wall board.
 *  - The screen shows the building page's Next step (kicker with type and points, title, line, primary button, a Copy button when
 *    the page has one). Clicking the screen body opens the section page; the primary button opens the workstation for that card
 *    (the same thing as sitting at your spot). With no Next step it shows the building's plan step; with neither, a plain sign
 *    with the section name. Never placeholder bars.
 *  - The left wall carries ONE board: the card to the right of the Next step on the page, with its "See it on the page →" button.
 *  - C73/C74 (Ali 2026-10-27, "If I click on the board in any room, it should blow up the board to full screen and then when I
 *    click on it again it should go back to normal size. Do the same for the left side."): clicking either board's body enlarges it
 *    over the room (Room3D's BoardZoom); clicking the enlarged board again restores it. The boards' own buttons keep their job in
 *    both sizes, and an Enlarge control gives the keyboard the same toggle.
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
  /** C73: toggle the enlarged board. Without it, the body opens the section (the pre-C73 behavior). */
  onZoom?: () => void;
  /** C73: this is the enlarged copy over the room. */
  big?: boolean;
  /**
   * Hands the screen element to the caller (C28b: the Events Hall docks the broadcast player
   * over it). A callback rather than a forwarded ref because this component already owns a ref
   * on that node for the fit pass, and two refs on one node is how one of them ends up null.
   *
   * Since C73 there can be TWO of these mounted at once — the board on the wall and the
   * enlarged copy over the room — so the caller passes this to exactly one of them.
   */
  screenEl?: (el: HTMLDivElement | null) => void;
}

const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

/** C73/C74: the keyboard's way to the same toggle the body click gives the mouse. */
export function EnlargeButton({ big, onZoom, testId }: { big?: boolean; onZoom: () => void; testId: string }): React.ReactElement {
  return (
    <button type="button" className="cm-r3-enlarge" onClick={stop(onZoom)} data-testid={testId} autoFocus={big}
      aria-label={big ? 'Back to normal size' : 'Enlarge the board'} title={big ? 'Back to normal size' : 'Enlarge'}>
      <span aria-hidden="true">{big ? '✕' : '⤢'}</span>
    </button>
  );
}

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

export function RoomScreen({ summary, name, planStep, onSection, onCard, onPlan, custom, onZoom, big, screenEl }: BoardProps): React.ReactElement {
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
    // The screen body is a mouse shortcut: enlarge / restore (C73), or the section when there is no zoom. It is not announced as a
    // button (a button inside a button is invalid); its own buttons are the controls, "See all of ‹section›" / "Open ‹section›" is
    // always one of them, and the Enlarge button is the keyboard's toggle.
    <div className={big ? 'cm-r3-screen is-big' : 'cm-r3-screen'}
      ref={(el) => { (screenRef as React.MutableRefObject<HTMLDivElement | null>).current = el; screenEl?.(el); }}
      onClick={onZoom ?? onSection}
      data-testid={big ? 'cm-board-big' : 'cm-board'} role="group" aria-label={big ? 'The board, enlarged' : 'The board'}>
      <div className={custom ? 'inner is-custom' : 'inner'}>{body}</div>
      {onZoom && <EnlargeButton big={big} onZoom={onZoom} testId={big ? 'cm-board-restore' : 'cm-board-enlarge'} />}
    </div>
  );
}

export interface WallBoardProps {
  side: SideTop;
  onSection: () => void;
  onRoute?: (route: string) => void;
  /** C74: toggle the enlarged board; the body click and the Enlarge button both call it. */
  onZoom?: () => void;
  big?: boolean;
}

/** C74: a group, not a button: its page link (and C75's rows) are buttons of their own; the body click enlarges / restores. */
export function WallBoard({ side, onSection, onRoute, onZoom, big }: WallBoardProps): React.ReactElement {
  const go = () => (side.route && onRoute ? onRoute(side.route) : onSection());
  return (
    <div className={big ? 'cm-r3-wallboard is-big' : 'cm-r3-wallboard'} onClick={onZoom} role="group" aria-label={side.title}
      data-testid={big ? 'cm-wall-board-big' : 'cm-wall-board'}>
      <span className="pin" aria-hidden="true" />
      <h4>{side.title}</h4>
      {side.note && <span className="note" data-testid="cm-wall-board-note">{side.note}</span>}
      {side.rows.map((r) => (
        <React.Fragment key={r.label}>
          {/* C75: a row with a route goes straight there (the Schedule's Today items open their assignment) */}
          {r.route && onRoute
            ? <button type="button" className="r is-link" onClick={stop(() => onRoute(r.route!))} data-testid="cm-wall-board-row"><span>{r.label}</span><b>{r.value} &rarr;</b></button>
            : <span className="r"><span>{r.label}</span><b>{r.value}</b></span>}
          {r.pct != null && <span className="bar"><i style={{ width: `${Math.max(3, r.pct)}%` }} /></span>}
        </React.Fragment>
      ))}
      {!side.rows.length && side.empty && <span className="empty" data-testid="cm-wall-board-empty">{side.empty}</span>}
      <button type="button" className="go" onClick={stop(go)} data-testid={big ? 'cm-wall-board-page-big' : 'cm-wall-board-page'}>{side.open ?? 'See it on the page'} &rarr;</button>
      {onZoom && <EnlargeButton big={big} onZoom={onZoom} testId={big ? 'cm-wall-board-restore' : 'cm-wall-board-enlarge'} />}
    </div>
  );
}

/**
 * C73/C74: the enlarged board over the whole room, flat (out of the 3D stage) so it reads at full size. Clicking the backdrop or
 * the board body restores it (the board's own onZoom); Escape restores it too, and focus goes back to where it was.
 */
export function BoardZoom({ onClose, children, testId }: { onClose: () => void; children: React.ReactNode; testId: string }): React.ReactElement {
  const back = useRef<Element | null>(typeof document === 'undefined' ? null : document.activeElement);
  useLayoutEffect(() => () => { (back.current as HTMLElement | null)?.focus?.(); }, []);
  return (
    <div className="cm-r3-zoom" role="dialog" aria-modal="true" aria-label="The board, enlarged" data-testid={testId}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
      {children}
    </div>
  );
}
