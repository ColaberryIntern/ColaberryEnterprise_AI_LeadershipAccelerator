import React, { useCallback, useEffect, useState } from 'react';

/**
 * The guided walkthrough on the agent dashboard.
 *
 * Ali, on approving the design: *"Also add a guided walkthrough so it's easy to understand how to
 * use it."*
 *
 * ## It points at things, rather than describing them
 *
 * A tour that explains the page in prose is a second copy of the page, written worse, that goes
 * stale the first time a card moves. Each step here names a `data-testid` that already exists on
 * the thing it is about, scrolls to it and outlines it. If the element is gone the step says so
 * instead of highlighting empty space, which is also how the test catches a renamed card.
 *
 * ## Two audiences, because they do different jobs
 *
 * A builder needs to learn capability, task and tool, the four rungs, and how to file. The person
 * deciding needs the readiness meter, the five verbs and the instruction box. Showing either one
 * the other's tour teaches them the wrong vocabulary for their actual job.
 *
 * ## It never blocks the page
 *
 * No modal, no overlay that swallows clicks, no autoplay on arrival. It is a strip that can be
 * opened, stepped through and dismissed, and dismissal is remembered per audience. Somebody who
 * has read it once and comes back to do work should not have to dismiss it again.
 *
 * `localStorage` can throw (private windows, blocked site data) and can come back empty. Every
 * read and write is wrapped, and the component renders correctly when it is unavailable: the
 * walkthrough simply offers itself again, which is the safe direction to fail.
 */

export type Audience = 'builder' | 'decider';

export interface WalkStep {
  readonly title: string;
  /** Why it matters, in one sentence. */
  readonly why: string;
  /** What the reader actually does. "Nothing. Just know it." is a valid answer. */
  readonly you: string;
  /** The `data-testid` this step is about, if it points at something on this page. */
  readonly target?: string;
}

export const BUILDER_STEPS: ReadonlyArray<WalkStep> = [
  {
    title: 'Pick your agent first',
    why: 'Everything below this bar is that one agent. If you own one domain there is one entry, and that is correct rather than a missing list.',
    you: 'Check the name in the bar is the domain you work in.',
    target: 'agent-scope-bar',
  },
  {
    title: 'Capability, task and tool are three different things',
    why: 'A capability is the standing thing your agent can do. A task is work you want off your hands. A tool is one thing the agent is handed. The three columns are named after them on purpose.',
    you: 'Read the sentence under each column heading once. The rest of the product assumes you know the difference.',
    target: 'agent-dashboard-groups',
  },
  {
    title: 'One task usually needs several tools',
    why: 'Reading a table, reading another system and producing a report are three grants with three different blast radiuses, so they are three requests that share one task key.',
    you: 'When you file, give every tool of the same task the same task key.',
    target: 'hub-card-tasks',
  },
  {
    title: 'Climb the rungs in order',
    why: 'Do it by hand, do it in the app, request the tools, then the agent does it watched. Skipping rung 2 is the most common reason a request comes back.',
    you: 'Work out which rung you are on before you open the form.',
    target: 'hub-card-capability-board',
  },
  {
    title: 'If something looks wrong, it is probably us',
    why: 'Nothing has been through this pipeline yet. You are the first person through, so a screen that looks broken is more likely our bug than your mistake.',
    you: 'Press Report a problem and say what you clicked. That is more useful than working around it.',
  },
];

/**
 * The decider's five, and a correction worth recording.
 *
 * These targets were originally the HUB's cards — `hub-card-tool-requests` and `hub-card-tasks` —
 * written before there was anywhere else to point. The walkthrough is mounted on the decide
 * console, where neither of those elements exists, so two of the five steps would have rendered
 * "This step is about something that is not on this page right now": the tour telling the reader
 * it cannot find the thing it is about, on the page it exists to explain.
 *
 * That the component says so rather than outlining empty space is why the mistake was findable at
 * all. The targets below are the console's own elements, and the three steps that previously had
 * no target have one now, because every one of them is about something that is on the screen.
 */
export const DECIDER_STEPS: ReadonlyArray<WalkStep> = [
  {
    title: 'Two numbers before any request',
    why: 'Ready to decide and held back are different piles. A request whose decision package has holes in it is in the queue and cannot be acted on, so the count of what exists is not the count of your work.',
    you: 'Read those two tiles. If held back is the bigger number, your afternoon is send-backs rather than decisions.',
    target: 'decide-overview',
  },
  {
    title: 'Read the readiness meter before the prose',
    why: 'Ten blocks, and the meter names the ones nobody has answered. A request missing the number that judges it cannot be approved into anything checkable later.',
    you: 'If blocks are missing, send it back naming them. That is faster for both of you than approving and discovering later.',
    target: 'queue-cards',
  },
  {
    title: 'You have five answers, not two',
    why: 'Approve to build, assign an existing tool, send back, deny, or nothing. "Nothing" takes the capability off the board and is not a denial: a denial invites a better proposal.',
    you: 'Pick the one that matches what you actually mean. Nothing here is preselected for you.',
    target: 'decision-verbs',
  },
  {
    title: 'Your instruction travels with the grant',
    why: 'What you type at decision time reaches the agent. A rule written in a comment somewhere else is not a rule the agent received. Anything already in force is shown above the box, because the record is a log and you are adding to it.',
    you: 'Write how this agent should work and respond, in the box, at the moment you decide.',
    target: 'standing-instructions',
  },
  {
    title: 'A task is decided as a task',
    why: 'Deciding tool 2 of 3 without seeing the other two is deciding blind: approve the read, deny the write, and the agent holds a permission for work it cannot finish.',
    you: 'Check what else the task needs before approving the first piece of it.',
    target: 'task-panel',
  },
];

