import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PresentationStageBody from './PresentationStageBody';
import PresentationTaskAside from './PresentationTaskAside';
import {
  PRESENTATION_STAGES,
  STAGE_META,
  openingStageFor,
  readSavedStage,
  saveStage,
  type PresentationStage,
} from './presentationStages';
import './presentationStudio.css';

/**
 * The Presentation Studio — a six-stage workspace laid over a demo-prep task
 * (Learn -> Prepare -> Build -> Practice -> Present -> Reflect & Share).
 *
 * WHAT THIS IS NOT. It is not a replacement for `DemoEvidencePanel`, and it does not
 * take over handing work in. That component is mounted verbatim by
 * `PresentationStageBody` on whichever stage the task opens on, so every capability a
 * student has today — the guide, the link/text toggle, the link-only rule on PREP-2
 * and PREP-5, the staff-marked note on PREP-6, the points — is still exactly where it
 * was, done by the same code. The Studio adds context around it; it removes nothing.
 *
 * HONESTY ABOUT WHAT HAS NOT SHIPPED. Stages whose machinery lands in later phases
 * render a sentence and no control. See `Pending` in `PresentationStageBody`.
 *
 * This component is behind `PRESENTATION_STUDIO_ENABLED`, default OFF. With the flag
 * off the caller renders `DemoEvidencePanel` directly and this file is never mounted,
 * so flag-off is byte-identical to today's workspace.
 *
 * STRUCTURE. The rail and layout live here; the centre column is
 * `PresentationStageBody` and the side panel is `PresentationTaskAside`. They were
 * split out when this render function hit 165 lines against CLAUDE.md's 100-line
 * function ceiling — the rule requires a split before the next change, and doing it
 * while the shape was still fresh was cheaper than doing it later under pressure.
 */

export interface PresentationStudioProps {
  /** The prep task, passed straight through to the evidence panel. */
  task: any;
  /** Backend project id (the route param), never the local store's id. */
  projectId: string;
  /** Story id first (PREP-n), row id as a fallback — resolved server-side. */
  taskId: string;
  points?: number;
  /** Explorer/demo mode: the evidence panel refuses to submit. */
  demo?: boolean;
}

export default function PresentationStudio(props: PresentationStudioProps) {
  const { task, projectId, taskId, points, demo } = props;
  const storyId: string = task?.storyId || '';

  const opening = useMemo(() => openingStageFor(storyId), [storyId]);

  // `openingStageFor` is pure and synchronous, so it is safe in this initializer.
  // The saved cursor is NOT read here: localStorage can throw, and an initializer
  // that throws takes the whole workspace down with it.
  const [stage, setStage] = useState<PresentationStage>(opening);
  const [restored, setRestored] = useState(false);

  // Resume where the student left off. Runs once per task.
  useEffect(() => {
    if (!projectId || !storyId) { setRestored(true); return; }
    const saved = readSavedStage(projectId, storyId);
    if (saved) setStage(saved);
    setRestored(true);
  }, [projectId, storyId]);

  const go = useCallback((next: PresentationStage) => {
    setStage(next);
    if (projectId && storyId) saveStage(projectId, storyId, next);
  }, [projectId, storyId]);

  return (
    <section className="ps-studio" aria-label="Presentation Studio">
      <nav aria-label="Presentation stages">
        <ol className="ps-rail">
          {PRESENTATION_STAGES.map((id, i) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => go(id)}
                aria-current={id === stage ? 'step' : undefined}
                data-testid={`ps-stage-${id}`}
              >
                <span className="ps-num">Step {i + 1}</span>
                {STAGE_META[id].label}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <div className="ps-cols">
        <div className="ps-main">
          <PresentationStageBody
            stage={stage}
            evidenceStage={opening}
            isDemoDay={storyId === 'PREP-6'}
            task={task}
            projectId={projectId}
            taskId={taskId}
            points={points}
            demo={demo}
          />
        </div>

        <PresentationTaskAside
          storyId={storyId}
          isDemoDay={storyId === 'PREP-6'}
          handedIn={Boolean(task?.verifiedAt)}
          points={points}
          storedTitle={task?.title}
        />
      </div>

      {/* Exposed for tests: proves the resume effect ran rather than leaving the
          rail on its initial guess. */}
      <span hidden data-testid="ps-restored">{restored ? 'yes' : 'no'}</span>
    </section>
  );
}
