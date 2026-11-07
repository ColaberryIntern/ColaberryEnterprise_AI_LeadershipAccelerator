import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import type { StudioView } from './StageRail';

/**
 * StudioTour — a guided walkthrough of the Proposal Studio. On each step it (1) navigates the studio to that view (so
 * the stage the card describes is live underneath, and the process rail highlights it), (2) spotlights the one element
 * that step is about — a chip in the contract bar, a step in the process rail, or the agent panel — by positioning the
 * `.gps-tour-ring` over it (the ring's huge box-shadow dims everything else), and (3) shows a card explaining the stage
 * and what the person does there. Back / Next / Finish, a progress indicator, and Skip. Opened from "Take the tour" in
 * the contract bar, and offered once on a first visit (remembered per browser). Keyboard: Esc skips, arrows move. No
 * new dependency; styled in the `.gps` system. Every `target` points at a `data-tour="…"` anchor in the always-mounted
 * shell chrome, so the highlight is present the moment the step changes, whatever view is underneath.
 */
export interface TourStep { view: StudioView; target?: string; title: string; body: string; youDo?: string; adminOnly?: boolean; }
export type TourVariant = 'admin' | 'intern';

/** All steps, in order. Steps flagged adminOnly (the human Gold decision) are dropped for the intern variant. */
const ALL_STEPS: TourStep[] = [
  { view: 'overview', target: '[data-tour="ready"]', title: 'Where we are', body: 'Your starting point. The pursuit stage, proposal readiness (every document against the 95 target), and the ranked next moves — led by what needs you. "Build all documents" starts the agent on everything not yet begun.', youDo: 'Read it. The numbers are the real projection, never guessed.' },
  { view: 'openitems', target: '[data-tour="needs"]', title: 'Needs you', body: 'The one list of exactly what a person must supply before this proposal can ship — each a typed need with its ask, why, and the documents it unblocks. Answer one and the agent picks that document back up automatically.', youDo: 'Answer a need inline. The agent resumes the documents it unblocked.' },
  { view: 'blueprint', target: '[data-tour="blueprint"]', title: 'Blueprint', body: 'The solicitation ZIP as a cited rulebook: scoring factors, submission rules, required forms, page limits. Each rule carries the quote and the page it came from.', youDo: 'Confirm the blueprint. A rule with no real quote is dropped, never invented.' },
  { view: 'documents', target: '[data-tour="documents"]', title: 'Document set', body: 'The deliverables this contract needs, each with a type, a stage, the needs holding it, a page limit, and a live score. A not-started row has a "Build it" button; "Add from library" offers only the forms for this bid’s jurisdiction.', youDo: 'Build a document, or open one to read it. Pricing stays admin-only end to end.' },
  { view: 'evidence', target: '[data-tour="evidence"]', title: 'Build evidence', body: 'Screenshots captured from your verified build stories, each tagged with the requirements it proves.', youDo: 'Insert an artifact into a document as a figure, so a claim is backed by working software.' },
  { view: 'editor', target: '[data-tour="editor"]', title: 'Draft & versions', body: 'The working copy of each document: the Paper, an Outline tab (page budget + requirement coverage), the six checks, and the full version history. The agent drafts, judges and revises; a person can Edit, which re-judges and resumes only if still below bar.', youDo: 'Pick a document, then Re-judge & revise, or Edit a section directly.' },
  { view: 'gates', target: '[data-tour="gates"]', title: 'Review gates', body: 'The Shipley color teams with the agent doing the reading. Pink, Red and White glove are recorded automatically by the AI judge when a version passes their checks.', youDo: 'Watch the gates light up as documents pass. Nothing to approve here except Gold.', adminOnly: true },
  { view: 'gates', target: '[data-tour="gates"]', title: 'The Gold decision', body: 'Gold is the one human gate: a single Go or No-go for the whole package, offered only once every document passes. You cannot approve a version you last authored — separation of duties is enforced.', youDo: 'Give the package a Go when it is ready, or a No-go with a note.', adminOnly: true },
  { view: 'package', target: '[data-tour="package"]', title: 'Package & submit', body: 'Assemble the approved version of each document into PDFs with the right file names, the sealed price file, the redacted copy, and a manifest.', youDo: 'Export once every document passes. Exporting is not submitting — you upload to the agency and record the receipt.' },
  { view: 'overview', target: '[data-tour="agent"]', title: 'The proposal agent', body: 'The panel on the right is always here: a live state (Building / Judging / Revising / Waiting on you), the activity log, the top needs, and an Ask box. An answer is saved to your company library and re-scores the documents that cited it.', youDo: 'Answer a need once; the agent reuses it everywhere it applies. Ask it anything about this proposal.' },
  { view: 'overview', target: '[data-tour="rail"]', title: 'You are set', body: 'Start at Blueprint to lock the rules, or press "Build all documents" and let the agent draft. You can reopen this walkthrough any time from "Take the tour".', youDo: 'Reopen it whenever you want a refresher.' },
];

