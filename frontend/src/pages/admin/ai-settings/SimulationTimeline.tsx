import React from 'react';

interface SimStep {
  id: string;
  step_index: number;
  channel: string;
  status: string;
  original_delay_days: number;
  compressed_delay_ms: number;
  wait_started_at: string | null;
  executed_at: string | null;
  duration_ms: number | null;
  ai_content: { subject?: string; body?: string; tokens_used?: number; model?: string } | null;
  lead_response: { outcome?: string; response_text?: string; responded_at?: string } | null;
  details: Record<string, any> | null;
  error_message: string | null;
  definition: {
    channel?: string;
    subject?: string;
    step_goal?: string;
    ai_instructions?: string;
    delay_days?: number;
  } | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#adb5bd',
  waiting: '#0d6efd',
  executing: '#0d6efd',
  sent: '#198754',
  responded: '#0dcaf0',
  skipped: '#ffc107',
  failed: '#dc3545',
};

const CHANNEL_ICONS: Record<string, string> = {
  email: '\u2709',
  sms: '\ud83d\udcf1',
  voice: '\ud83d\udcde',
};

function formatDelay(ms: number): string {
  if (ms === 0) return 'Instant';
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `${min}m ${rem}s` : `${min}m`;
}

export default function SimulationTimeline({
  steps,
  currentStepIndex,
  onJump,
}: {
  steps: SimStep[];
  currentStepIndex: number;
  onJump?: (index: number) => void;
}) {
  return (
    <div className="position-relative" style={{ paddingLeft: 28 }}>
      {/* Vertical line */}
      <div
        className="position-absolute"
        style={{
          left: 10,
          top: 8,
          bottom: 8,
          width: 2,
          backgroundColor: 'var(--color-border, #e2e8f0)',
        }}
      />

      {steps.map((step) => {
        const isCurrent = step.step_index === currentStepIndex;
        const dotColor = STATUS_COLORS[step.status] || '#adb5bd';
        const isClickable = onJump && step.status === 'pending';

        return (
          <div
            key={step.id}
            className={`position-relative mb-2 ${isClickable ? '' : ''}`}
            style={{ cursor: isClickable ? 'pointer' : 'default' }}
            onClick={() => isClickable && onJump(step.step_index)}
            role={isClickable ? 'button' : undefined}
            tabIndex={isClickable ? 0 : undefined}
            onKeyDown={(e) => isClickable && e.key === 'Enter' && onJump(step.step_index)}
          >
            {/* Dot */}
            <div
              className="position-absolute rounded-circle"
              style={{
                left: -22,
                top: 8,
                width: isCurrent ? 14 : 10,
                height: isCurrent ? 14 : 10,
                backgroundColor: dotColor,
                border: `2px solid ${isCurrent ? 'white' : dotColor}`,
                boxShadow: isCurrent ? `0 0 0 2px ${dotColor}` : 'none',
                transition: 'all 0.2s',
              }}
            />

            {/* Step card */}
            <div
              className={`card border-0 ${isCurrent ? 'shadow' : 'shadow-sm'}`}
              style={{
                borderLeft: isCurrent ? `3px solid ${dotColor}` : undefined,
                opacity: step.status === 'pending' ? 0.6 : 1,
              }}
            >
              <div className="card-body py-2 px-3">
                <div className="d-flex justify-content-between align-items-center">
                  <div className="d-flex gap-2 align-items-center">
                    <span className="small fw-bold text-muted">#{step.step_index + 1}</span>
                    <span style={{ fontSize: '1rem' }}>{CHANNEL_ICONS[step.channel] || ''}</span>
                    <span className="badge bg-secondary" style={{ fontSize: '0.6rem', textTransform: 'uppercase' }}>
                      {step.channel}
                    </span>
                    {step.definition?.step_goal && (
                      <span className="small text-muted text-truncate" style={{ maxWidth: 180 }}>
                        {step.definition.step_goal}
                      </span>
                    )}
                  </div>
                  <div className="d-flex gap-1 align-items-center">
                    {step.original_delay_days > 0 && (
                      <span className="badge bg-light text-dark" style={{ fontSize: '0.6rem' }}>
                        Day {step.original_delay_days}
                      </span>
                    )}
                    {step.compressed_delay_ms > 0 && (
                      <span className="badge bg-light text-dark" style={{ fontSize: '0.6rem' }}>
                        {formatDelay(step.compressed_delay_ms)}
                      </span>
                    )}
                    <span
                      className="badge"
                      style={{
                        fontSize: '0.6rem',
                        backgroundColor: dotColor,
                        color: step.status === 'waiting' || step.status === 'executing' ? '#fff' : undefined,
                      }}
                    >
                      {step.status}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export type { SimStep };
