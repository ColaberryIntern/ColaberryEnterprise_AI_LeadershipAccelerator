import React from 'react';
import type { WorkspaceStep, WorkspaceStepDef, StepStatus } from './workspaceSteps';

/**
 * StepBar — the numbered pursuit stepper that replaces the old `nav-tabs` row AND the journey strip.
 * Presentational only: it renders the seven steps with done / current / to-do affordances and calls
 * `onStep` when one is clicked. Every step is navigable (the flow is not hard-gated in the UI; the
 * server gates the real actions), so each is a real tab button. Scrolls horizontally when narrow,
 * exactly like the tab row it replaces.
 */
export function StepBar({
  steps,
  stateByStep,
  onStep,
}: {
  steps: WorkspaceStepDef[];
  stateByStep: Record<WorkspaceStep, StepStatus>;
  onStep: (key: WorkspaceStep) => void;
}): React.ReactElement {
  return (
    <nav className="gov-step-bar d-flex align-items-start flex-nowrap overflow-auto mb-4 pb-1"
      role="tablist" aria-label="Pursuit steps">
      {steps.map((s, i) => {
        const status = stateByStep[s.key];
        const isCurrent = status === 'current';
        const isDone = status === 'done';
        const badgeCls = isCurrent
          ? 'bg-primary text-white border-primary'
          : isDone
            ? 'bg-success text-white border-success'
            : 'bg-body text-secondary border-secondary-subtle';
        const labelCls = isCurrent
          ? 'fw-semibold text-primary'
          : isDone
            ? 'text-success-emphasis'
            : 'text-secondary';
        return (
          <React.Fragment key={s.key}>
            {i > 0 && (
              <div aria-hidden="true" className="flex-grow-1 align-self-center"
                style={{ height: 2, minWidth: 16, marginTop: 18, background: 'var(--bs-border-color)' }} />
            )}
            <button type="button" role="tab" aria-selected={isCurrent}
              aria-current={isCurrent ? 'step' : undefined}
              className="gov-step btn btn-link text-decoration-none d-flex flex-column align-items-center gap-1 px-2"
              style={{ minWidth: 92, flex: '0 0 auto' }}
              onClick={() => onStep(s.key)}>
              <span
                className={`d-inline-flex align-items-center justify-content-center rounded-circle border ${badgeCls}`}
                style={{ width: 36, height: 36, fontWeight: 600, fontSize: 15 }}>
                {isDone ? <i className="ri-check-line" aria-hidden="true" /> : s.n}
              </span>
              <span className={`small text-nowrap ${labelCls}`}>
                <i className={`ri-${s.icon} me-1`} aria-hidden="true" />{s.label}
              </span>
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
}
