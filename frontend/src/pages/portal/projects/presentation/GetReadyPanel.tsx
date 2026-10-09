import React, { useCallback, useState } from 'react';
import { launchPractice, LaunchNotReadyError, type LaunchBrief } from './presentationApi';

/**
 * The screen between "I have a room" and "I am in a recorded call".
 *
 * WHY THERE IS A STEP HERE AT ALL. A student should never discover after the fact
 * that the session was recording, or that the room was visible to their cohort. Both
 * facts are shown before they commit, and the Join control stays disabled until they
 * have said they read them.
 *
 * THE FACTS COME FROM THE SESSION, NOT FROM A CONSTANT. An earlier draft of this
 * panel hardcoded "only you" and "records automatically". That is true of a solo
 * rehearsal and false of demo day, and a screen whose entire job is informed consent
 * cannot be the thing that misinforms. Both lines are derived from the attempt's real
 * mode and the room's real recording policy.
 *
 * POPUP BLOCKERS ARE THE NORMAL CASE, NOT AN EDGE CASE. `window.open` from an async
 * callback is blocked by default in Safari and by many extensions, and it signals
 * that by returning null rather than throwing. The link is then kept in state and
 * offered as an ordinary anchor — the launch is NOT re-requested, so one intent stays
 * one join event and nothing about the student's prep is lost.
 *
 * `noopener` so the meeting tab cannot reach back into the portal via window.opener.
 */

export interface GetReadyPanelProps {
  projectId: string;
  storyId: string;
  attemptId: string;
  /** From the session, so the panel describes THIS room rather than a typical one. */
  mode: string;
  recordingPolicy: string | null;
  demo?: boolean;
}

type Phase =
  | { kind: 'ready' }
  | { kind: 'launching' }
  | { kind: 'opened'; url: string; brief: LaunchBrief }
  | { kind: 'blocked'; url: string; brief: LaunchBrief }
  | { kind: 'problem'; message: string };

function whoCanSee(mode: string): string {
  if (mode === 'cohort_live') return 'Your cohort and the instructors. This is a shared session.';
  if (mode === 'practice_peer') return 'You and the peers you invite.';
  return 'Only you. Your practice room is private.';
}

function recordingLine(policy: string | null): string {
  if (policy === 'always') return 'This room records automatically, so you can watch yourself back.';
  if (policy === 'never') return 'This room does not record. Nothing will be saved to watch back.';
  return 'Recording is not automatic here — someone has to start it.';
}

export default function GetReadyPanel(props: GetReadyPanelProps) {
  const { projectId, storyId, attemptId, mode, recordingPolicy, demo } = props;
  const [acknowledged, setAcknowledged] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'ready' });

  const launch = useCallback(async () => {
    setPhase({ kind: 'launching' });
    try {
      const res = await launchPractice(projectId, storyId, attemptId);
      // Returns null when a popup blocker stopped it. It does not throw.
      const win = window.open(res.join_url, '_blank', 'noopener,noreferrer');
      setPhase(win
        ? { kind: 'opened', url: res.join_url, brief: res.brief }
        : { kind: 'blocked', url: res.join_url, brief: res.brief });
    } catch (err: any) {
      const message = err instanceof LaunchNotReadyError
        ? err.message
        : err?.message || 'Could not open the room. Try again.';
      setPhase({ kind: 'problem', message });
    }
  }, [projectId, storyId, attemptId]);

  if (demo) {
    return (
      <div className="ps-pending" data-testid="ps-getready-demo">
        <strong>Joining a room is part of the live programme.</strong>
        In the course this is where you confirm who can see the session and whether it
        is recording, then go in.
      </div>
    );
  }

  // The link survives a blocked popup. Re-launching would turn one intent into two
  // join events, so the student is handed the link they already have.
  if (phase.kind === 'blocked' || phase.kind === 'opened') {
    const blocked = phase.kind === 'blocked';
    return (
      <div className="ps-card" data-testid={blocked ? 'ps-getready-blocked' : 'ps-getready-opened'}>
        <h3>{blocked ? 'Your browser blocked the new tab' : 'Your room is open'}</h3>
        <p className="ps-note">
          {blocked
            ? 'Nothing is lost — this is the same link. Open it yourself:'
            : 'It opened in a new tab. If you closed it by accident, use this link:'}
        </p>
        <p className="ps-note">
          <a href={phase.url} target="_blank" rel="noopener noreferrer" data-testid="ps-getready-link">
            Open your room
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="ps-card" data-testid="ps-getready">
      <h3>Before you go in</h3>

      <dl className="ps-facts" data-testid="ps-getready-facts">
        <dt>Who can see this</dt>
        <dd data-testid="ps-getready-who">{whoCanSee(mode)}</dd>
        <dt>Recording</dt>
        <dd data-testid="ps-getready-recording">{recordingLine(recordingPolicy)}</dd>
      </dl>

      <ul className="ps-check">
        <li>
          <label>
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              data-testid="ps-getready-ack"
            />
            <span>I have read the two points above.</span>
          </label>
        </li>
      </ul>

      {phase.kind === 'problem' && (
        <p className="ps-note" role="status" data-testid="ps-getready-problem">{phase.message}</p>
      )}

      <div className="ps-acts">
        <button
          className="ps-btn"
          type="button"
          onClick={() => { void launch(); }}
          disabled={!acknowledged || phase.kind === 'launching'}
          data-testid="ps-getready-join"
        >
          {phase.kind === 'launching' ? 'Opening…' : 'Join your room'}
        </button>
      </div>
    </div>
  );
}
