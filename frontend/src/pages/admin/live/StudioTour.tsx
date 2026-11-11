import React, { useCallback, useEffect, useState } from 'react';

/**
 * "Show me how this works" for Studio setup.
 *
 * ## What it is, and what it deliberately is not
 *
 * It is six short panels explaining what each card decides and which of those decisions cannot
 * be taken back. It is NOT a spotlight walkthrough that dims the page and points at elements:
 * that kind of tour breaks the moment a card moves, it has to be maintained alongside every
 * layout change, and it is the first thing to go stale and start pointing at nothing.
 *
 * The thing an operator actually needs here is not "this box is the title box" - they can see
 * that. It is "access mode cannot be changed afterwards", which no amount of pointing at the
 * control conveys.
 *
 * ## It opens itself the first time and then stops
 *
 * Somebody landing on this screen for the first time has no idea there is a tour. Somebody
 * landing on it for the thirtieth time does not want one. `localStorage` is wrapped: in a
 * private window the read throws, the tour opens, and that is the harmless direction.
 */

const SEEN_KEY = 'clv-tour-seen';

export function hasSeenTour(): boolean {
  try { return window.localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; }
}

function markSeen(): void {
  try { window.localStorage.setItem(SEEN_KEY, '1'); } catch { /* private window */ }
}

interface Step {
  title: string;
  body: string;
  /** Said in red. Only where getting it wrong cannot be undone from this screen. */
  warning?: string;
}

const STEPS: Step[] = [
  {
    title: 'What this screen does',
    body: 'It sets up one class to be broadcast: who is teaching, who is running the show, who '
      + 'may watch, and whether it is recorded. Nothing here starts a broadcast. Pressing '
      + 'Create builds the airing; going live happens later, from the class page itself.',
  },
  {
    title: 'The show',
    body: 'The title and timing come from the class that already exists, so there is nothing to '
      + 'retype. If the class is on the wrong day, fix it where classes are scheduled rather '
      + 'than here, so the two cannot disagree.',
  },
  {
    title: 'People',
    body: 'Start typing a name and pick from the list. Anyone with the staff role can be named. '
      + 'The producer has to be someone other than the presenter, and Create stays disabled '
      + 'until that is true.',
    warning: 'Whoever is teaching cannot also watch the feed health and run the show. That is '
      + 'why two different people are required rather than suggested.',
  },
  {
    title: 'Audience',
    body: 'This is an explicit choice: the enrolled cohort only, or guests as well. It used to '
      + 'be decided by whether the class title contained the words "Open House", which meant '
      + 'renaming a class changed who could see it.',
  },
  {
    title: 'Access mode',
    body: 'Who may watch the recording afterwards. Read the sentence under each option; it says '
      + 'what a remote viewer gets.',
    warning: 'THIS ONE CANNOT BE CHANGED LATER. The access mode is written once and there is no '
      + 'undo on this screen, because the alternative is quietly widening who could watch '
      + 'something after people were told otherwise. Getting it wrong means deleting the airing '
      + 'by hand in the database, which is why there is an acknowledgement box.',
  },
  {
    title: 'Create',
    body: 'The summary at the bottom lists four things and Create stays disabled until all four '
      + 'read Done. Once created, the class page shows the producer controls: go backstage, '
      + 'mark content started, go live, mark a moment for the editor, and end.',
  },
];

export interface StudioTourProps {
  open: boolean;
  onClose: () => void;
}

export default function StudioTour({ open, onClose }: StudioTourProps): React.ReactElement | null {
  const [step, setStep] = useState(0);

  const close = useCallback(() => {
    markSeen();
    setStep(0);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  if (!open) return null;

  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div className="clv-tour-backdrop" data-testid="studio-tour" role="dialog" aria-modal="true" aria-label="How Studio setup works">
      <div className="clv-tour">
        <div className="clv-tour-count" data-testid="tour-count">
          {step + 1} of {STEPS.length}
        </div>
        <h2 className="clv-tour-title" data-testid="tour-title">{s.title}</h2>
        <p className="clv-tour-body">{s.body}</p>
        {s.warning && (
          <p className="clv-tour-warning" data-testid="tour-warning">{s.warning}</p>
        )}

        <div className="clv-tour-actions">
          <button
            type="button"
            className="clv-tour-skip"
            onClick={close}
            data-testid="tour-close"
          >
            {last ? 'Done' : 'Skip'}
          </button>
          <div className="clv-tour-move">
            <button
              type="button"
              className="clv-tour-btn"
              onClick={() => setStep((n) => Math.max(0, n - 1))}
              disabled={step === 0}
              data-testid="tour-back"
            >
              Back
            </button>
            {!last && (
              <button
                type="button"
                className="clv-tour-btn clv-tour-next"
                onClick={() => setStep((n) => Math.min(STEPS.length - 1, n + 1))}
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
