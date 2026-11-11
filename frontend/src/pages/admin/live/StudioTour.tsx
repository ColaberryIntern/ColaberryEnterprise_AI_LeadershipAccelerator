import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';

/**
 * A guided walkthrough that points at the thing it is talking about.
 *
 * ## It used to be a stack of panels, and that was wrong
 *
 * The first version was six paragraphs in a dialog. I argued in this file that a spotlight tour
 * is fragile - it breaks when a card moves and goes stale pointing at nothing - and shipped
 * prose instead. Ali's answer on 2026-11-11: "The walkthrough should move pages and highlight
 * the areas you want us to see. You are just throwing words at us now."
 *
 * He is right, and the argument I made was about MY maintenance cost rather than about whether
 * the thing worked for the person using it. Reading six paragraphs and then hunting for the
 * cards they describe is work the tour was supposed to remove.
 *
 * ## How it stays non-fragile anyway
 *
 * Steps target `data-tour` attributes rather than CSS classes or DOM shapes. A class name is a
 * styling decision that changes for styling reasons; `data-tour="people"` exists only for this,
 * so it moves when the card moves and nothing else touches it.
 *
 * And a step whose target is missing does NOT break the tour or point at the corner of the
 * screen: it falls back to a centered callout with the same words. That is the specific failure
 * I was worried about, handled rather than avoided.
 */

export interface TourStep {
  /** The `data-tour` value to highlight. Omitted for a step about the page as a whole. */
  target?: string;
  title: string;
  body: string;
  /** Said in amber. Only where getting it wrong cannot be undone from this screen. */
  warning?: string;
  /**
   * Move to another page before showing this step.
   *
   * A function rather than a string because the destination is often not known until the tour
   * runs - the class list has to pick a class first.
   */
  goto?: () => string | null;
}

const SEEN_KEY = 'clv-tour-seen';

export function hasSeenTour(): boolean {
  try { return window.localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; }
}

export function markTourSeen(): void {
  try { window.localStorage.setItem(SEEN_KEY, '1'); } catch { /* private window */ }
}

interface Box { top: number; left: number; width: number; height: number }

export interface StudioTourProps {
  open: boolean;
  steps: TourStep[];
  onClose: () => void;
  /** Called with a path when a step wants the browser somewhere else. */
  onNavigate?: (path: string) => void;
}

export default function StudioTour(
  { open, steps, onClose, onNavigate }: StudioTourProps,
): React.ReactElement | null {
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);

  const step = steps[i];

  const close = useCallback(() => {
    markTourSeen();
    setI(0);
    setBox(null);
    onClose();
  }, [onClose]);

  /**
   * Measure the target and bring it on screen.
   *
   * `useLayoutEffect` so the highlight is painted in the same frame as the step change; with a
   * plain effect the ring lands a frame late and visibly jumps from the previous card.
   */
  useLayoutEffect(() => {
    if (!open || !step) return undefined;

    const measure = () => {
      if (!step.target) { setBox(null); return; }
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (!el) { setBox(null); return; }
      const r = el.getBoundingClientRect();
      setBox({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    const el = step.target ? document.querySelector(`[data-tour="${step.target}"]`) : null;
    /**
     * Feature-detected, not assumed. `scrollIntoView` is absent in jsdom, so calling it
     * unguarded threw inside a layout effect and took the whole page down with it - every
     * Studio setup test failed at once, including the accessibility sweep.
     *
     * The guard is right beyond the test environment too: a walkthrough is an aid, and an aid
     * that can crash the screen it is explaining is worse than no aid.
     */
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }

    // Measure after the smooth scroll has had a chance to run, then keep it honest while the
    // page moves underneath: a tour that keeps its ring where the card USED to be is worse
    // than one with no ring.
    const t = window.setTimeout(measure, 260);
    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [open, step, i]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const go = useCallback((next: number) => {
    const s = steps[next];
    if (s?.goto) {
      const path = s.goto();
      if (path && onNavigate) onNavigate(path);
    }
    setI(next);
  }, [steps, onNavigate]);

  if (!open || !step) return null;

  const last = i === steps.length - 1;
  const PAD = 8;

  /**
   * The callout sits under the highlight, or above it when there is no room below. Centered
   * when there is nothing to point at, which is also the fallback for a missing target.
   */
  const below = box ? box.top + box.height + 14 : 0;
  const room = box ? window.innerHeight - below : 0;
  const style: React.CSSProperties = box
    ? room > 220
      ? { top: below, left: Math.max(12, Math.min(box.left, window.innerWidth - 400)) }
      : { bottom: window.innerHeight - box.top + 14, left: Math.max(12, Math.min(box.left, window.innerWidth - 400)) }
    : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

  return (
    <div className="clv-tour-layer" data-testid="studio-tour" role="dialog" aria-modal="true" aria-label={step.title}>
      {/*
        * The dim and the hole are ONE element: a box the size of the target with a 9999px
        * spread shadow. Four separate dimming panels would have to be kept in sync with each
        * other on every scroll, and any disagreement shows as a seam across the page.
        */}
      {box ? (
        <div
          className="clv-tour-ring"
          data-testid="tour-ring"
          style={{
            top: box.top - PAD,
            left: box.left - PAD,
            width: box.width + PAD * 2,
            height: box.height + PAD * 2,
          }}
        />
      ) : (
        <div className="clv-tour-dim" data-testid="tour-dim" />
      )}

      <div className="clv-tour-callout" style={style} data-testid="tour-callout">
        <div className="clv-tour-count" data-testid="tour-count">{i + 1} of {steps.length}</div>
        <h2 className="clv-tour-title" data-testid="tour-title">{step.title}</h2>
        <p className="clv-tour-body">{step.body}</p>
        {step.warning && <p className="clv-tour-warning" data-testid="tour-warning">{step.warning}</p>}

        <div className="clv-tour-actions">
          <button type="button" className="clv-tour-skip" onClick={close} data-testid="tour-close">
            {last ? 'Done' : 'Skip'}
          </button>
          <div className="clv-tour-move">
            <button
              type="button"
              className="clv-tour-btn"
              onClick={() => go(Math.max(0, i - 1))}
              disabled={i === 0}
              data-testid="tour-back"
            >
              Back
            </button>
            {!last && (
              <button
                type="button"
                className="clv-tour-btn clv-tour-next"
                onClick={() => go(Math.min(steps.length - 1, i + 1))}
                data-testid="tour-next"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
