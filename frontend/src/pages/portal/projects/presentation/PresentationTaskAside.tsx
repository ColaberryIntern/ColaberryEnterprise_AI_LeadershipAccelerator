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
}

export default function PresentationTaskAside(props: PresentationTaskAsideProps) {
  const { storyId, isDemoDay, handedIn, points, storedTitle } = props;
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
              <dd>+{points} pts</dd>
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

      <div className="ps-card">
        <h3>Session</h3>
        {/* Deliberately not a button. Nothing can launch a session until the next
            phase, and a control that does nothing is worse than an honest sentence. */}
        <p className="ps-note ps-note--soft">
          No practice room is connected to this task yet.
        </p>
      </div>
    </aside>
  );
}
