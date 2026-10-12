import React from 'react';
import type { LifecycleStatus } from '../../services/projectLifecycleApi';

/**
 * The stage ladder, with where this project sits on it.
 *
 * A PORT of the shape `LifecycleStepper.tsx` established for AI components, not a reuse: that
 * one owns its own ten-state vocabulary and transitions components through authoring states.
 * This renders the project lifecycle's stages and transitions nothing — the only way to move a
 * project is the transition endpoint, which reads the current stage from persisted state rather
 * than trusting a client.
 *
 * Completed stages come from the server. Deriving them here from an index into the stage list
 * would invent a history for a project that had taken a return edge.
 */

const ProjectStageNav: React.FC<{
  status: LifecycleStatus;
  stages: readonly string[];
  onSelect?: (stage: string) => void;
}> = ({ status, stages, onSelect }) => {
  const done = new Set(status.completedStages);

  return (
    <nav className="d-flex gap-2 flex-wrap mb-4" data-testid="lifecycle-stage-nav" aria-label="Project lifecycle stages">
      {stages.map((stage) => {
        const isCurrent = stage === status.stage;
        const isDone = done.has(stage);
        const cls = isCurrent ? 'btn-primary' : isDone ? 'btn-outline-success' : 'btn-outline-secondary';
        return (
          <button
            key={stage}
            type="button"
            className={`btn btn-sm ${cls}`}
            data-testid={`lifecycle-stage-${stage}`}
            data-stage-state={isCurrent ? 'current' : isDone ? 'complete' : 'pending'}
            aria-current={isCurrent ? 'step' : undefined}
            onClick={onSelect ? () => onSelect(stage) : undefined}
          >
            {stage}
          </button>
        );
      })}
    </nav>
  );
};

export default ProjectStageNav;
