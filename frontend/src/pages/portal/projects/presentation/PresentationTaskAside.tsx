import React from 'react';
import { guideFor } from '../demoPrepGuide';
import { studentTitleFor } from './presentationStages';

/**
 * The Studio's side panel: what this task is, where it stands, and what it pays.
 *
 * Split out of `PresentationStudio.tsx` alongside `PresentationStageBody` when that
 * component's render function exceeded CLAUDE.md's 100-line function ceiling.
 *
 * The states shown here are deliberately NOT one badge. "Handed in", "staff marks this
 * one" and "no room connected" are three different facts, and collapsing them into a
 * single "complete" is how a student ends up told their demo is finished because a
 * webhook fired. PREP-6 in particular must never read as something the student can
 * close themselves.
 */

export interface PresentationTaskAsideProps {
  storyId: string;
  isDemoDay: boolean;
  handedIn: boolean;
  points?: number;
  /** The stored task title, used whenever there is no student-facing override. */
  storedTitle?: string;
  /**
   * Which stage is open. The sidebar is not stage-agnostic any more: the SESSION
   * card points at Practice, which is noise on the step that is ABOUT the
   * portfolio, and the Portfolio card only makes sense there.
   */
  stage?: string;
  /** Seven types and whether each is recorded, for the Portfolio card. */
  portfolio?: Array<{ typeId: string; typeLabel: string; recorded: boolean }>;
  /**
   * The step that actually holds the hand-in, and how to open it.
   *
   * "Pays +40 pts" shows on every step; the control that earns it exists on
   * exactly one. A learner standing on Practice reading "+40 pts" with no way
   * to claim it has been told about a reward and not about the door — asked
   * directly on 2026-10-24: "I don't see how to collect the pts."
   */
  handInStage?: string;
  handInStageLabel?: string;
  onGoToHandIn?: () => void;
}

export default function PresentationTaskAside(props: PresentationTaskAsideProps) {
  const {
    storyId, isDemoDay, handedIn, points, storedTitle, stage, portfolio,
    handInStage, handInStageLabel, onGoToHandIn,
  } = props;
  // Only worth saying when they are NOT already looking at it, and not when
  // staff do the marking — "go and hand in" is a lie on Demo Day.
  const showHandInRoute = Boolean(
    !isDemoDay && !handedIn && handInStage && handInStage !== stage && onGoToHandIn,
  );
  const guide = guideFor(storyId);
  // Display override only. Falls back to the stored title — never to an invented one.
  const title = studentTitleFor(storyId) || storedTitle || 'Demo prep';

  return (
    <aside className="ps-side" aria-label="This task">
      <div className="ps-card">
        <h3>This task</h3>
        <dl className="ps-facts">
          <dt>Task</dt>
          <dd>
            {title}
            {/* The PREP id stays visible: a student saying "PREP-3" to a mentor and a
                mentor searching for it still need to meet in the middle. */}
            {storyId && <span className="ps-id"> · {storyId}</span>}
          </dd>
          <dt>Hand-in</dt>
          <dd>
            {isDemoDay ? (
              <span className="ps-chip ps-chip--idle">Staff marks this one</span>
            ) : handedIn ? (
              <span className="ps-chip ps-chip--ok">Handed in</span>
            ) : (
              <span className="ps-chip ps-chip--wait">Not yet</span>
            )}
          </dd>
          {typeof points === 'number' && points > 0 && (
            <>
              <dt>Pays</dt>
              <dd>
                +{points} pts
                {showHandInRoute && (
                  <>
                    {' '}
                    <button
                      type="button"
                      className="ps-link"
                      data-testid="ps-aside-handin-route"
                      onClick={onGoToHandIn}
                      style={{
                        background: 'none', border: 0, padding: 0, cursor: 'pointer',
                        fontWeight: 600, color: 'var(--ps-accent-soft, #2b6cb0)',
                      }}
                    >
                      Hand in on {handInStageLabel} →
                    </button>
                  </>
                )}
              </dd>
            </>
          )}
        </dl>
      </div>

      {guide && (
        <div className="ps-card">
          <h3>What this asks for</h3>
          {/* Read from demoPrepGuide, which stays the single source of truth for the
              instructions — the Studio surfaces them, it does not restate them. */}
          <p className="ps-note">{guide.what}</p>
        </div>
      )}

      {/* HIDDEN ON PRESENT & SHARE. That step is about the portfolio, and a card
          sending the learner back to Practice is advice they did not ask for in
          the one place it is least relevant. */}
      {stage !== 'present' && (
      <div className="ps-card">
        <h3>Session</h3>
        {/* Points at the stage that owns rooms rather than asserting a state this
            component cannot see. The previous copy said no room was connected, which
            was true while nothing could launch one and became a flat contradiction of
            the Practice stage the moment booking shipped. A sidebar should not be a
            second, staler source of truth about the same fact. */}
        <p className="ps-note ps-note--soft" data-testid="ps-aside-session">
          Reserve or join your practice room on the Practice stage.
        </p>
      </div>
      )}

      {/* The portfolio at a glance, so a learner can see what is left without
          scrolling the grid. Shown only where it means something. */}
      {stage === 'present' && portfolio && portfolio.length > 0 && (
        <div className="ps-card" data-testid="ps-aside-portfolio">
          <h3>Portfolio</h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
            {portfolio.map((p) => (
              <li
                key={p.typeId}
                data-testid={`ps-aside-portfolio-${p.typeId}`}
                style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px dashed var(--slate-200, #e5e7eb)' }}
              >
                <span>{p.typeLabel}</span>
                <span aria-label={p.recorded ? 'recorded' : 'not recorded'} style={{ fontWeight: 700, color: p.recorded ? 'var(--teal-600, #1f8a4c)' : 'var(--slate-400, #9ca3af)' }}>
                  {p.recorded ? '✓' : '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
