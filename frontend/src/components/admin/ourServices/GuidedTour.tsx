import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { TourStep } from './ourServicesTourSteps';

/**
 * GuidedTour - a step-by-step walkthrough of a page. Each step scrolls its `[data-tour="<target>"]` section into view,
 * spotlights it (the rest of the page dims), and explains it in a card fixed to the bottom-right corner, so the card
 * can never cover the top of the section or run off a small screen.
 *
 * Keyboard: Right arrow / Enter = next, Left arrow = back, Escape = close. Focus moves to the card when it opens and
 * back to the button that opened it when it closes. Steps whose section is missing are skipped. No library: the
 * repo has none, and this needs about a hundred lines.
 */
interface Props { steps: readonly TourStep[]; onClose: () => void }

type Box = { top: number; left: number; width: number; height: number };
const PAD = 8;

const find = (target: string): HTMLElement | null => document.querySelector<HTMLElement>(`[data-tour="${target}"]`);

export default function GuidedTour({ steps, onClose }: Props): React.ReactElement | null {
  const present = useMemo(() => steps.filter((s) => find(s.target)), [steps]);
  const [i, setI] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const returnTo = useRef<Element | null>(typeof document !== 'undefined' ? document.activeElement : null);
  const step = present[i];

  const measure = useCallback(() => {
    const el = step ? find(step.target) : null;
    if (!el) { setBox(null); return; }
    const r = el.getBoundingClientRect();
    setBox({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
  }, [step]);

  useLayoutEffect(() => {
    const el = step ? find(step.target) : null;
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    measure();
    // Smooth scrolling moves the section after this runs; re-measure while it settles.
    const timers = [150, 400, 800].map((ms) => window.setTimeout(measure, ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [step, measure]);

  useEffect(() => {
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => { window.removeEventListener('scroll', measure, true); window.removeEventListener('resize', measure); };
  }, [measure]);

  const close = useCallback(() => {
    onClose();
    const back = returnTo.current as HTMLElement | null;
    if (back && typeof back.focus === 'function') back.focus();
  }, [onClose]);
  const next = useCallback(() => { if (i >= present.length - 1) close(); else setI(i + 1); }, [i, present.length, close]);
  const back = useCallback(() => setI((n) => Math.max(0, n - 1)), []);

  useEffect(() => { cardRef.current?.focus(); }, [i]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight' || (e.key === 'Enter' && e.target === cardRef.current)) next();
      else if (e.key === 'ArrowLeft') back();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close, next, back]);

  if (!step) return null;
  const last = i === present.length - 1;

  return (
    <div data-testid="guided-tour">
      {box ? (
        <div aria-hidden="true" className="rounded-3" style={{
          position: 'fixed', top: box.top, left: box.left, width: box.width, height: box.height, zIndex: 1060, pointerEvents: 'none',
          boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.55)', outline: '3px solid var(--bs-primary)', transition: 'all 200ms ease',
        }} />
      ) : (
        <div aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 1060, background: 'rgba(15, 23, 42, 0.55)', pointerEvents: 'none' }} />
      )}
      <div ref={cardRef} tabIndex={-1} role="dialog" aria-modal="false" aria-labelledby="tour-title" aria-describedby="tour-body"
        className="card shadow-lg border-0" data-testid="tour-card"
        style={{ position: 'fixed', right: 16, bottom: 16, width: 'min(420px, calc(100vw - 32px))', zIndex: 1061 }}>
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-start mb-2">
            <div className="small text-secondary">Step {i + 1} of {present.length}</div>
            <button type="button" className="btn-close" aria-label="Close the walkthrough" onClick={close} />
          </div>
          <div className="progress mb-3" style={{ height: 4 }} aria-hidden="true">
            <div className="progress-bar" style={{ width: `${((i + 1) / present.length) * 100}%` }} />
          </div>
          <h2 id="tour-title" className="h6 d-flex align-items-center gap-2"><i className={`${step.icon} text-primary fs-5`} aria-hidden="true" />{step.title}</h2>
          <p id="tour-body" className="small mb-3">{step.body}</p>
          <div className="d-flex justify-content-between">
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={back} disabled={i === 0}>Back</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={next}>{last ? 'Finish' : 'Next'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
