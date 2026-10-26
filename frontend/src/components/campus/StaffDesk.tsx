import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { StaffDesk as Desk } from './campusPeopleApi';
import { initialsOf } from './WhoIsHere';
import { hasDmHost, openDmThroughShell } from './dmHost';
import { openDm, sendDmMessage } from '../../services/dmApi';
import { art } from './art/artColor';
import { staffRole, staffTone } from './staffCard';
import AskMaya from './AskMaya';

// C6: Maya's chat (and the visitor-id and Do Not Track checks) live in AskMaya since C54, shared with the Explorer's pass on Today.
export { hasSiteVisitorId, doNotTrackOn } from './AskMaya';

/**
 * An AI staff member's card (Colaberry Campus C5; WP-5 the prototype's staff popover, D:2578-2583): Reese (Commons), Dara
 * (Library), Maya (Main Gate, Explorers and staff only).
 *
 * Staff are AI and say so: the AI STAFF tag and a gold ring round their initials in their desk's colour (never a face). Their role
 * line, where their desk is and "On duty 24/7 · replies in seconds"; on duty, the suggested questions as quoted chips (a question
 * opens the conversation and sends it as the learner's own message, once, single flight) and "Message <name>"; "Visit the desk"
 * walks there (not when you are there, and not for Maya, whose desk is the gate); Profile opens the people page. Off duty: "Back
 * soon", no actions. Maya speaks through the website's chat (C6), so her card offers that instead.
 */
export interface StaffDeskProps {
  desk: Desk;
  onMessaged?: () => void;
  /** Where the desk is ("the Community Lounge"), and whether you are standing there. */
  place?: string;
  here?: boolean;
  workplace?: boolean;
  onVisit?: () => void;
}

export default function StaffDesk({ desk: d, onMessaged, place, here = false, workplace = false, onVisit }: StaffDeskProps): React.ReactElement {
  const host = hasDmHost();
  const live = d.on_duty && !!d.enrollment_id && host;
  const [note, setNote] = useState('');
  const isMaya = d.id === 'maya';
  const busy = useRef(false);

  const ask = (q: string) => {
    if (!live || busy.current) return;
    busy.current = true;
    openDm(d.enrollment_id!)
      .then((roomId) => sendDmMessage(roomId, q))
      .then(() => { openDmThroughShell(d.enrollment_id!, d.name); onMessaged?.(); })
      .catch(() => setNote(`Could not reach ${d.name} just now. Try again in a moment.`))
      .finally(() => { busy.current = false; });
  };

  const status = isMaya && !d.on_duty ? `${d.name}'s desk opens soon` : d.on_duty ? 'On duty 24/7 · replies in seconds' : 'Back soon';

  return (
    <div className={`cm-desk cm-desk-${d.id}${d.on_duty ? '' : ' is-off'}`} data-testid={`cm-desk-${d.id}`}>
      <div className="cm-pc-top">
        <span className="cm-pc-av is-staff" style={{ background: art(staffTone(d.id)) }} aria-hidden="true">{initialsOf(d.name)}{d.on_duty && <i className="cm-pc-on" />}</span>
        <div>
          <div className="cm-pc-name">{d.name} <span className="cm-pc-tag">AI STAFF</span></div>
          <div className="cm-pc-sub">{staffRole(d, workplace)}</div>
        </div>
      </div>
      <div className="cm-pc-where">
        <span aria-hidden="true">📍 </span><b>{d.title}</b>{place ? ` in ${place}` : ''}
        <span className="cm-pc-muted" data-testid={`cm-desk-status-${d.id}`}>{status}</span>
      </div>
      {live && d.prompts.length > 0 && (
        <div className="cm-pc-q">{d.prompts.map((q) => <button key={q} type="button" onClick={() => ask(q)}>&ldquo;{q}&rdquo;</button>)}</div>
      )}
      {d.on_duty && <div className="cm-pc-acts">
        {live && <button type="button" className="is-pri" data-testid={`cm-desk-message-${d.id}`}
          onClick={() => { openDmThroughShell(d.enrollment_id!, d.name); onMessaged?.(); }}><span aria-hidden="true">💬 </span>Message {d.name}</button>}
        {onVisit && !here && !isMaya && <button type="button" onClick={onVisit} data-testid={`cm-desk-visit-${d.id}`}><span aria-hidden="true">🚶 </span>Visit the desk</button>}
        <a href="/portal/community/people" target="_blank" rel="noopener noreferrer">Profile <span aria-hidden="true">↗</span></a>
      </div>}
      {d.on_duty && !host && !isMaya && <p className="cm-pc-note">Open <Link to="/portal/today">Today</Link> to message {d.name}.</p>}
      {isMaya && d.on_duty && <AskMaya />}
      {note && <p className="cm-pc-note" role="status">{note}</p>}
    </div>
  );
}
