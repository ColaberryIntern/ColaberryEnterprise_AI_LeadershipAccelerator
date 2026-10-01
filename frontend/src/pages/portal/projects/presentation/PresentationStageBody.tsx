import React from 'react';
import DemoEvidencePanel from '../DemoEvidencePanel';
import { STAGE_META, type PresentationStage } from './presentationStages';

/**
 * The centre column of the Presentation Studio: one stage's content.
 *
 * Split out of `PresentationStudio.tsx` because that component's render function
 * reached 165 lines against CLAUDE.md's 100-line hard ceiling for functions. The rule
 * says a function over the ceiling must be split before the next change to it, and
 * splitting it while the structure is still fresh is cheaper than splitting it under
 * pressure later — so the rail/layout stays in the parent and the per-stage body lives
 * here, each well inside the limit and each with one responsibility.
 */

/**
 * A stage whose machinery has not shipped yet.
 *
 * Renders a sentence and NO control, deliberately. A button that looks live and does
 * nothing teaches a student that the platform is broken; an honest "not yet" does not.
 * A test asserts this block contains no button, link or input.
 */
export function Pending({ what, when }: { what: string; when: string }) {
  return (
    <div className="ps-pending" data-testid="ps-pending">
      <strong>{what}</strong>
      {when} Until then, everything you need for this task is on the stage it opens on,
      and nothing here is required to finish it.
    </div>
  );
}

export interface PresentationStageBodyProps {
  stage: PresentationStage;
  /** The stage this task opens on — where the evidence panel is mounted. */
  evidenceStage: PresentationStage;
  isDemoDay: boolean;
  task: any;
  projectId: string;
  taskId: string;
  points?: number;
  demo?: boolean;
}

export default function PresentationStageBody(props: PresentationStageBodyProps) {
  const { stage, evidenceStage, isDemoDay, task, projectId, taskId, points, demo } = props;
  const onEvidenceStage = stage === evidenceStage;

  return (
    <>
      <h2 className="ps-h">{STAGE_META[stage].label}</h2>
      <p className="ps-blurb">{STAGE_META[stage].blurb}</p>

      {/* THE EVIDENCE PANEL IS THE SAME COMPONENT THE TASK ALWAYS USED. Mounted
          verbatim on the stage this task opens on, so the guide, the link-only rule on
          PREP-2/PREP-5, the staff-marked note on PREP-6 and the points all keep working
          because it is literally the same code — not a reimplementation that could drift. */}
      {onEvidenceStage && (
        <DemoEvidencePanel
          task={task}
          projectId={projectId}
          taskId={taskId}
          points={points}
          demo={demo}
        />
      )}

      {stage === 'learn' && (
        <Pending
          what="Worked examples for this presentation type are being written."
          when="They arrive with the seven presentation templates."
        />
      )}

      {stage === 'prepare' && !onEvidenceStage && (
        <Pending
          what="The audience-and-story worksheet is not here yet."
          when="It arrives with the templates, prefilled from your project."
        />
      )}

      {stage === 'build' && !onEvidenceStage && (
        <Pending
          what="The personalised deck prompt is not here yet."
          when="It arrives with the templates, built from your own project's evidence."
        />
      )}

      {stage === 'practice' && !onEvidenceStage && (
        <Pending
          what="Booking a practice room from this page is not wired up yet."
          when="Session launch arrives in the next phase."
        />
      )}

      {stage === 'present' && !isDemoDay && (
        <Pending
          what="Joining your live slot from this page is not wired up yet."
          when="Session launch arrives in the next phase."
        />
      )}

      {stage === 'reflect' && !onEvidenceStage && (
        <Pending
          what="Choosing a final take and sharing it is not here yet."
          when="Reviewed community sharing arrives after recording is attached."
        />
      )}
    </>
  );
}
