/**
 * One queue for everything waiting on the approver, sorted by how long it has waited.
 *
 * ## The merge, and what deliberately did NOT merge
 *
 * Tool grants moved to their own screen on 17 Nov 2026 because two buttons are the wrong control
 * for a decision that lets an agent start acting. That was right about the decision and wrong
 * about the queue: with two inboxes, the oldest thing waiting is the one nobody opens. Measured on
 * 25 Nov, the admissions builder's capability request had been submitted for **eleven whole days** while
 * a two-day-old platform request was being chased by email.
 *
 * So this component merges the LIST and keeps the CONTROLS apart. Every kind appears in one
 * age-sorted queue; each row offers only the verbs its own kind supports, and a tool row still
 * links through to the full case for its duplicate check and decision package. Nothing was taken
 * away from the tool console; what was taken away was having to remember it exists.
 *
 * ## The age bar is the point of the header
 *
 * A count tells an approver how much work there is. The bar tells them that one person has been
 * waiting far longer than the rest, which is the fact that actually changes what they do first.
 */
import React, { useMemo, useState } from 'react';
import type { ChangeRequest } from '../../services/agentDomainApi';
import ApprovalRow from './ApprovalRow';
import {
  ApprovalFilter, ageBand, ageDays, ageLabel, matchesFilter, oldestFirst, queueHeadline,
} from './approvalQueueModel';

const BAR: Record<ReturnType<typeof ageBand>, string> = {
  overdue: 'bg-danger',
  ageing: 'bg-warning',
  fresh: 'bg-secondary-subtle',
  none: 'bg-light',
};

export interface ApprovalQueueProps {
  requests: ReadonlyArray<ChangeRequest>;
  /** Ids of the viewer's OWN requests, from the self-scoped endpoint. */
  mineIds: ReadonlySet<string>;
  busyId: string;
  problem?: string;
  onDecide: (id: string, kind: ChangeRequest['kind'], verb: string, reason: string) => void;
  now?: Date;
}

export default function ApprovalQueue({
  requests, mineIds, busyId, problem, onDecide, now,
}: ApprovalQueueProps): React.ReactElement {
  const [filter, setFilter] = useState<ApprovalFilter>('all');

  const sorted = useMemo(
    () => [...requests].sort(oldestFirst),
    [requests, now],
  );
  const shown = sorted.filter((r) => matchesFilter(r, filter, mineIds));

  const counts = {
    all: sorted.length,
    change: sorted.filter((r) => r.kind === 'change').length,
    tool: sorted.filter((r) => r.kind === 'tool').length,
    mine: sorted.filter((r) => matchesFilter(r, 'mine', mineIds)).length,
  };

  const chips: Array<{ key: ApprovalFilter; label: string }> = [
    { key: 'all', label: 'Everything' },
    { key: 'change', label: 'Change requests' },
    { key: 'tool', label: 'Tool grants' },
    { key: 'mine', label: 'Filed by me' },
  ];

  return (
    <section aria-labelledby="approval-queue-heading">
      <div className="card border-0 shadow-sm mb-3">
        <div className="card-body">
          <h2 className="h5 fw-bold mb-1" id="approval-queue-heading">Waiting on you</h2>
          <p className="mb-1">{queueHeadline(sorted, now)}</p>
          {/* Verbatim, and pinned by AdminChangeRequestsPage.test.tsx. A button labelled
              "Approve" invites the reader to assume a build follows, so the page says
              otherwise in its own words. "Starts no build" is NOT the same promise: a build is
              one kind of work and this starts none of them. */}
          <p className="text-muted small mb-2">
            Approving records that you approved it, and when. It does not start any work.
          </p>

          {sorted.length > 0 && (
            <>
              <div
                className="d-flex gap-1 rounded overflow-hidden mb-1"
                style={{ height: '30px' }}
                role="img"
                aria-label={`Ages of the ${sorted.length} waiting requests, longest first: ${sorted.map((r) => ageLabel(ageDays(r.requested_at, now))).join(', ')}.`}
              >
                {sorted.map((r) => {
                  const d = ageDays(r.requested_at, now);
                  return (
                    <div
                      key={r.id}
                      className={`${BAR[ageBand(d)]} d-flex align-items-center justify-content-center text-white fw-bold`}
                      style={{ flex: Math.max(1, d ?? 1), fontSize: '11px', minWidth: '30px' }}
                    >
                      {d === null ? '?' : `${d}d`}
                    </div>
                  );
                })}
              </div>
              <p className="text-muted mb-0" style={{ fontSize: '12.5px' }}>
                Sorted by how long somebody has been waiting, not by what arrived last.
              </p>
            </>
          )}
        </div>
      </div>

      <div className="d-flex gap-2 flex-wrap mb-3" role="group" aria-label="Filter the queue">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`btn btn-sm rounded-pill ${filter === c.key ? 'btn-primary' : 'btn-outline-secondary'}`}
            aria-pressed={filter === c.key}
            onClick={() => setFilter(c.key)}
          >
            {c.label}
            {' '}
            {counts[c.key]}
          </button>
        ))}
      </div>

      {problem && <div className="alert alert-danger py-2 px-3 small">{problem}</div>}

      {shown.length === 0 && (
        <p className="text-muted small">
          {sorted.length === 0
            ? 'Nothing is waiting on you.'
            : 'Nothing in this filter. Everything waiting is under another one.'}
        </p>
      )}

      {shown.map((r) => (
        <ApprovalRow
          key={r.id}
          request={r}
          busy={busyId === r.id}
          onDecide={onDecide}
          now={now}
        />
      ))}
    </section>
  );
}
