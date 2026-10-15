import React from 'react';
import type { WorkspaceStep, WorkspaceStepDef, StepStatus } from './workspaceSteps';

/**
 * StepBar — the numbered pursuit stepper (2026-10 redesign). Presentational only: it renders the
 * seven steps with their one-line question and done / current / to-do / locked affordances, marks
 * the frontier (first unfinished actionable step), and calls `onStep` when one is clicked.
 *
 * Locked steps (5–7 before approval) are dimmed and show "After approval" instead of their question,
 * but stay clickable so an admin can preview what unlocks. The server gates the real actions; this
 * bar is advisory.
 */
export function StepBar({
  steps,
  statuses,
  frontier,
  onStep,
}: {
  steps: WorkspaceStepDef[];
  statuses: Record<WorkspaceStep, StepStatus>;
  frontier: WorkspaceStep;
  onStep: (key: WorkspaceStep) => void;
}): React.ReactElement {
  return (
    <nav className="gov-step-bar d-flex align-items-start flex-nowrap overflow-auto mb-4 pb-1"
      role="tablist" aria-label="Pursuit steps">
      {steps.map((s, i) => {
        const status = statuses[s.key];
        const isCurrent = status === 'current';
        const isDone = status === 'done';
        const isLocked = status === 'locked';
        const isFrontier = s.key === frontier;
        const badgeCls = isCurrent
          ? 'bg-primary text-white border-primary'
          : isDone
            ? 'bg-success text-white border-success'
            : isLocked
              ? 'bg-body-secondary text-secondary border-secondary-subtle'
              : 'bg-body text-secondary border-secondary-subtle';
        const labelCls = isCurrent
          ? 'fw-semibold text-primary'
          : isDone
            ? 'text-success-emphasis'
            : isLocked
              ? 'text-secondary opacity-75'
              : isFrontier
                ? 'fw-semibold text-body'
                : 'text-secondary';
        const badgeInner = isDone
          ? <i className="ri-check-line" aria-hidden="true" />
          : isLocked
            ? <i className="ri-lock-2-line" aria-hidden="true" />
            : s.n;
        return (
          <React.Fragment key={s.key}>
            {i > 0 && (
              <div aria-hidden="true" className="flex-grow-1 align-self-start"
                style={{ height: 2, minWidth: 16, marginTop: 18, background: 'var(--bs-border-color)' }} />
            )}
            <button type="button" role="tab" aria-selected={isCurrent}
              aria-current={isCurrent ? 'step' : undefined}
              className="gov-step btn btn-link text-decoration-none d-flex flex-column align-items-center gap-1 px-2 pt-1"
              style={{ minWidth: 132, maxWidth: 160, flex: '0 0 auto' }}
              onClick={() => onStep(s.key)}>
              <span
                className={`d-inline-flex align-items-center justify-content-center rounded-circle border ${badgeCls}`}
                style={{ width: 36, height: 36, fontWeight: 600, fontSize: 15, outline: isFrontier && !isCurrent ? '2px solid var(--bs-primary)' : undefined, outlineOffset: 2 }}>
                {badgeInner}
              </span>
              <span className={`small text-nowrap ${labelCls}`}>
                <i className={`ri-${s.icon} me-1`} aria-hidden="true" />{s.label}
              </span>
              <span className="text-secondary text-center lh-sm" style={{ fontSize: 11, whiteSpace: 'normal' }}>
                {isLocked ? 'After approval' : s.question}
              </span>
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
}
