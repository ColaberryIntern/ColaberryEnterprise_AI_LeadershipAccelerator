import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PresentationStageBody from './PresentationStageBody';
import PresentationTaskAside from './PresentationTaskAside';
import { fetchPortfolio, type Portfolio } from './presentationApi';
import {
  PRESENTATION_STAGES,
  STAGE_META,
  openingStageFor,
  readSavedStage,
  resolveStage,
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
  /**
   * The type a learner asked to start, from an empty portfolio slot or a `?type=`
   * link. Passed DOWN as a prop rather than broadcast: it is a fact this parent
   * knows and exactly one child needs, and an event bus would make it invisible
   * to anyone reading either end.
   */
  const [pendingType, setPendingType] = useState<string | null>(null);
  /**
   * THE PORTFOLIO LIVES HERE, not in the panel, because two things render it:
   * the grid and the sidebar card. Fetched twice they could disagree — the card
   * saying 2 of 7 while the grid shows 3 — and a learner would have no way to
   * know which was right. One fetch, one answer, passed to both.
   */
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);

  const reloadPortfolio = useCallback(async () => {
    if (demo || !projectId || !storyId) return;
    try {
      setPortfolio(await fetchPortfolio(projectId, storyId));
    } catch {
      // The panel renders its own error state; the sidebar simply omits the card.
      setPortfolio(null);
    }
  }, [demo, projectId, storyId]);

  // Only on the step that shows it. Every other stage would be paying for a read
  // nothing on screen uses.
  useEffect(() => {
    if (stage === 'present') void reloadPortfolio();
  }, [stage, reloadPortfolio]);

  // Resume where the student left off — unless the URL says otherwise.
  //
  // A `?step=` in the link BEATS the saved cursor, because the link is a thing
  // somebody just clicked and the cursor is where they happened to be last time.
  // The portfolio's empty slots deep-link to `?step=learn&type=<id>`, and landing
  // on the previously-open step instead would make that link look broken.
  //
  // `resolveStage` rather than a membership test, so a bookmark pointing at the
  // retired `reflect` step still lands on Present & Share.
  useEffect(() => {
    if (!projectId || !storyId) { setRestored(true); return; }
    let fromUrl: PresentationStage | null = null;
    try {
      fromUrl = resolveStage(new URLSearchParams(window.location.search).get('step'));
    } catch {
      /* a malformed query string is not a reason to fail to render the page */
    }
    try {
      const t = new URLSearchParams(window.location.search).get('type');
      if (t) setPendingType(t);
    } catch { /* see above */ }
    if (fromUrl) {
      setStage(fromUrl);
      // Written through, so the cursor agrees with what the learner is looking at.
      saveStage(projectId, storyId, fromUrl);
    } else {
      const saved = readSavedStage(projectId, storyId);
      if (saved) setStage(saved);
    }
    setRestored(true);
  }, [projectId, storyId]);

  /**
   * Start a specific kind of presentation, from an empty portfolio slot.
   *
   * Goes to Learn AND puts the type in the URL. The param is what Learn reads to
   * pre-select the card, and leaving it there means a refresh keeps the learner's
   * intent instead of dropping them on whatever was selected before.
   */
  const startType = useCallback((typeId: string) => {
    setPendingType(typeId);
    setStage('learn');
    if (projectId && storyId) saveStage(projectId, storyId, 'learn');
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('step', 'learn');
      url.searchParams.set('type', typeId);
      window.history.replaceState({}, '', url);
    } catch {
      /* a history API failure must not stop the stage change */
    }
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
            onStartType={startType}
            onBackToPortfolio={() => go('present')}
            pendingType={pendingType}
            portfolio={portfolio}
            onPortfolioChanged={reloadPortfolio}
          />
        </div>

        <PresentationTaskAside
          storyId={storyId}
          isDemoDay={storyId === 'PREP-6'}
          handedIn={Boolean(task?.verifiedAt)}
          points={points}
          storedTitle={task?.title}
          stage={stage}
          portfolio={portfolio?.slots.map((x) => ({
            typeId: x.typeId, typeLabel: x.typeLabel, recorded: x.recorded,
          }))}
        />
      </div>

      {/* Clicking a stage swaps the whole centre column without moving focus, so a
          screen-reader user gets no signal that anything changed. This announces it.
          Visually hidden rather than `hidden`, because `hidden` is not read out. */}
      <div className="ps-sr" role="status" aria-live="polite" data-testid="ps-announce">
        {STAGE_META[stage].label} stage
      </div>

      {/* Exposed for tests: proves the resume effect ran rather than leaving the
          rail on its initial guess. */}
      <span hidden data-testid="ps-restored">{restored ? 'yes' : 'no'}</span>
    </section>
  );
}
