import React from 'react';
import { describeFailure, type SbpError } from '../../../services/sbpApi';
import type { CallNotice } from './describeCallOutcome';

// The notices a student sees around a build: which path produced their plan,
// what became of the call they asked for, and, once the plan is delivered,
// the handoff into Story 000. Extracted from ProjectsPage when that file
// passed the size ceiling; these own no state and render only what they are
// handed.
//
// Every one of them is mounted on EVERY view rather than only in the wizard.
// The pipeline banner used to live on the wizard screen alone, while
// `handleCreate` switched to the preview screen on its very first line, so
// the banner was mounted for about one frame and no student ever read a word
// of it. A warning nobody can see is the same as no warning.

export type PipelineState =
  | { state: 'idle' }
  | { state: 'generating'; projectId: string; status?: string }
  /** Generated, gate-clean, AND materialized into the portal. The real thing. */
  | { state: 'delivered'; projectId: string }
  /**
   * Generated and gate-clean, but not promoted. Rare and always a server-side
   * problem: it is the state five students were silently parked in. It is a
   * failure and is worded as one.
   */
  | { state: 'stalled'; projectId: string }
  | { state: 'gate_failed'; projectId: string; reasons: string[] }
  /**
   * Fell back to the browser template. `error` carries WHY, classified: a
   * refused request and an unreachable server are different failures needing
   * different actions, and this used to hold only a message string, so the
   * banner narrated every one of them as an outage.
   */
  | { state: 'local'; error: SbpError };

/**
 * What Story 000 will say about the project, in numbers, from the stored
 * truth. Null when the review could not be read: the handoff still renders,
 * it just cannot quote counts it does not have.
 */
export interface HandoffCounts {
  /** Things the student said, confirmed or not yet confirmed. */
  told: number;
  /** Things the system worked out rather than heard. */
  inferred: number;
  unanswered: number;
}

/**
 * The handoff into Story 000, on delivery.
 *
 * The generic "your plan is ready" line told a student the plan existed and
 * nothing about where to begin. Every later story builds on Story 000: its
 * prompt connects the repo so the platform can see pushes, and it writes
 * down what was understood AND what was not, so a gap is visible on day one
 * instead of found by a story in week six. So the delivered state names it,
 * quotes the counts when it has them, and opens it.
 */
export const Story000Handoff: React.FC<{
  counts: HandoffCounts | null;
  onOpen: (() => void) | null;
}> = ({ counts, onOpen }) => (
  <div className="card pjw-pane pj-pipe ok" role="status" aria-live="polite" data-testid="story000-handoff">
    <strong>Your plan is ready. Start with Story 000.</strong>
    <p className="lead" style={{ marginBottom: counts ? 8 : 0 }}>
      Story 000 is your Command Center. Its prompt connects your repo so the platform
      can see your pushes, and it writes down what we understood about your project
      so the gaps are visible from day one rather than found in week six. Every later
      story builds from it.
    </p>
    {counts && (
      <p className="lead" style={{ marginBottom: 0 }} data-testid="handoff-counts">
        It records {counts.told === 1 ? 'one thing' : `${counts.told} things`} you told us
        {counts.inferred > 0 ? `, ${counts.inferred === 1 ? 'one thing' : `${counts.inferred} things`} we worked out` : ''}
        , and {counts.unanswered === 0
          ? 'nothing still unanswered'
          : counts.unanswered === 1 ? 'one question still unanswered' : `${counts.unanswered} questions still unanswered`}.
      </p>
    )}
    {onOpen && (
      <div className="pjw-actions" style={{ marginTop: 12 }}>
        <button className="btn primary" onClick={onOpen}>
          Open Story 000
          <svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
    )}
  </div>
);

/**
 * What became of "have an AI call me". Says a call is coming only when the
 * server said so.
 */
export const CallBanner: React.FC<{ notice: CallNotice | null }> = ({ notice }) => {
  if (!notice) return null;
  return (
    <div className={`card pjw-pane pj-pipe ${notice.tone}`} role="status" aria-live="polite" data-testid="call-notice">
      <strong>{notice.tone === 'ok' ? 'About the call you asked for' : 'We could not set up the call'}</strong>
      <p className="lead" style={{ marginBottom: 0 }}>{notice.text}</p>
    </div>
  );
};

/** Tells the student which path produced their plan, and why. */
export const PipelineBanner: React.FC<{
  pipeline: PipelineState;
  handoff?: HandoffCounts | null;
  onOpenStory000?: (() => void) | null;
}> = ({ pipeline, handoff = null, onOpenStory000 = null }) => {
  if (pipeline.state === 'idle') return null;

  if (pipeline.state === 'generating') {
    return (
      <div className="card pjw-pane pj-pipe" role="status" aria-live="polite">
        <strong>Designing your system…</strong>
        <p className="lead" style={{ marginBottom: 0 }}>
          We are writing your requirements and breaking them into releases and stories.
          This takes a few minutes — you can keep working and come back.
        </p>
      </div>
    );
  }

  if (pipeline.state === 'delivered') {
    return <Story000Handoff counts={handoff} onOpen={onOpenStory000} />;
  }

  if (pipeline.state === 'stalled') {
    return (
      <div className="card pjw-pane pj-pipe warn" role="alert" aria-live="assertive">
        <strong>Your plan generated, but we could not open it up for you.</strong>
        <p className="lead" style={{ marginBottom: 0 }}>
          Nothing is lost — the plan is saved and the gate passed it. What failed
          is the step that turns it into your tasks and dates, so what you are
          looking at right now is the starter template, not your plan. Reload in
          a few minutes; we are told about this automatically.
        </p>
      </div>
    );
  }

  if (pipeline.state === 'gate_failed') {
    return (
      <div className="card pjw-pane pj-pipe warn" role="alert" aria-live="assertive">
        <strong>Your plan has a gap, so we have not opened it up yet.</strong>
        <p className="lead" style={{ marginBottom: 8 }}>
          We would rather tell you than hand you a plan that quietly misses
          something. Until it is fixed you are looking at the starter template.
        </p>
        <ul className="lead" style={{ margin: 0, paddingLeft: 20 }}>
          {pipeline.reasons.map((r) => <li key={r}>{r}</li>)}
        </ul>
        <p className="lead" style={{ margin: '8px 0 0' }}>
          Start the build again with more detail on the missing part, and it
          should close.
        </p>
      </div>
    );
  }

  // Fell back to the browser template. What we say depends on WHY, because the
  // action differs: a refused payload is fixed by editing an answer, and an
  // unreachable service is fixed by waiting. Telling a refused student to wait
  // is how Taiwo Oludimimu spent three days believing he had done something
  // wrong with his connection.
  const copy = describeFailure(pipeline.error);
  return (
    <div className="card pjw-pane pj-pipe warn" role="alert" aria-live="assertive">
      <strong>{copy.title}</strong>
      <p className="lead" style={{ marginBottom: 0 }}>
        {copy.body} You are looking at a general ten-task template — no schedule,
        no Command Center, generic prompts. {copy.action}
      </p>
    </div>
  );
};
