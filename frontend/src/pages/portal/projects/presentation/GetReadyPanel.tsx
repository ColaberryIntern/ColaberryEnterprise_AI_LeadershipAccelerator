import React, { useCallback, useState } from 'react';
import { launchPractice, LaunchNotReadyError, type LaunchBrief } from './presentationApi';

/**
 * The screen between "I have a room" and "I am in a recorded call".
 *
 * WHY THERE IS A STEP HERE AT ALL. A student should never discover after the fact
 * that the session was recording, or that the room was visible to their cohort, or
 * that the take they just spent is unusable because nothing was on screen. All three
 * facts are shown before they commit, and the Join control stays disabled until they
 * have said they read them.
 *
 * THE TWO CONSENT FACTS COME FROM THE SESSION, NOT FROM A CONSTANT. An earlier draft
 * of this panel hardcoded "only you" and "records automatically". That is true of a
 * solo rehearsal and false of demo day, and a screen whose entire job is informed
 * consent cannot be the thing that misinforms. Both lines are derived from the
 * attempt's real mode and the room's real recording policy. The screen-sharing line is
 * deliberately NOT derived from anything: it is true of every room and every
 * presentation type, and see `SCREEN_LINE` for why it has to be said here.
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

/**
 * What the learner is told about recording, before they go in.
 *
 * THE FALLBACK USED TO SAY THE OPPOSITE OF THE TRUTH. `recording_policy` is a
 * RoomBooking column that nothing in the codebase ever sets, so every practice room
 * carries its database default of 'ask' — and the panel read that as "someone has to
 * start it". Meanwhile `zoomService.createMeeting` hardcodes `auto_recording: 'cloud'`
 * for every meeting it creates, so recording begins the moment the host joins.
 *
 * Telling someone they will be asked and then recording them anyway is the wrong way
 * round for a consent notice, which is why this is not merely a copy tweak. The
 * deeper fix is for the column to carry the truth — that means threading a policy
 * through `createBooking`, which is shared with every other room in the product and
 * is a change of its own. Until then this says what actually happens.
 */
function recordingLine(policy: string | null): string {
  if (policy === 'never') return 'This room does not record. Nothing will be saved to watch back.';
  // 'always' and the unset default behave identically today: Zoom records on start.
  return 'This room records automatically from the moment you join, so you can watch yourself back.';
}

/**
 * The instruction that four out of four student demos have needed so far.
 *
 * WHY THIS IS A FACT ON THE CONSENT SCREEN AND NOT A TIP SOMEWHERE ELSE. Zoom picks
 * the composition of the file it saves from what actually happened in the room: share a
 * screen and it writes `shared_screen_with_speaker_view`, share nothing and it writes
 * `active_speaker`. Every student working-system demo recorded to date came back
 * `active_speaker` — the learner talking, with the system they built nowhere in frame —
 * while the only recordings carrying a screen were staff ones. That is not four people
 * being careless, it is the product never having said so at the moment it mattered.
 *
 * It is told as a consequence rather than an instruction because "share your screen"
 * alone reads as optional. Knowing the recording comes back unusable is what makes
 * someone do it before they start rather than three minutes in.
 *
 * This is the last screen before the room opens, so it is the only place the sentence
 * can still change the outcome. `RecordingEvidencePicker` already flags a take that
 * arrived without a screen, but by then the take is spent.
 */
const SCREEN_LINE = 'Share your screen before you start speaking, and keep it shared. '
  + 'Zoom saves only what it saw: with no screen shared, the recording comes back as '
  + 'you talking with nothing to look at.';

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
        <dt>Share your screen</dt>
        <dd data-testid="ps-getready-screen">{SCREEN_LINE}</dd>
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
            <span>I have read the three points above, and I will share my screen.</span>
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