const HIGHLIGHT = 'agent-walkthrough-highlight';

function storageKey(a: Audience): string { return `agent-walkthrough-dismissed:${a}`; }

function readDismissed(a: Audience): boolean {
  try { return window.localStorage.getItem(storageKey(a)) === '1'; } catch { return false; }
}
function writeDismissed(a: Audience): void {
  try { window.localStorage.setItem(storageKey(a), '1'); } catch { /* a viewer who cannot store it is offered it again, which is the safe direction */ }
}

export default function AgentDashboardWalkthrough({
  domainKey,
  audience = 'builder',
  steps,
}: {
  domainKey?: string;
  audience?: Audience;
  steps?: ReadonlyArray<WalkStep>;
}) {
  const list = steps ?? (audience === 'decider' ? DECIDER_STEPS : BUILDER_STEPS);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<boolean>(() => readDismissed(audience));
  const [i, setI] = useState(0);
  const [missing, setMissing] = useState(false);

  const step = list[Math.min(i, list.length - 1)];

  /** Outline the element this step is about, and say so plainly when it is not there. */
  const point = useCallback((target: string | undefined) => {
    document.querySelectorAll(`.${HIGHLIGHT}`).forEach((el) => el.classList.remove(HIGHLIGHT));
    if (!target) { setMissing(false); return; }
    const el = document.querySelector(`[data-testid="${target}"]`);
    if (!el) { setMissing(true); return; }
    setMissing(false);
    el.classList.add(HIGHLIGHT);
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  useEffect(() => {
    if (open) point(step?.target);
    return () => { document.querySelectorAll(`.${HIGHLIGHT}`).forEach((el) => el.classList.remove(HIGHLIGHT)); };
  }, [open, i, step?.target, point]);

  // A different agent is a different board, so the tour starts from the top again rather than
  // leaving the reader on step 4 of a page that just changed underneath them.
  useEffect(() => { setI(0); }, [domainKey]);

  if (dismissed && !open) {
    return (
      <div className="mb-3">
        <button
          type="button"
          className="btn btn-sm btn-outline-primary"
          onClick={() => { setOpen(true); setI(0); }}
          data-testid="walkthrough-reopen"
        >
          <i className="ri-compass-3-line me-1" aria-hidden="true" />
          Show me how this page works
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="card border-0 shadow-sm mb-3 bg-light" data-testid="walkthrough-offer">
        <div className="card-body p-3 d-flex flex-wrap align-items-center gap-2">
          <div className="flex-grow-1">
            <div className="fw-semibold small">New here? Five steps, about a minute.</div>
            <div className="text-muted small">
              It points at the real thing on this page rather than describing it.
            </div>
          </div>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setOpen(true)} data-testid="walkthrough-start">
            Walk me through it
          </button>
          <button
            type="button"
            className="btn btn-sm btn-link text-muted"
            onClick={() => { setDismissed(true); writeDismissed(audience); }}
            data-testid="walkthrough-dismiss"
          >
            Not now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card border-0 shadow-sm mb-3" data-testid="walkthrough-panel">
      <div className="card-body p-3">
        <div className="d-flex align-items-center justify-content-between mb-1">
          <span className="badge bg-primary" data-testid="walkthrough-progress">
            Step {Math.min(i + 1, list.length)} of {list.length}
          </span>
          <button
            type="button"
            className="btn btn-sm btn-link text-muted p-0"
            onClick={() => { setOpen(false); setDismissed(true); writeDismissed(audience); }}
            data-testid="walkthrough-close"
          >
            Close
          </button>
        </div>

        <div className="fw-semibold" data-testid="walkthrough-title">{step?.title}</div>
        <div className="small text-muted mt-1">{step?.why}</div>
        <div className="small mt-2"><strong>You:</strong> {step?.you}</div>

        {missing && (
          <div className="small text-muted mt-2" data-testid="walkthrough-target-missing">
            This step is about something that is not on this page right now.
          </div>
        )}

        <div className="d-flex gap-2 mt-3">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={i === 0}
            onClick={() => setI((n) => Math.max(0, n - 1))}
            data-testid="walkthrough-back"
          >
            Back
          </button>
          {i < list.length - 1 ? (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setI((n) => n + 1)} data-testid="walkthrough-next">
              Next
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => { setOpen(false); setDismissed(true); writeDismissed(audience); }}
              data-testid="walkthrough-done"
            >
              Got it
            </button>
          )}
          {step?.target && (
            <button
              type="button"
              className="btn btn-sm btn-outline-primary"
              onClick={() => point(step.target)}
              data-testid="walkthrough-show-me"
            >
              Show me on the page
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
