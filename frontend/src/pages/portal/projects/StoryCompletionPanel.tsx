import React from 'react';
import { StoryVerificationState } from './useStoryVerification';

/**
 * StoryCompletionPanel — the completion gate, and the moment it opens.
 *
 * COMPLETION IS GRANTED, NEVER CLAIMED. The only thing that unlocks the button
 * is `verified_at`, a one-way latch the platform stamps after reading the repo.
 * The server already refuses a client-set `complete` with a 409, so an enabled
 * button before verification would be an invitation to a rejected request.
 *
 * A DISABLED BUTTON MUST SAY WHY. A student staring at a dead grey control can
 * see that something is wrong and has no idea what, which is worse than the
 * button not being there. So the panel above it names the outstanding criteria
 * verbatim from the published plan, plus the missing commit — the two halves of
 * the rule fail independently and are reported independently.
 *
 * Amber rather than red throughout: nothing has gone wrong, the work is simply
 * not finished yet, and a red panel would read as an error the student caused.
 */
export interface StoryCompletionPanelProps {
  verif: StoryVerificationState;
  storyKey: string;
  /** The student has already filed this away locally; the panel steps aside. */
  locallyDone: boolean;
  onMarkDone: () => void;
  onSkip: () => void;
}

const StoryCompletionPanel: React.FC<StoryCompletionPanelProps> = ({
  verif, storyKey, locallyDone, onMarkDone, onSkip,
}) => {
  const verified = Boolean(verif.verifiedAt);

  return (
    <>
      {/* THE MOMENT. Rendered only on a transition the page actually witnessed —
          `phase` reaches 'verified' exclusively when this story crossed the line
          while open. Re-opening a finished story shows the header pill, not a
          re-enactment of something that happened last week. */}
      {verif.phase === 'verified' && (
        <div className="rt-verified" role="status">
          <span className="rt-verified-mark" aria-hidden="true">✓</span>
          <div>
            <div className="rt-verified-t">Verified from your repo</div>
            <div className="rt-verified-s">
              {verif.view?.verification?.commit_sha
                ? <>Confirmed against commit <code>{verif.view.verification.commit_sha.slice(0, 7)}</code>.</>
                : <>Every criterion confirmed, and a commit names this story.</>}
            </div>
          </div>
          {/* Points appear only when there are points. `builder_xp` is NULL in
              points_config until somebody sets it, and celebrating "+0 XP" would
              be announcing a number nobody has chosen. */}
          {verif.xpAwarded > 0 && <span className="rt-verified-xp">+{verif.xpAwarded} XP</span>}
        </div>
      )}

      {!locallyDone && (
        <div style={{ marginTop: 16 }}>
          {!verified && verif.loaded && verif.missing.length > 0 && (
            <div className="rt-waiting">
              <div className="rt-waiting-h">
                Waiting on GitHub to confirm {verif.missing.length === 1 ? '1 thing' : `${verif.missing.length} things`}
              </div>
              <ul className="rt-waiting-l">
                {verif.missing.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}

          {!verified && verif.blockedReason && (
            <div className="rt-waiting">
              <div className="rt-waiting-h">This story cannot be verified automatically</div>
              <p className="rt-waiting-p">{verif.blockedReason} Tell your instructor.</p>
            </div>
          )}

          {/* Never checked — say which, rather than showing a locked control with
              no explanation while the platform has simply never looked. */}
          {!verified && verif.loaded && !verif.view?.verification && !verif.blockedReason && (
            <div className="rt-waiting">
              <div className="rt-waiting-h">Not checked yet</div>
              <p className="rt-waiting-p">
                Connect your repo and push a commit naming {storyKey}. The platform reads
                <code> .colaberry/progress.json</code> and your commits, then confirms this story itself.
              </p>
            </div>
          )}

          <div className="rt-row">
            <button
              className="rt-btn cta"
              disabled={!verified}
              aria-disabled={!verified}
              title={verified ? undefined : 'Unlocks once the platform confirms this story from your repo'}
              onClick={() => { if (verified) onMarkDone(); }}
            >
              {verified ? 'Mark done' : 'Mark done — waiting on GitHub'}
            </button>
            {/* Skipping a story the platform just verified makes no sense — the
                work is done and the credit is already banked. */}
            {!verified && <button className="rt-btn" onClick={onSkip}>Skip</button>}
          </div>
        </div>
      )}
    </>
  );
};

export default StoryCompletionPanel;
