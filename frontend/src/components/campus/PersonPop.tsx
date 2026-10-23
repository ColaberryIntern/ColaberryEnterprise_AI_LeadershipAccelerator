import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CampusPerson } from './campusApi';
import type { CampusAudience } from './campusMap';
import { initialsOf } from './WhoIsHere';
import { hasDmHost, openDmThroughShell } from './dmHost';
import { postWave } from './campusPeopleApi';
import { publicOnly, GEAR_ICON } from './campusGear';
import { levelOfRung } from '../../services/bandLadder';
import { getOrgMember } from '../../services/orgApi';
import type { OrgMemberDetail } from '../../services/orgApi';
import { useCardFocus } from './useCardFocus';
import { popPosition, usePopover } from './usePopover';
import type { At } from './usePopover';
import './campusPop.css';

/**
 * A person's card on the campus (C5; WP-5 the prototype's pcard popover, D:2572-2592): it opens where you pressed, over the
 * arrival panel (which stays), and closes on ×, Esc (the map) or a press outside.
 *  - their photo or initials with the online dot; their name; "Lv n" (the rung's place, Q5) with the rung, and the gear they wear
 *    as the prototype's icons; "📍 Here with you" when they are in the building you are in, else "📍 In <building>";
 *  - Message and Wave only when the server says the DM rule allows it (can_message), otherwise disabled with the reason; Walk over
 *    when they are somewhere else; Profile opens the people page. The cohort line and points of the prototype are not shown:
 *    presence does not carry them.
 *  - a partner sees their teammate's real progress instead (GET /api/portal/org/members/:id): team and week, readiness and level,
 *    "See full progress" (the Company page) and Walk over; no Message, Wave or Profile, as the prototype's sponsorCard.
 */
export interface PersonPopProps {
  person: CampusPerson;
  at?: At;
  /** Where they are ("Community Lounge"), and whether that is the building you are in. */
  place: string;
  here: boolean;
  audience: CampusAudience;
  /** Reese is on duty for this viewer (the blocked-message note points to him). */
  reeseOnDuty?: boolean;
  onClose: () => void;
  onWalkOver: () => void;
  onMessaged?: () => void;
}

type WaveState = { kind: 'idle' } | { kind: 'sending' } | { kind: 'done'; text: string } | { kind: 'error'; text: string };

