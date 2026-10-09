import React from 'react';
import { STEPS, blockedReason, type StepFacts, type StepKey, type StepState } from './composerSteps';

/**
 * ComposerStepRail - the five steps across the top, carrying their own state.
 *
 * It answers three questions at a glance that the stacked form could not answer at all: where am
 * I, what is finished, and what can I not do yet. A blocked step is not hidden - hiding it would
 * make the job look shorter than it is - it is dimmed, unclickable, and says what to do first.
 *
 * Buttons, not links: this moves between steps of one page, it does not navigate. Each carries
 * its state in `aria-current` and in its title, so the rail is not colour-only.
 */

export interface ComposerStepRailProps {
  states: Record<StepKey, StepState>;
  facts: StepFacts;
  onGo: (step: StepKey) => void;
}

const TONE: Record<StepState, string> = {
  done: 'btn-outline-success',
  current: 'btn-primary',
  available: 'btn-outline-secondary',
  blocked: 'btn-outline-secondary',
};

export default function ComposerStepRail({ states, facts, onGo }: ComposerStepRailProps) {
  return (
    <nav className="composer-rail d-flex flex-wrap align-items-center gap-2 mb-3" aria-label="Composer steps" data-testid="composer-rail">
      {STEPS.map((step, i) => {
        const state = states[step.key];
        const blocked = state === 'blocked';
        const reason = blocked ? blockedReason(step.key, facts) : null;
        return (
          <React.Fragment key={step.key}>
            {i > 0 && <span className="text-muted d-none d-md-inline" aria-hidden="true">–</span>}
            <button
              type="button"
              className={`btn btn-sm ${TONE[state]}`}
              style={blocked ? { opacity: 0.55 } : undefined}
              disabled={blocked}
              aria-current={state === 'current' ? 'step' : undefined}
              // The reason is on the control itself, so hovering the thing you cannot click is
              // what explains it.
              title={reason ?? step.hint}
              onClick={() => onGo(step.key)}
              data-testid={`step-${step.key}`}
              data-state={state}
            >
              <span className="fw-semibold me-1">{step.number}</span>
              {step.label}
              {state === 'done' && <span className="ms-1" aria-label="finished">✓</span>}
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
}