/** PURE: the steps for a variant. The intern variant hides the admin-only Gold steps. */
export function tourSteps(variant: TourVariant = 'admin'): TourStep[] {
  return ALL_STEPS.filter((s) => variant === 'admin' || !s.adminOnly);
}

/** Back-compat: the full (admin) step list. */
export const TOUR_STEPS: TourStep[] = tourSteps('admin');

export default function StudioTour(
  { step, onNavigate, onSetStep, onClose, variant = 'admin' }:
  { step: number; onNavigate: (v: StudioView) => void; onSetStep: (n: number) => void; onClose: () => void; variant?: TourVariant },
): React.ReactElement | null {
  const steps = useMemo(() => tourSteps(variant), [variant]);
  const total = steps.length;
  const s = steps[step];
  const ringRef = useRef<HTMLDivElement>(null);

  // Drive the real studio to the stage this step describes, so the person sees it live underneath the card. Keyed on
  // the step index ONLY (via a ref for the navigator), so it fires when the step changes — not every time the parent's
  // onNavigate identity changes on a URL update, which would otherwise snap the view back to the current step.
  const navRef = useRef(onNavigate);
  useEffect(() => { navRef.current = onNavigate; });
  useEffect(() => { const cur = steps[step]; if (cur) navRef.current(cur.view); }, [step, steps]);

  // Spotlight: glue the ring to this step's target. The target lives in the always-mounted chrome (bar chip, rail
  // step, agent panel), so it is in the DOM the instant the step changes — no wait on the center view to render. The
  // ring is positioned by inline style over the stylesheet's `display:none`; on mobile the stylesheet's `!important`
  // keeps it hidden and the card alone carries the tour.
  const position = useCallback(() => {
    const ring = ringRef.current;
    const cur = steps[step];
    if (!ring) return;
    const el = cur && cur.target ? document.querySelector<HTMLElement>(cur.target) : null;
    const r = el ? el.getBoundingClientRect() : null;
    if (!r || (r.width === 0 && r.height === 0)) { ring.style.display = 'none'; return; }
    ring.style.display = 'block';
    ring.style.left = `${Math.max(2, r.left - 6)}px`;
    ring.style.top = `${Math.max(2, r.top - 6)}px`;
    ring.style.width = `${r.width + 12}px`;
    ring.style.height = `${r.height + 12}px`;
  }, [step, steps]);

  useEffect(() => {
    const cur = steps[step];
    const el = cur && cur.target ? document.querySelector<HTMLElement>(cur.target) : null;
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) el.scrollIntoView({ block: 'center' });
    }
    position();
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(position) : 0;
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => {
      if (raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
    };
  }, [position, step, steps]);

  const back = useCallback(() => onSetStep(Math.max(0, step - 1)), [step, onSetStep]);
  const next = useCallback(() => { if (step >= total - 1) onClose(); else onSetStep(step + 1); }, [step, total, onSetStep, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, back, onClose]);

  if (!s) return null;
  const isLast = step >= total - 1;

  return (
    <>
      {/* The spotlight ring is a sibling of the tour card, NOT a child: the card's wrapper is `transform`ed (to
          center it), which would become the containing block for the ring's position:fixed and throw its viewport
          coordinates off. As a direct child of `.gps` (no transformed ancestor — the toast positions fixed there too)
          the ring measures against the viewport, and at z-index 40 its scrim dims the page while the card sits above. */}
      <div ref={ringRef} className="gps-tour-ring" data-testid="tour-ring" aria-hidden="true" />
      <div className="gps-tour" role="dialog" aria-modal="false" aria-label="Proposal Studio walkthrough">
      <div className="gps-tour-card" data-testid="tour-card" data-step={step + 1}>
        <div className="gps-tour-head">
          <span className="gps-eyebrow">Tour &middot; {step + 1} of {total}</span>
          <button type="button" className="gps-tour-x" aria-label="Skip the tour" onClick={onClose}>&times;</button>
        </div>
        <h3>{s.title}</h3>
        <p>{s.body}</p>
        {s.youDo && <p className="gps-tour-do"><b>You:</b> {s.youDo}</p>}
        <div className="gps-tour-dots" aria-hidden="true">
          {steps.map((_, i) => <span key={i} className={i === step ? 'on' : undefined} />)}
        </div>
        <div className="gps-tour-foot">
          <button type="button" className="gps-btn sm" data-testid="tour-skip" onClick={onClose}>Skip</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="gps-btn sm" disabled={step === 0} onClick={back}>Back</button>
            <button type="button" className="gps-btn sm primary" data-testid="tour-next" onClick={next}>{isLast ? 'Finish' : 'Next'}</button>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}
