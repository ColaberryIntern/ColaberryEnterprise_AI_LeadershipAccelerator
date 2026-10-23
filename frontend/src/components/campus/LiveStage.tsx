import React from 'react';
import { Link } from 'react-router-dom';
import { useBroadcastPlayer } from '../../contexts/BroadcastPlayerContext';
import type { CampusAudience } from './campusMap';
import type { CampusLiveNow } from './campusOnAir';
import { LIVE_STATES, clock, previewLeft } from './campusLiveState';
import './campusLiveStates.css';

/**
 * The stage in the live building's arrival card (WP-6; the prototype's stageHTML, D:1999-2010): the state tag, how long it has
 * been on air, and the overlay for the moment:
 *  - reconnecting: "Reconnecting…", "It resumes on its own";
 *  - not watching: ▶ "Watch here", "or join the room for audio and Q&A";
 *  - watching: it plays in the portal's own mini player (one player for the whole portal, it keeps playing while you walk), so the
 *    stage says so, with Stop;
 *  - an Explorer on a preview: "PREVIEW · m:ss" counting down; at 0, "Your preview has ended." with Enroll.
 * The prototype's captions and reactions need a channel that does not exist yet (decision Q15), so neither is drawn.
 */
export default function LiveStage({ live, audience, enrollTo }: { live: CampusLiveNow; audience: CampusAudience; enrollTo: string }): React.ReactElement {
  const { open, close, session } = useBroadcastPlayer();
  const { b, state, now } = live;
  const watching = session?.occurrenceId === b.id;
  const preview = audience === 'explorer' ? previewLeft(b, live.polledAt, now) : null;
  const ended = preview === 0;
  const watch = () => open({ occurrenceId: b.id, asset: 'master.m3u8', title: b.title });
  let over: React.ReactNode = null;
  if (ended) {
    over = <><b>Your preview has ended.</b><small>Enroll to watch every live class in full.</small>
      <Link className="cm-btn-red" to={enrollTo} data-testid="cm-stage-enroll">Enroll &rarr;</Link></>;
  } else if (state === 'reconnecting') {
    over = <><i className="cm-st-spin" aria-hidden="true" /><b>Reconnecting&hellip;</b><small>It resumes on its own</small></>;
  } else if (watching) {
    over = <><b>Playing in your mini player</b><small>It keeps playing while you walk</small>
      <button type="button" className="cm-btn-line" onClick={close} data-testid="cm-stage-stop">⏸ Stop</button></>;
  } else if (b.can_watch) {
    over = <><button type="button" className="cm-st-play" onClick={watch} aria-label={`Watch ${b.title} here`} data-testid="cm-stage-watch">▶</button>
      <b>Watch here</b><small>or join the room for audio and Q&amp;A</small></>;
  } else {
    over = <><b>{b.offer_upgrade ? 'Watching needs a membership' : 'Watching is not open to you'}</b><small>The room is still open for audio and Q&amp;A</small></>;
  }
  return (
    <div className={`cm-stage is-${state}`} data-testid="cm-stage">
      <span className="cm-st-tag" aria-hidden="true">{LIVE_STATES[state].chip}</span>
      {state === 'live' && b.content_started_at && !preview && <span className="cm-st-time" aria-hidden="true">{clock(now - b.content_started_at)}</span>}
      {preview !== null && preview > 0 && <span className="cm-st-time is-preview" data-testid="cm-stage-preview">PREVIEW · {clock(preview * 1000)}</span>}
      <div className="cm-st-over" role="status">{over}</div>
    </div>
  );
}
