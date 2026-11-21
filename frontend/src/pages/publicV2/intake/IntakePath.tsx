import React from 'react';

/**
 * IntakePath - the four steps from here to the meeting (v2, 2026-11-21), with where they are.
 *
 * Ali: AI interview, their own research if they have it, then "we do our research, you, your
 * industry, trends, news, updates, AI etc.. Draft options based on potential ROI", then the
 * human meeting, which always comes after the AI interview.
 */
export type StepState = 'done' | 'current' | 'next';

export interface PathState {
  interview: StepState;
  theirResearch: StepState;
  ourResearch: StepState;
  meeting: StepState;
  /** Short notes under a step, such as the booked time. */
  notes?: Partial<Record<'interview' | 'theirResearch' | 'ourResearch' | 'meeting', string>>;
}

const STEPS: Array<{ key: keyof Omit<PathState, 'notes'>; title: string; body: string }> = [
  { key: 'interview', title: 'Your AI interview, 10 minutes', body: 'Now, or at a time you pick. By typing, or by phone where we offer it.' },
  { key: 'theirResearch', title: 'Your own research, if you have it', body: 'Optional. Add documents you already have and we build on them.' },
  { key: 'ourResearch', title: 'Our research and your options', body: 'You, your industry, its trends and news, and where AI fits. Pilot options ranked by potential return.' },
  { key: 'meeting', title: 'Meet with Ali, 30 minutes', body: 'On Google Meet, at least one business day after your AI interview, so the homework is done.' },
];

const MARK: Record<StepState, string> = { done: 'Done', current: 'Now', next: 'Next' };

export function IntakePath({ state }: { state: PathState }): React.ReactElement {
  return (
    <ol className="cbv2-dpi__path" aria-label="Your path to a pilot" data-testid="intake-path">
      {STEPS.map((s, n) => (
        <li key={s.key} className={`cbv2-dpi__step cbv2-dpi__step--${state[s.key]}`} aria-current={state[s.key] === 'current' ? 'step' : undefined}>
          <b aria-hidden="true">{state[s.key] === 'done' ? '✓' : n + 1}</b>
          <p>
            <strong>{s.title}</strong>
            <span>{s.body}</span>
            {state.notes?.[s.key] ? <em>{state.notes[s.key]}</em> : null}
          </p>
          <span className="cbv2-sr-only">{MARK[state[s.key]]}</span>
        </li>
      ))}
    </ol>
  );
}

export default IntakePath;
