import React from 'react';
import type { RoomData } from './interviewRoomApi';

/**
 * CP9.1 (kit F5; execution contract E3): the consent screen everyone sees before joining. It names BOTH what happens
 * when everyone agrees (the meeting is recorded AND AI scores the candidate's voice and words, from the audio only, never the video)
 * and what happens when anyone says no (the interview still goes ahead, unrecorded, unscored, with no replay). The two
 * choices are the same button, the same size, side by side, with plain wording: neither is the "default".
 * The employer page (apps/hire-refactored-public, room-model.js) carries the same rules in its own words.
 */
export const CONSENT_COPY = {
  heading: 'Can this interview be recorded?',
  yes: 'If everyone agrees, the meeting (video and audio) is recorded, and AI scores your voice and words: what you say, your pace and your pauses. That becomes your replay, with feedback only you see. The AI scores the audio only; it never analyzes the video.',
  no: 'If anyone says no, you included, the interview still goes ahead. It is not recorded, nothing is scored, and there is no replay.',
  once: 'You choose once for this interview. Either choice is fine. Everyone in the room sees how many people agreed to recording.',
  consent: 'Yes, record it',
  decline: 'No, do not record it',
};

interface Props { onDecide: (d: 'consent' | 'decline') => void; busy: boolean }

export function ConsentChoice({ onDecide, busy }: Props): React.ReactElement {
  return (
    <section className="cp-iroom-card" aria-labelledby="cp-iroom-consent-h" data-testid="cp-iroom-consent">
      <h2 id="cp-iroom-consent-h" tabIndex={-1}>{CONSENT_COPY.heading}</h2>
      <p data-testid="cp-iroom-consent-yes">{CONSENT_COPY.yes}</p>
      <p data-testid="cp-iroom-consent-no"><b>{CONSENT_COPY.no}</b></p>
      <p className="cp-muted">{CONSENT_COPY.once}</p>
      <div className="cp-iroom-choices" role="group" aria-label="Recording choice">
        <button type="button" className="cp-iroom-choice" disabled={busy} onClick={() => onDecide('consent')} data-testid="cp-iroom-consent-btn">{CONSENT_COPY.consent}</button>
        <button type="button" className="cp-iroom-choice" disabled={busy} onClick={() => onDecide('decline')} data-testid="cp-iroom-decline-btn">{CONSENT_COPY.decline}</button>
      </div>
      {busy && <p className="cp-muted" aria-live="polite">Saving your choice...</p>}
    </section>
  );
}

/** After the student's own decision: what they chose, the recording line, and the way into the meeting. */
export function JoinPanel({ room, stalled, onRetry }: { room: RoomData; stalled: boolean; onRetry: () => void }): React.ReactElement {
  const j = room.join;
  return (
    <section className="cp-iroom-card" aria-labelledby="cp-iroom-join-h" data-testid="cp-iroom-join">
      <h2 id="cp-iroom-join-h" tabIndex={-1}>{j.status === 'ready' ? 'The room is open' : 'Getting the room ready'}</h2>
      <p data-testid="cp-iroom-mine">{room.yourDecision === 'consent' ? 'You said yes to recording.' : 'You said no to recording. The interview goes ahead unrecorded, with no replay.'}</p>
      {room.recording.note && <p className="cp-muted" data-testid="cp-iroom-recnote">{room.recording.note}</p>}
      {j.status === 'ready' && j.url && (
        <p className="cp-iroom-go">
          <a className="cp-send" href={j.url} target="_blank" rel="noopener noreferrer" data-testid="cp-iroom-open">Open the meeting</a>
          <span className="cp-muted">It opens in Zoom, in a new tab.</span>
        </p>
      )}
      {j.status === 'starting' && !stalled && <p aria-live="polite" data-testid="cp-iroom-starting">{j.reason}</p>}
      {(j.status === 'withheld' || stalled) && (
        <div role="alert" className="cp-iroom-alert" data-testid="cp-iroom-withheld">
          <p>{stalled ? 'The recording is taking longer than usual to set up.' : j.reason}</p>
          <button type="button" className="cp-ghost" onClick={onRetry} data-testid="cp-iroom-retry">Try again</button>
        </div>
      )}
    </section>
  );
}
