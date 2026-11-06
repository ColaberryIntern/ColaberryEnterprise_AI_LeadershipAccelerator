import React, { useCallback, useEffect, useRef } from 'react';
import type { StudioView } from './StageRail';

/**
 * StudioTour — a guided walkthrough of the Proposal Studio. It steps through the real stages: on each step it
 * navigates the studio to that view (so the stage the card describes is live underneath, and the process rail
 * highlights it), and shows a card explaining what the stage is and what the person does there. Back / Next /
 * Finish, a progress indicator, and Skip. Opened from "Take a tour" in the contract bar, and once automatically on a
 * person's first visit (remembered per browser). Keyboard: Esc skips, arrows move. No new dependency; styled in the
 * `.gps` system.
 */
export interface TourStep { view: StudioView; title: string; body: string; youDo?: string; adminOnly?: boolean; }
export type TourVariant = 'admin' | 'intern';

/** All steps, in order. Steps flagged adminOnly (the human Gold decision) are dropped for the intern variant. */
const ALL_STEPS: TourStep[] = [
  { view: 'overview', title: 'Where we are', body: 'Your starting point. The pursuit stage, proposal readiness (every document against the 95 target), and the ranked next moves — led by what needs you. "Build all documents" starts the agent on everything not yet begun.', youDo: 'Read it. The numbers are the real projection, never guessed.' },
  { view: 'openitems', title: 'Needs you', body: 'The one list of exactly what a person must supply before this proposal can ship — each a typed need with its ask, why, and the documents it unblocks. Answer one and the agent picks that document back up automatically.', youDo: 'Answer a need inline. The agent resumes the documents it unblocked.' },
  { view: 'blueprint', title: 'Blueprint', body: 'The solicitation ZIP as a cited rulebook: scoring factors, submission rules, required forms, page limits. Each rule carries the quote and the page it came from.', youDo: 'Confirm the blueprint. A rule with no real quote is dropped, never invented.' },
  { view: 'documents', title: 'Document set', body: 'The deliverables this contract needs, each with a type, a stage, the needs holding it, a page limit, and a live score. A not-started row has a "Build it" button; "Add from library" offers only the forms for this bid’s jurisdiction.', youDo: 'Build a document, or open one to read it. Pricing stays admin-only end to end.' },
  { view: 'evidence', title: 'Build evidence', body: 'Screenshots captured from your verified build stories, each tagged with the requirements it proves.', youDo: 'Insert an artifact into a document as a figure, so a claim is backed by working software.' },
  { view: 'editor', title: 'Draft & versions', body: 'The working copy of each document: the Paper, an Outline tab (page budget + requirement coverage), the six checks, and the full version history. The agent drafts, judges and revises; a person can Edit, which re-judges and resumes only if still below bar.', youDo: 'Pick a document, then Run review cycle, or Edit it directly.' },
  { view: 'gates', title: 'Review gates', body: 'The Shipley color teams with the agent doing the reading. Pink, Red and White glove are recorded automatically by the AI judge when a version passes their checks.', youDo: 'Watch the gates light up as documents pass. Nothing to approve here except Gold.', adminOnly: true },
  { view: 'gates', title: 'The Gold decision', body: 'Gold is the one human gate: a single Go or No-go for the whole package, offered only once every document passes. You cannot approve a version you last authored — separation of duties is enforced.', youDo: 'Give the package a Go when it is ready, or a No-go with a note.', adminOnly: true },
  { view: 'package', title: 'Package & submit', body: 'Assemble the approved version of each document into PDFs with the right file names, the sealed price file, the redacted copy, and a manifest.', youDo: 'Export once every document passes. Exporting is not submitting — you upload to the agency and record the receipt.' },
  { view: 'overview', title: 'The proposal agent', body: 'The panel on the right is always here: a live state (Building / Judging / Revising / Waiting on you), the activity log, the top needs, and an Ask box. An answer is saved to your company library and re-scores the documents that cited it.', youDo: 'Answer a need once; the agent reuses it everywhere it applies. Ask it anything about this proposal.' },
  { view: 'overview', title: 'You are set', body: 'Start at Blueprint to lock the rules, or press "Build all documents" and let the agent draft. You can reopen this walkthrough any time from "Take a tour".', youDo: 'Reopen it whenever you want a refresher.' },
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
  const steps = tourSteps(variant);
  const total = steps.length;
  const s = steps[step];

  // Drive the real studio to the stage this step describes, so the person sees it live underneath the card. Keyed on
  // the step index ONLY (via a ref for the navigator), so it fires when the step changes — not every time the parent's
  // onNavigate identity changes on a URL update, which would otherwise snap the view back to the current step.
  const navRef = useRef(onNavigate);
  useEffect(() => { navRef.current = onNavigate; });
  useEffect(() => { const cur = steps[step]; if (cur) navRef.current(cur.view); }, [step, steps]);

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
    <div className="gps-tour" role="dialog" aria-modal="false" aria-label="Proposal Studio walkthrough">
      <div className="gps-tour-ring" data-testid="tour-ring" aria-hidden="true" />
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
  );
}
