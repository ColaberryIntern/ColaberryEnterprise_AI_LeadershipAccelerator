import React from 'react';
import type { GroupedTask, TaskTool, ToolState } from '../../../services/agentDomainApi';

/**
 * AF12.1 — the task beside the request, so a tool is not decided in isolation.
 *
 * Ali, 17 Nov 2026: *"I think we need to do a better job of differentiating between a task and a
 * tool. They can be the same, but they can also be different and you have a task that uses
 * multiple tools."*
 *
 * ## Why this panel is not optional
 *
 * Reading a table, reading another system and writing a report are three grants with three
 * different blast radiuses, so they arrive as three requests. Deciding the second one without
 * seeing the other two is deciding blind: approve the read and deny the write and the task is
 * still not done, while the agent now holds a permission for work it cannot complete. The panel is
 * the only place that is visible before the decision rather than after it.
 *
 * ## A task of one tool still says so
 *
 * "This task needs one tool" is a real answer and the one that makes the panel trustworthy on the
 * requests where it matters. A panel that appeared only sometimes would leave a reader unsure
 * whether its absence meant one tool or a lookup that failed.
 *
 * ## Never the word "granted"
 *
 * An approved request means a human said yes. The grant is a separate record in
 * `agent_domain_tool_grants`, and the agent holding the tool is a third thing again — a grant
 * routinely lands with the agent still unable to use it, which `GrantOutcomePanel` reports. So the
 * states here are approved to build, waiting, declined and withdrawn, and the vocabulary matches
 * `taskGrouping.ts` on the server exactly.
 */

const STATE: Record<ToolState, { label: string; cls: string; icon: string }> = {
  waiting_on_a_decision: { label: 'waiting on you', cls: 'bg-warning text-dark', icon: 'time-line' },
  approved_to_build: { label: 'approved to build', cls: 'bg-success', icon: 'checkbox-circle-line' },
  declined: { label: 'declined', cls: 'bg-secondary', icon: 'close-circle-line' },
  withdrawn: { label: 'withdrawn', cls: 'bg-light text-dark border', icon: 'corner-up-left-line' },
};

function ToolRow({ tool, isThisOne }: { tool: TaskTool; isThisOne: boolean }) {
  const s = STATE[tool.state];
  return (
    <div
      className={`d-flex align-items-start gap-2 py-2 ${isThisOne ? '' : 'border-top'}`}
      data-testid={`task-tool-${tool.request_id}`}
    >
      <span className={`badge ${s.cls}`}>
        <i className={`ri-${s.icon} me-1`} aria-hidden="true" />
        {s.label}
      </span>
      <span className="flex-grow-1 small">
        <code>{tool.tool_name || 'unnamed'}</code>
        {isThisOne && <span className="badge bg-primary ms-2">this one</span>}
        <span className="d-block text-muted">{tool.title}</span>
        {/* Why it is not in front of a human, in the readiness check's own words. A reader who
            sees "waiting" with no reason assumes it is their turn on all of them. */}
        {!tool.ready_to_decide && tool.not_ready_because.length > 0 && (
          <span className="d-block text-muted" style={{ fontSize: '0.72rem' }}>
            {`Not readable yet: ${tool.not_ready_because.join(', ').replace(/_/g, ' ')}`}
          </span>
        )}
      </span>
    </div>
  );
}

export default function TaskPanel({
  task,
  requestId,
  problem,
}: {
  /** Null means this request belongs to no task, which the panel states rather than hides. */
  task: GroupedTask | null;
  requestId: string;
  /** Set when the task read failed. A failure must never render as "no task". */
  problem?: string;
}) {
  if (problem) {
    return (
      <div className="alert alert-danger small mb-0" role="alert" data-testid="task-panel-problem">
        {problem} Decide this one on its own if you need to, but you are not seeing whatever else
        the same task may need.
      </div>
    );
  }

  if (!task) {
    return (
      <div className="small text-muted mb-0" data-testid="task-panel-none">
        This request names no task, so there is nothing to decide alongside it. Change requests
        carry no task key by design; a tool request without one was filed before the key existed.
      </div>
    );
  }

  const siblings = task.tools.filter((t) => t.request_id !== requestId);

  return (
    <div data-testid="task-panel">
      <div className="d-flex flex-wrap align-items-baseline gap-2 mb-1">
        <span className="fw-semibold small">{task.task_label}</span>
        <code className="small text-muted">{task.task_key}</code>
      </div>

      {/* The alternatives, kept rather than dropped. Several builders typing their own sentence
          for one task is normal, and a quietly discarded wording looks like a mistake later. */}
      {task.other_labels.length > 0 && (
        <div className="form-text mb-2">
          {`Also described as: ${task.other_labels.join('; ')}`}
        </div>
      )}

      {siblings.length === 0 ? (
        <div className="small text-muted" data-testid="task-panel-solo">
          This task needs one tool, the one you are looking at. Nothing else is waiting behind it.
        </div>
      ) : (
        <>
          <div className="small mb-1">
            {`This task needs ${task.tools.length} tools. `}
            {task.waiting_on_a_decision > 1
              ? <strong>{`${task.waiting_on_a_decision} of them are waiting on you.`}</strong>
              : task.waiting_on_a_decision === 1
                ? 'This is the last one waiting on you.'
                : 'None of the others is waiting on you.'}
          </div>
          <div className="mb-0">
            {task.tools.map((t) => (
              <ToolRow key={t.request_id} tool={t} isThisOne={t.request_id === requestId} />
            ))}
          </div>
          {/* The honest reading of AF10.9's rung 4, stated where the decision is made. */}
          <div className="form-text mt-2">
            {task.every_tool_decided
              ? 'Every tool this task needs has been decided. The agent can be watched doing it once the approved ones are built.'
              : 'The agent cannot do this task watched until every tool it needs exists. Approving one of several does not get there.'}
          </div>
        </>
      )}
    </div>
  );
}
