import type { ComposerAction, ConfirmationSummary } from '../../../../services/contentComposerApi';

/**
 * Where this post is on the way out, and the one thing to do next.
 *
 * WHY. Section 4 rendered seven stacked blocks - accounts, time, copy, links, validation,
 * buttons, reasons - in that order, with the reasons last and muted. So the question an operator
 * actually has ("why can I not click anything?") was answered in the least prominent place on the
 * screen. Reported 2026-10-01: "section 4 is very very busy. I can't see all what's going on...
 * I scheduled, but couldn't click any of the 4 buttons... I don't know if it's set up correctly."
 *
 * It was set up correctly and it was never going to publish. The item sat at `draft` with a time
 * saved, four buttons off, and the reason - validation had not been run for revision 8 - printed
 * at the bottom in small grey text.
 *
 * So the ladder is computed, not inferred. Publishing is Validate -> Approve -> Schedule, and
 * every step is gated on the one before it. Saying that plainly is the whole fix.
 */

export type StepState = 'done' | 'current' | 'blocked' | 'skipped';

export interface ConfirmStep {
  key: 'validate' | 'approve' | 'schedule';
  label: string;
  state: StepState;
  /** What this step is waiting on. Null when done or when nothing is in the way. */
  detail: string | null;
}

export interface ConfirmLadder {
  steps: ConfirmStep[];
  /** One sentence at the top: where the post stands. */
  headline: string;
  /** The action to press now, when exactly one makes sense. */
  nextAction: ComposerAction | null;
  nextLabel: string | null;
  /** Everything standing in the way, in the order they must be cleared. */
  blockers: string[];
}

const PUBLISHED: ReadonlySet<string> = new Set(['published', 'partially_published', 'publishing']);

/**
 * Build the ladder from the server's own verdict.
 *
 * Reads `readiness` rather than re-deriving it: the server decides what may run, and a second
 * opinion here could disagree with the buttons it is describing. What this adds is ORDER - which
 * refusal to act on first - because `readiness.reasons` is a flat list.
 */
export function confirmLadder(summary: ConfirmationSummary): ConfirmLadder {
  const { validation, approval, readiness, schedule, item } = summary;
  const status = item.status;

  if (PUBLISHED.has(status)) {
    return {
      steps: [
        { key: 'validate', label: 'Validated', state: 'done', detail: null },
        { key: 'approve', label: 'Approved', state: 'done', detail: null },
        { key: 'schedule', label: 'Published', state: 'done', detail: null },
      ],
      headline: status === 'publishing' ? 'This post is going out now.' : 'This post has gone out.',
      nextAction: null,
      nextLabel: null,
      blockers: [],
    };
  }

  const validated = validation.ran && validation.ok;
  const approved = approval.humanApproved || status === 'approved' || status === 'scheduled';
  const scheduled = status === 'scheduled';

  const validate: ConfirmStep = {
    key: 'validate',
    label: 'Validate',
    state: validated ? 'done' : 'current',
    detail: validated
      ? null
      : !validation.ran
        // The most common and least visible cause: every edit bumps the revision, and a
        // validation from the previous revision does not count.
        ? 'Not run for this revision yet. Press Validate under Channels - any edit since the last run means it has to run again.'
        : `${validation.blockerCount} problem${validation.blockerCount === 1 ? '' : 's'} to fix, listed below.`,
  };

  const approve: ConfirmStep = {
    key: 'approve',
    label: 'Approve',
    state: approved ? 'done' : validated ? 'current' : 'blocked',
    detail: approved
      ? null
      : validated
        ? status === 'ready_for_review'
          ? 'Waiting for someone to approve it.'
          : 'Send it for approval. Nothing publishes from a draft.'
        : 'Validation has to pass first.',
  };

  const scheduleStep: ConfirmStep = {
    key: 'schedule',
    label: scheduled ? 'Scheduled' : 'Schedule or publish',
    state: scheduled ? 'done' : approved ? 'current' : 'blocked',
    detail: scheduled
      ? null
      : !approved
        ? 'Needs approval first.'
        : schedule === null
          ? 'Set a time, or publish now.'
          : null,
  };

  const steps = [validate, approve, scheduleStep];

  const nextAction: ComposerAction | null = readiness.canSchedule
    ? 'schedule'
    : readiness.canPublishNow
      ? 'publish_now'
      : readiness.canSendForApproval
        ? 'send_for_approval'
        : null;

  const nextLabel = nextAction === 'schedule'
    ? 'Schedule'
    : nextAction === 'publish_now'
      ? readiness.publishLabel
      : nextAction === 'send_for_approval'
        ? 'Send for approval'
        : null;

  const current = steps.find((s) => s.state === 'current');
  const headline = scheduled && schedule
    ? `Scheduled for ${schedule.local.time} ${schedule.local.zone}, ${schedule.local.dayLabel}.`
    : current
      ? `This post is a ${status.replace(/_/g, ' ')}. Next: ${current.label.toLowerCase()}.`
      : `This post is a ${status.replace(/_/g, ' ')}.`;

  return {
    steps,
    headline,
    nextAction,
    nextLabel,
    // The server's reasons, kept in its order - it already lists them most-blocking first.
    blockers: readiness.reasons,
  };
}
