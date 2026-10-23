import React, { useState } from 'react';
import { useBroadcastPlayer } from '../../../contexts/BroadcastPlayerContext';
import { playChime, readSoundOptIn, writeSoundOptIn } from '../../portal/broadcastLaunchCue';
import type { BuildingId, CampusAudience } from '../campusMap';
import { useLiveNow } from '../campusOnAir';
import { LIVE_STATES, liveSub } from '../campusLiveState';
import '../campusLiveStates.css';

/**
 * COLABERRY LIVE in the side panel (C11b; WP-6 the prototype's livecard, D:2012-2022): the state chip and "Colaberry Live", the
 * title, "<building> · on air for 4:12" (an Explorer's "· preview for Explorers", a partner's "· N of your team here"), then
 * "Run to the hall →" (walks, running while on air; "Walk in early →" before doors), "▶ Watch here" / "⏸ Stop" on the portal's
 * player, and the chime opt-in: the portal's own setting (the live-now badge's), so one switch rules every chime.
 * Shown only while discovery lists a broadcast; with nothing on air it is not drawn.
 */
export interface LiveCardProps {
  title: string;
  buildingId: BuildingId | null;
  /** The live building's name as this viewer sees it. */
  place?: string | null;
  audience?: CampusAudience;
  /** A partner: how many of their team are in the live building now (their server names only teammates). */
  teamHere?: number | null;
  onWalk: (id: BuildingId, run?: boolean) => void;
}

function Chime(): React.ReactElement {
  const [on, setOn] = useState(readSoundOptIn);
  const [note, setNote] = useState('');
  const flip = () => {
    const next = !on;
    writeSoundOptIn(next);
    setOn(next);
    setNote('');
    if (next) playChime().then((r) => { if (r !== 'played') setNote(r === 'refused' ? 'Your browser blocked the sound. The bar will still appear.' : 'This device cannot play the alert sound. The bar will still appear.'); });
  };
  return (
    <>
      <button type="button" className="cm-lc-chime" aria-pressed={on} onClick={flip} data-testid="cm-cc-live-chime">
        <span aria-hidden="true">🔔 </span>Chime when a class goes live: <b>{on ? 'On' : 'Off'}</b>
      </button>
      {note && <div className="cm-lc-note" role="status">{note}</div>}
    </>
  );
}

export default function LiveCard({ title, buildingId, place = null, audience = 'member', teamHere = null, onWalk }: LiveCardProps): React.ReactElement {
  const live = useLiveNow();
  const { open, close, session } = useBroadcastPlayer();
  const state = live?.state ?? 'live';
  const chip = LIVE_STATES[state];
  const watching = !!live && session?.occurrenceId === live.b.id;
  const suffix = audience === 'explorer' && live?.b.access_mode === 'preview' ? <> · <b>preview for Explorers</b></>
    : audience === 'business' && teamHere ? <> · <b>{teamHere} of your team here</b></> : null;
  const sub = [place, live ? liveSub(live.b, live.now) : null].filter(Boolean).join(' · ');
  return (
    <div className="cm-cc-livecard" data-testid="cm-cc-live">
      <div className="cm-lc-top"><span className={`cm-lb-chip ${chip.tone}`}>{chip.chip}</span><span className="cm-lc-brand">Colaberry Live</span></div>
      <div className="cm-lc-title">{title}</div>
      {(sub || suffix) && <div className="cm-lc-sub" data-testid="cm-cc-live-sub"><span aria-hidden="true">{sub}</span>{suffix}</div>}
      <div className="cm-lc-row">
        {buildingId && <button type="button" className="cm-btn-red" onClick={() => onWalk(buildingId, state === 'live')} data-testid="cm-cc-live-walk">
          {state === 'backstage' ? 'Walk in early →' : 'Run to the hall →'}</button>}
        {live?.b.can_watch && state !== 'backstage' && (watching
          ? <button type="button" className="cm-btn-ghost-w" onClick={close} data-testid="cm-cc-live-stop">⏸ Stop</button>
          : <button type="button" className="cm-btn-ghost-w" onClick={() => open({ occurrenceId: live.b.id, asset: 'master.m3u8', title: live.b.title })} data-testid="cm-cc-live-watch">▶ Watch here</button>)}
      </div>
      <Chime />
    </div>
  );
}
