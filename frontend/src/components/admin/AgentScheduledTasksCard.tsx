import React from 'react';
import { SectionCard, StatCard } from './shell';
import { timeAgo } from './shell/trust';
import type { AgentDetailRelatedTask } from '../../services/agentDetailApi';

// Task visibility (2026-08-26) — Ali, live, looking at Reese's real page:
// "he has task he does that creates tickets... I need to see what those
// are... what triggers them, what they are looking for, why they
// triggered... I should be able to see that." This agent's own real,
// separately-registered recurring jobs (sibling AiAgent rows sharing this
// agent's module — see agentDetailService.ts's related_tasks field), never
// visible on this page before. View-only by deliberate scope: adjusting
// these tasks' thresholds/cadence from the UI is a separate, later decision
// (Ali chose "visibility first" when this was scoped).

interface AgentScheduledTasksCardProps {
  tasks: AgentDetailRelatedTask[];
}

export default function AgentScheduledTasksCard({ tasks }: AgentScheduledTasksCardProps) {
  return (
    <SectionCard
      title="Scheduled tasks"
      icon="calendar-todo-line"
      subtitle="This agent's own real recurring jobs — what triggers them, how often, and whether they're actually running. View-only for now."
    >
      {tasks.length === 0 ? (
        <p className="text-muted mb-0">
          <i className="ri-information-line" aria-hidden="true" /> No other scheduled tasks are registered under
          this agent's module — disclosed honestly rather than guessed.
        </p>
      ) : (
        <div className="d-flex flex-column gap-3">
          {tasks.map((t) => (
            <div key={t.id} className="border rounded p-3">
              <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-1">
                <div className="d-flex align-items-center gap-2">
                  <strong>{t.agent_name}</strong>
                  <span className={`badge ${t.enabled ? 'bg-success-subtle text-success-emphasis' : 'bg-secondary-subtle text-secondary-emphasis'}`}>
                    {t.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>
              {t.description && <p className="text-muted small mb-2">{t.description}</p>}
              <div className="row g-2">
                <div className="col-6 col-lg-3">
                  <StatCard label="Trigger" value={t.trigger_type || '—'} icon="timer-line" tone="neutral" />
                </div>
                <div className="col-6 col-lg-3">
                  <StatCard label="Schedule" value={t.schedule || '—'} icon="calendar-line" tone="neutral" />
                </div>
                <div className="col-6 col-lg-3">
                  <StatCard label="Last run" value={t.last_run_at ? timeAgo(t.last_run_at) : 'Never'} icon="history-line" tone="neutral" />
                </div>
                <div className="col-6 col-lg-3">
                  <StatCard label="Runs / errors" value={`${t.run_count} / ${t.error_count}`} icon="repeat-line" tone={t.error_count > 0 ? 'warning' : 'neutral'} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
