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
export interface TourStep { view: StudioView; title: string; body: string; youDo?: string; }

export const TOUR_STEPS: TourStep[] = [
  { view: 'overview', title: 'Where we are', body: 'Your starting point. The pursuit stage, proposal readiness (every document against the 95 target), and the ranked next moves. Come back here to see what is left.', youDo: 'Read it. The numbers are the real projection, never guessed.' },
  { view: 'blueprint', title: 'Blueprint', body: 'Re-analyze the solicitation ZIP into a cited rulebook: scoring factors, submission rules, required forms, page limits. Each rule carries the quote and the page it came from.', youDo: 'Confirm the blueprint. A rule with no real quote is dropped, never invented.' },
  { view: 'documents', title: 'Document set', body: 'The deliverables this contract needs, each with a type (narrative, form, from the build, or generated), a page limit, the requirements it must cover, and a live score.', youDo: 'Open a document to draft or record it. Pricing stays admin-only end to end.' },
  { view: 'evidence', title: 'Build evidence', body: 'Screenshots and artifacts captured from your verified build stories, each tagged with the requirements it proves.', youDo: 'Insert an artifact into a document as a figure, so a claim is backed by working software.' },
  { view: 'editor', title: 'Draft & versions', body: 'The working copy of each document: the paper preview, the section plan, the six checks, and the full version history. The agent drafts, scores, and revises; people edit.', youDo: 'Pick a document, then Run review cycle. Every save is a new, scored version you can diff or roll back.' },
  { view: 'gates', title: 'Review gates', body: 'The Shipley color teams — Pink, Red, Gold, White glove — with the agent doing the reading. The matrix shows every document across the six checks.', youDo: 'A document passes at a weighted 95 with no check under 85. A person signs off at Gold before anything is packaged.' },
  { view: 'package', title: 'Package & submit', body: 'Assemble the approved version of each document into PDFs with the right file names, the sealed price file, the redacted copy, and a manifest.', youDo: 'Export once every document passes. Exporting is not submitting — you upload to the agency and record the receipt.' },
  { view: 'openitems', title: 'Open items', body: 'Everything that needs a person before this can ship: questions the agent is waiting on, items that would block export, and loose ends. Pulled live from the project.', youDo: 'Clear each one, then run a cycle.' },
  { view: 'overview', title: 'The proposal agent', body: 'The panel on the right is always here: the activity log and the questions the agent needs answered. An answer is saved to your company library and re-scores the documents that cited it.', youDo: 'Answer a question once; the agent reuses it everywhere it applies.' },
  { view: 'overview', title: 'You are set', body: 'Start at Blueprint to lock the rules, or jump into Draft & versions and run a cycle. You can reopen this walkthrough any time from "Take a tour".', youDo: 'Reopen it whenever you want a refresher.' },
];

export default function StudioTour(
  { step, onNavigate, onSetStep, onClose }:
  { step: number; onNavigate: (v: StudioView) => void; onSetStep: (n: number) => void; onClose: () => void },
): React.ReactElement | null {
  const total = TOUR_STEPS.length;
  const s = TOUR_STEPS[step];

  // Drive the real studio to the stage this step describes, so the person sees it live underneath the card. Keyed on
  // the step index ONLY (via a ref for the navigator), so it fires when the step changes — not every time the parent's
  // onNavigate identity changes on a URL update, which would otherwise snap the view back to the current step.
  const navRef = useRef(onNavigate);
  useEffect(() => { navRef.current = onNavigate; });
  useEffect(() => { const cur = TOUR_STEPS[step]; if (cur) navRef.current(cur.view); }, [step]);

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
      <div className="gps-tour-card">
        <div className="gps-tour-head">
          <span className="gps-eyebrow">Guided tour &middot; Step {step + 1} of {total}</span>
          <button type="button" className="gps-tour-x" aria-label="Skip the tour" onClick={onClose}>&times;</button>
        </div>
        <h3>{s.title}</h3>
        <p>{s.body}</p>
        {s.youDo && <p className="gps-tour-do"><b>You:</b> {s.youDo}</p>}
        <div className="gps-tour-dots" aria-hidden="true">
          {TOUR_STEPS.map((_, i) => <span key={i} className={i === step ? 'on' : undefined} />)}
        </div>
        <div className="gps-tour-foot">
          <button type="button" className="gps-btn sm" onClick={onClose}>Skip</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="gps-btn sm" disabled={step === 0} onClick={back}>Back</button>
            <button type="button" className="gps-btn sm primary" onClick={next}>{isLast ? 'Finish' : 'Next'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
