import React from 'react';
import type { LifecycleGap, LifecycleStatus } from '../../services/projectLifecycleApi';

/**
 * Where a project stands, readable without opening a log.
 *
 * THREE STATES, RENDERED DIFFERENTLY ON PURPOSE:
 *
 *   READY         nothing blocks the next stage.
 *   BLOCKED       something was measured and it failed.
 *   NOT ASSESSED  nobody looked. This is NOT a pass and NOT a failure, and collapsing it into
 *                 either is the whole reason the gap carries a `kind`.
 *
 * A reviewer seeing "the process graph has no start node" and one seeing "nobody has read the
 * process graph" take different actions. Both still block the transition.
 */

const splitByKind = (gaps: LifecycleGap[]) => ({
  unmet: gaps.filter((g) => g.kind === 'unmet'),
  notAssessed: gaps.filter((g) => g.kind === 'not_assessed'),
});

const GapList: React.FC<{ gaps: LifecycleGap[]; testId: string }> = ({ gaps, testId }) => (
  <ul className="mb-0 ps-3" data-testid={testId}>
    {gaps.map((g) => (
      <li key={`${g.rule}:${g.subject ?? ''}`} data-testid={`${testId}-item`}>
        {g.message}
        {g.subject ? <span className="text-muted small"> ({g.subject})</span> : null}
      </li>
    ))}
  </ul>
);

const ProjectLifecycleHeader: React.FC<{ status: LifecycleStatus }> = ({ status }) => {
  const { unmet, notAssessed } = splitByKind(status.blockers);
  const ready = status.blockers.length === 0;

  return (
    <div className="card border-0 shadow-sm mb-4" data-testid="lifecycle-header">
      <div className="card-body">
        <div className="d-flex align-items-center flex-wrap gap-2 mb-2">
          <span className="fs-5 fw-bold text-primary" data-testid="lifecycle-stage">
            {status.stage}
          </span>
          {status.condition ? (
            <span className="badge bg-warning" data-testid="lifecycle-condition">
              {status.condition}
            </span>
          ) : null}
          {ready ? (
            <span className="badge bg-success" data-testid="lifecycle-state-ready">Ready</span>
          ) : null}
          {unmet.length > 0 ? (
            <span className="badge bg-danger" data-testid="lifecycle-state-blocked">Blocked</span>
          ) : null}
          {notAssessed.length > 0 ? (
            <span className="badge bg-secondary" data-testid="lifecycle-state-not-assessed">
              Not assessed
            </span>
          ) : null}
        </div>

        <div className="mb-3" data-testid="lifecycle-next-action">{status.nextAction}</div>

        {status.nextActorRole ? (
          <div className="text-muted small mb-3" data-testid="lifecycle-next-actor">
            Next actor: {status.nextActorRole}
          </div>
        ) : null}

        {/* Two separate sections, never one merged list. The distinction is the point. */}
        {unmet.length > 0 ? (
          <div className="callout-box mb-3" data-testid="lifecycle-blocked-section">
            <div className="fw-semibold mb-1">Blocked — measured and failing</div>
            <GapList gaps={unmet} testId="lifecycle-blocked-gaps" />
          </div>
        ) : null}

        {notAssessed.length > 0 ? (
          <div className="callout-box" data-testid="lifecycle-not-assessed-section">
            <div className="fw-semibold mb-1">Not assessed — nobody has looked at these yet</div>
            <GapList gaps={notAssessed} testId="lifecycle-not-assessed-gaps" />
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default ProjectLifecycleHeader;
