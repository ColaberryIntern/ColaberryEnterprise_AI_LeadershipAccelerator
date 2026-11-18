import React from 'react';
import type { ChangeRequest, GroupedTask } from '../../../services/agentDomainApi';
import {
  ageDays,
  ageTone,
  readinessOf,
  riskOf,
  suggestedStep,
  TONE_CLASS,
  TONE_ICON,
} from './queueSignals';

/**
 * AF12.3 — one request in the overview, as a card you click to open.
 *
 * Ali, 17 Nov 2026: *"When the request comes in make sure I can see an overview and click on it to
 * get the highly formatted details."*
 *
 * ## What a row has to answer before it is opened
 *
 * The old row answered "what is it called" and "who filed it". It could not answer the three
 * questions that decide whether to open it at all: can I act on this, what would it let the agent
 * do, and how long has it sat there. Those are the readiness meter, the risk strip and the age
 * chip, and they are on the face of the card.
 *
 * ## The meter is a share of ten real blocks
 *
 * Not a confidence score and not a percentage of anything invented. Ten blocks, counted from the
 * API's own readiness output, so a card reading 70% names three blocks nobody has answered and the
 * send-back writes itself. A meter that moved on anything softer than that would be decoration
 * wearing the clothes of evidence.
 *
 * ## Icons rather than emoji, which is what Ali's ask actually needed
 *
 * He asked for *"icons, emojis, visuals"*, meaning a card readable at a glance. The repo's
 * `frontendTypographyLint` gate refuses emoji in product copy and names the supported alternative:
 * an icon component. That gate is right, and the emoji would have carried nothing anyway — every
 * one sat beside a word and an icon already saying the same thing, which is the rule that kept
 * them from being the sole carrier of meaning in the first place. So the glance comes from the
 * icon, the tone color and the word together, and a reader using a screen reader, a monochrome
 * print or a font without the glyph gets the same card.
 */

export default function QueueCard({
  request,
  task,
  selected,
  onOpen,
  now,
}: {
  request: ChangeRequest;
  /** The task this request belongs to, when it belongs to one. */
  task: GroupedTask | null;
  selected: boolean;
  onOpen: () => void;
  now?: Date;
}) {
  const ready = readinessOf(request.readiness);
  const risk = riskOf(request.tool_request);
  const days = ageDays(request.requested_at, now);
  const aTone = ageTone(days);
  const step = suggestedStep(request, now);
  const waiting = request.status === 'submitted';

  // The left edge carries the single most important fact about the card. For something waiting
  // that is what to do next; for something settled it is that it is settled, because a decided
  // request showing a red "send it back" edge would be arguing for work already done.
  const edge = waiting ? step.tone : 'unknown';

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected}
      data-testid={`queue-card-${request.id}`}
      className={`card w-100 text-start mb-2 shadow-sm ${selected ? 'border-primary border-2' : 'border-0'}`}
      style={{ borderLeft: `6px solid var(--bs-${edge === 'ready' ? 'success' : edge === 'attention' ? 'warning' : edge === 'hazard' ? 'danger' : 'secondary'})` }}
    >
      <div className="card-body p-3">
        <div className="d-flex align-items-start gap-2">
          <span className="flex-grow-1">
            <span className="d-block fw-semibold small">
              {request.tool_request?.tool_name
                ? <code>{request.tool_request.tool_name}</code>
                : <span className="text-danger">no details stored</span>}
            </span>
            <span className="d-block small text-muted">{request.title}</span>
          </span>
          <span className={`badge ${TONE_CLASS[aTone]}`} title="How long this has been waiting">
            {days === null ? 'no date' : days === 0 ? 'today' : `${days}d`}
          </span>
        </div>

        {/* THE READINESS METER. The number is beside the bar, because a bar alone cannot say
            which blocks are missing and the count is what the send-back names. */}
        <div className="mt-2">
          <div className="d-flex align-items-center gap-2" style={{ fontSize: '0.75rem' }}>
            <span className="text-muted">Ready</span>
            <span className="flex-grow-1 progress" style={{ height: 6 }} role="presentation">
              <span
                className={`progress-bar ${TONE_CLASS[ready.tone]}`}
                style={{ width: `${ready.percent}%` }}
                data-testid={`readiness-${request.id}`}
              />
            </span>
            <span className="fw-medium">
              {`${ready.blocks_standing}/${ready.blocks_total}`}
            </span>
          </div>
        </div>

        {/* THE RISK STRIP. What approving it would let the agent do, before anybody opens it. */}
        <div className="d-flex flex-wrap gap-1 mt-2">
          <span className={`badge ${TONE_CLASS[risk.tone]}`} title="What approving this would let the agent do">
            <i className={`ri-${TONE_ICON[risk.tone]} me-1`} aria-hidden="true" />
            {risk.label}
          </span>
          {risk.chips.map((c) => (
            <span key={c.label} className="badge bg-light text-dark border">
              <i className={`ri-${c.icon} me-1`} aria-hidden="true" />
              {c.label}
            </span>
          ))}
        </div>

        {/* AF12.1 — the task, when there is one. A tool decided without its siblings is decided
            blind, and this is the first place that becomes visible. */}
        {task && (
          <div className="mt-2 small" data-testid={`task-of-${request.id}`}>
            <i className="ri-git-branch-line text-muted me-1" aria-hidden="true" />
            <span className="text-muted">Part of </span>
            <span className="fw-medium">{task.task_label}</span>
            {task.tools.length > 1 && (
              <span className="text-muted">
                {`, ${task.tools.length} tools, ${task.waiting_on_a_decision} still waiting`}
              </span>
            )}
          </div>
        )}

        {/* WHAT TO DO NEXT. A suggestion with its evidence, never a preselected verb. */}
        <div className={`alert alert-${step.tone === 'ready' ? 'success' : step.tone === 'attention' ? 'warning' : step.tone === 'hazard' ? 'danger' : 'secondary'} py-1 px-2 mt-2 mb-0`} style={{ fontSize: '0.75rem' }}>
          <span className="fw-semibold">
            <i className={`ri-${step.icon} me-1`} aria-hidden="true" />
            {step.label}
          </span>
          <span className="d-block">{step.because}</span>
        </div>

        <div className="text-muted mt-2" style={{ fontSize: '0.72rem' }}>
          {`${request.domain_key} · ${request.requested_by_identity}`}
        </div>
      </div>
    </button>
  );
}
