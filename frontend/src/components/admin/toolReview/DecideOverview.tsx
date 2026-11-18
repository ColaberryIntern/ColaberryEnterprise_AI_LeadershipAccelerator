import React from 'react';
import type { ChangeRequest, GroupedTask } from '../../../services/agentDomainApi';
import {
  queueSummary,
  TONE_CLASS,
  TONE_ICON,
  type Tone,
} from './queueSignals';

/**
 * AF12.3 — the overview above the decide queue.
 *
 * Ali, 17 Nov 2026: *"When the request comes in make sure I can see an overview and click on it to
 * get the highly formatted details. Make it visual... Conditional formatting, icons, emojis,
 * visuals etc to help me decide what the next step should be."*
 *
 * ## The number that was missing
 *
 * The old screen said how many requests existed. The question it could not answer is how many of
 * them a person can actually act on, and those are different numbers: a request whose decision
 * package has holes in it is in the queue and is not decidable. Leading with one figure told Ali
 * to sit down to four decisions he could not make. **Ready to decide** and **held back** are the
 * first two tiles, in that order, and they always add up to what is waiting.
 *
 * ## One chart, and it is bars
 *
 * Horizontal ranked bars of what is waiting, grouped by its next step. One series, so no legend —
 * the row labels name themselves. No pie, because the question is "how many of each" and an angle
 * is harder to read than a length. No second axis, ever. Each bar carries its own number as a
 * direct label rather than relying on an axis the reader has to trace back.
 *
 * The bar widths are a share of the largest bar, not of the total, so a queue of four with one of
 * each next step is four full-ish bars instead of four slivers. The label states the count, so the
 * width is the comparison and the number is the fact.
 *
 * ## The colors mean something
 *
 * Green ready, amber attention, red hazard, gray unknown: the same four tones as the rows below,
 * from the same `TONE_CLASS` map, so a thing is never drawn one way here and another way there.
 * Nothing is colored for emphasis.
 */

function Tile({
  label, value, tone, icon, hint, testId,
}: {
  label: string;
  value: string | number;
  tone: Tone;
  icon: string;
  hint?: string;
  testId?: string;
}) {
  return (
    <div className="col-6 col-md-3">
      <div className="card border-0 shadow-sm h-100">
        <div className="card-body text-center p-3">
          <div className={`badge ${TONE_CLASS[tone]} mb-2`}>
            <i className={`ri-${icon}`} aria-hidden="true" />
          </div>
          <div className="fs-4 fw-bold" data-testid={testId}>{value}</div>
          <div className="text-muted small">{label}</div>
          {hint && <div className="text-muted" style={{ fontSize: '0.72rem' }}>{hint}</div>}
        </div>
      </div>
    </div>
  );
}

export default function DecideOverview({
  requests,
  tasks,
  now,
}: {
  requests: ReadonlyArray<ChangeRequest>;
  /** AF12.1. Null while the task read has not answered, which is not the same as none. */
  tasks: ReadonlyArray<GroupedTask> | null;
  now?: Date;
}) {
  const s = queueSummary(requests, now);
  const biggest = Math.max(1, ...s.by_step.map((x) => x.count));

  // A task is "half decided" when some of its tools are settled and some are not. It is the state
  // the old screen could not show at all, and the one that most often means a decision was made
  // without its context.
  const halfDecided = (tasks ?? []).filter(
    (t) => t.waiting_on_a_decision > 0 && t.approved_to_build > 0,
  );

  return (
    <div data-testid="decide-overview">
      <div className="row g-3 mb-3">
        <Tile
          label="Ready to decide"
          value={s.decidable}
          tone={s.decidable > 0 ? 'ready' : 'unknown'}
          icon={TONE_ICON.ready}
          hint="All ten blocks standing"
          testId="kpi-decidable"
        />
        <Tile
          label="Held back"
          value={s.blocked}
          tone={s.blocked > 0 ? 'attention' : 'ready'}
          icon={TONE_ICON.attention}
          hint="Waiting, but not yet readable"
          testId="kpi-blocked"
        />
        <Tile
          label="Needs care"
          value={s.hazardous}
          tone={s.hazardous > 0 ? 'hazard' : 'ready'}
          icon={TONE_ICON.hazard}
          hint="Production writes that cannot be undone"
          testId="kpi-hazardous"
        />
        <Tile
          label="Oldest waiting"

          tone={s.oldest_waiting_days === null
            ? 'unknown'
            : s.oldest_waiting_days >= 5 ? 'hazard' : s.oldest_waiting_days >= 2 ? 'attention' : 'ready'}
          icon="time-line"
          hint={s.stale > 0 ? `${s.stale} over five days` : 'Nothing is stale'}
          testId="kpi-oldest"
        />
      </div>

      {s.waiting === 0 ? (
        <div className="alert alert-light border small mb-0" role="status">
          <i className="ri-checkbox-circle-line text-success me-1" aria-hidden="true" />
          Nothing is waiting on a decision.
          {s.settled > 0 && ` ${s.settled} settled request${s.settled === 1 ? '' : 's'} ${s.settled === 1 ? 'is' : 'are'} below for the record.`}
        </div>
      ) : (
        <div className="card border-0 shadow-sm" data-testid="next-step-chart">
          <div className="card-header bg-white py-2">
            <span className="fw-semibold small">What the {s.waiting} waiting need next</span>
            <span className="text-muted small ms-2">
              A suggestion from what each one carries. Nothing is preselected and nothing suggests
              approving.
            </span>
          </div>
          <div className="card-body py-2">
            {s.by_step.map((row) => (
              <div className="mb-2" key={row.verb}>
                <div className="d-flex align-items-center gap-2 small">
                  <span className="flex-grow-1">{row.label}</span>
                  {/* The direct label. No axis to trace back to. */}
                  <strong data-testid={`bar-count-${row.verb}`}>{row.count}</strong>
                </div>
                <div className="progress" style={{ height: 8 }} role="presentation">
                  <div
                    className={`progress-bar ${TONE_CLASS[row.tone]}`}
                    style={{ width: `${Math.round((row.count / biggest) * 100)}%` }}
                    data-testid={`bar-${row.verb}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AF12.1. Rendered only when a task really is half decided: an empty panel about tasks
          would be noise on a queue where every task needs one tool. */}
      {halfDecided.length > 0 && (
        <div className="alert alert-warning small mt-3 mb-0" role="alert" data-testid="half-decided-tasks">
          <div className="fw-semibold">
            <i className="ri-git-branch-line me-1" aria-hidden="true" />
            {halfDecided.length === 1
              ? 'One task is half decided.'
              : `${halfDecided.length} tasks are half decided.`}
          </div>
          <div>
            Some of their tools are approved and others are still waiting, so the task cannot be
            done yet. Deciding the rest together is the point of the task key.
          </div>
          <ul className="mb-0 mt-1">
            {halfDecided.slice(0, 4).map((t) => (
              <li key={`${t.domain_key}::${t.task_key}`}>
                {t.task_label}
                <span className="text-muted">
                  {`, ${t.approved_to_build} approved, ${t.waiting_on_a_decision} waiting`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