function Head({ p, heading }: { p: CampusPerson; heading: React.MutableRefObject<HTMLHeadingElement | null> }): React.ReactElement {
  const gear = Object.values(publicOnly(p.gear)).map((id) => GEAR_ICON[id]).filter(Boolean);
  const lv = levelOfRung(p.rung_name);
  return (
    <div className="cm-pc-top">
      <span className="cm-pc-av" aria-hidden="true">
        {p.avatar_url ? <img src={p.avatar_url} alt="" /> : <b data-testid="cm-person-initials">{initialsOf(p.display_name)}</b>}<i className="cm-pc-on" />
      </span>
      <div>
        <h2 className="cm-pc-name" tabIndex={-1} ref={heading}>{p.display_name}</h2>
        {(p.rung_name || gear.length > 0) && (
          <div className="cm-pc-clout">
            {p.rung_name && <span data-testid="cm-person-level">{lv && <span className="cm-lv-chip">Lv {lv}</span>} {p.rung_name}</span>}
            {gear.length > 0 && <span data-testid="cm-person-gear" aria-label={`Wearing ${gear.length} item${gear.length === 1 ? '' : 's'}`}>{gear.join(' ')}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function LearnerBody({ p, place, here, audience, reeseOnDuty, onWalkOver, onMessaged }: Omit<PersonPopProps, 'person' | 'at' | 'onClose'> & { p: CampusPerson }): React.ReactElement {
  const can = p.can_message === true;
  const host = hasDmHost();
  const [wave, setWave] = useState<WaveState>({ kind: 'idle' });
  const inFlight = useRef(false);
  const doWave = () => {
    if (!can || inFlight.current) return;
    inFlight.current = true;
    setWave({ kind: 'sending' });
    postWave(p.enrollment_id)
      .then((r) => setWave({ kind: 'done', text: r.sent ? `You waved at ${p.display_name}.` : 'You waved a moment ago.' }))
      .catch((e: Error) => setWave({ kind: 'error', text: e.message }))
      .finally(() => { inFlight.current = false; });
  };
  const note = audience === 'explorer' ? 'As an Explorer you can message other Explorers and staff. Enroll to message your cohort.'
    : <>You can only message people in your cohort. Walk over to their room{reeseOnDuty ? <>, or ask <b>Reese</b> to connect you</> : ''}.</>;
  return (
    <>
      <div className="cm-pc-where" data-testid="cm-person-where"><span aria-hidden="true">📍 </span>{here ? <b>Here with you</b> : <b>In {place}</b>}</div>
      <div className="cm-pc-acts">
        {!can && <span className="is-pri is-disabled" aria-disabled="true" data-testid="cm-message-blocked"><span aria-hidden="true">💬 </span>Message</span>}
        {can && host && <button type="button" className="is-pri" data-testid="cm-message" onClick={() => { openDmThroughShell(p.enrollment_id, p.display_name); onMessaged?.(); }}><span aria-hidden="true">💬 </span>Message</button>}
        {can && !host && <Link className="is-pri" to="/portal/today" data-testid="cm-message-today" onClick={onMessaged}>Message from Today</Link>}
        <button type="button" data-testid="cm-wave" onClick={doWave} disabled={!can || wave.kind === 'sending'} aria-disabled={!can || wave.kind === 'sending'}>
          <span aria-hidden="true">👋 </span>{wave.kind === 'sending' ? 'Waving...' : 'Wave'}
        </button>
        {!here && <button type="button" data-testid="cm-walk-over" onClick={onWalkOver}><span aria-hidden="true">🚶 </span>Walk over</button>}
        <a href="/portal/community/people" target="_blank" rel="noopener noreferrer" data-testid="cm-person-profile">Profile <span aria-hidden="true">↗</span></a>
      </div>
      {!can && <p className="cm-pc-note" data-testid="cm-message-note">{note}</p>}
      {(wave.kind === 'done' || wave.kind === 'error') && <p className="cm-pc-note" role="status" data-testid="cm-wave-status">{wave.text}</p>}
    </>
  );
}

function TeammateBody({ p, place, here, onWalkOver }: { p: CampusPerson; place: string; here: boolean; onWalkOver: () => void }): React.ReactElement {
  const [d, setD] = useState<OrgMemberDetail | null | 'error'>(null);
  useEffect(() => {
    let alive = true;
    getOrgMember(p.enrollment_id).then((x) => { if (alive) setD(x); })
      .catch((e) => { console.warn(JSON.stringify({ event: 'campus_teammate_read_failed', error_class: (e as Error)?.name ?? 'Error' })); if (alive) setD('error'); });
    return () => { alive = false; };
  }, [p.enrollment_id]);
  const m = d && d !== 'error' ? d : null;
  return (
    <>
      {m && <div className="cm-pc-sub" data-testid="cm-teammate-sub">{[m.team, m.section_progress?.week ? `Week ${m.section_progress.week}` : null].filter(Boolean).join(' · ')}</div>}
      <div className="cm-pc-where"><span aria-hidden="true">📍 </span>{here ? <b>Here with you</b> : <b>In {place}</b>}</div>
      {d === 'error' && <p className="cm-pc-note">Their progress could not be loaded just now.</p>}
      {m && (
        <div className="cm-sp-kpis" data-testid="cm-teammate-kpis">
          <div><b>{m.readiness ? `${Math.round(m.readiness.pct)}%` : '—'}</b><small>Readiness</small></div>
          <div><b>{levelOfRung(m.band_rung) ? `Lv ${levelOfRung(m.band_rung)}` : '—'}</b><small>{m.band_rung || 'Level'}</small></div>
        </div>
      )}
      <div className="cm-pc-acts">
        <Link className="is-pri is-navy" to="/portal/company" data-testid="cm-teammate-progress">See full progress</Link>
        {!here && <button type="button" data-testid="cm-walk-over" onClick={onWalkOver}><span aria-hidden="true">🚶 </span>Walk over</button>}
      </div>
    </>
  );
}

export default function PersonPop(props: PersonPopProps): React.ReactElement {
  const { person: p, at, onClose } = props;
  const box = usePopover(onClose);
  const heading = useRef<HTMLHeadingElement | null>(null);
  useCardFocus(heading);
  const team = props.audience === 'business';
  const pos = popPosition(at, team ? 320 : 300);
  return (
    <div className={`cm-pcard${team ? ' is-team' : ''}`} ref={box} style={pos} role="dialog" aria-label={`${p.display_name}'s card`} data-testid="cm-person-card" data-enrollment={p.enrollment_id}>
      <button type="button" className="cm-pc-x" onClick={onClose} aria-label={`Close ${p.display_name}'s card`}>×</button>
      <Head p={p} heading={heading} />
      {team ? <TeammateBody p={p} place={props.place} here={props.here} onWalkOver={props.onWalkOver} /> : <LearnerBody {...props} p={p} />}
    </div>
  );
}
