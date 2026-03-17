import React from 'react';

export interface StepInfo {
  key: string;
  label: string;
  icon: string;
  status: 'completed' | 'active' | 'upcoming';
}

interface LessonStepTrackerProps {
  steps: StepInfo[];
  currentStepIndex: number;
}

export default function LessonStepTracker({ steps, currentStepIndex }: LessonStepTrackerProps) {
  if (steps.length === 0) return null;

  return (
    <div className="mb-4" role="navigation" aria-label="Lesson progress">
      <div className="small fw-semibold mb-2" style={{ color: 'var(--color-primary)', fontSize: 12 }}>
        Step {currentStepIndex + 1} of {steps.length} — {steps[currentStepIndex]?.label}
      </div>
      <div className="d-flex align-items-center flex-wrap gap-1">
        {steps.map((step, i) => {
          const isCompleted = step.status === 'completed';
          const isActive = step.status === 'active';

          const circleStyle: React.CSSProperties = {
            width: 28,
            height: 28,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            background: isCompleted ? 'var(--color-accent)' : isActive ? 'var(--color-primary)' : '#f1f5f9',
            color: isCompleted || isActive ? '#fff' : 'var(--color-text-light)',
            fontSize: 13,
            transition: 'background 0.2s ease',
          };

          const labelColor = isCompleted
            ? 'var(--color-accent)'
            : isActive
              ? 'var(--color-primary)'
              : 'var(--color-text-light)';

          return (
            <React.Fragment key={step.key}>
              <div className="d-flex align-items-center gap-1" aria-current={isActive ? 'step' : undefined}>
                <div style={circleStyle}>
                  {isCompleted ? (
                    <i className="bi bi-check-lg" style={{ fontSize: 14 }}></i>
                  ) : (
                    <i className={`bi ${step.icon}`} style={{ fontSize: 12 }}></i>
                  )}
                </div>
                <span
                  className="d-none d-sm-inline fw-medium"
                  style={{ fontSize: 11, color: labelColor, fontWeight: isActive ? 700 : 500 }}
                >
                  {step.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  style={{
                    width: 20,
                    height: 2,
                    background: isCompleted ? 'var(--color-accent)' : 'var(--color-border)',
                    flexShrink: 0,
                    borderRadius: 1,
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
