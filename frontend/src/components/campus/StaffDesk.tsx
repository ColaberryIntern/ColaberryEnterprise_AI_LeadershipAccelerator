import React, { useRef, useState } from 'react';
import type { StaffDesk as Desk } from './campusPeopleApi';
import { initialsOf } from './WhoIsHere';
import { hasDmHost, openDmThroughShell } from './dmHost';
import { openDm, sendDmMessage } from '../../services/dmApi';

/**
 * An AI staff desk inside its building's card (Colaberry Campus C5): Reese (Commons), Dara (Library), Maya (Main Gate,
 * Explorers and staff only).
 *
 * Staff are AI and say so: an "AI staff" label and the AI STAFF ring around their initials (never a face). On duty, the
 * desk offers Message and three suggested questions; a question opens the conversation and sends that question as the
 * learner's own message, once (single flight). Off duty it reads "Back soon" with no actions. Maya's desk is listed but
 * not yet open (C6 wires "Ask Maya about enrolling").
 */
export interface StaffDeskProps { desk: Desk; onMessaged?: () => void }

export default function StaffDesk({ desk: d, onMessaged }: StaffDeskProps): React.ReactElement {
  const host = hasDmHost();
  const live = d.on_duty && !!d.enrollment_id && host;
  const [note, setNote] = useState('');
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

  const status = d.id === 'maya' && d.opens ? `${d.name}'s desk opens soon`
    : d.on_duty ? 'On duty around the clock, replies in seconds' : 'Back soon';

  return (
    <div className={`cm-desk cm-desk-${d.id}${d.on_duty ? '' : ' is-off'}`} data-testid={`cm-desk-${d.id}`}>
      <div className="cm-desk-head">
        <span className="cm-face cm-initials cm-ai-ring" aria-hidden="true">{initialsOf(d.name)}</span>
        <div>
          <div className="cm-desk-name">{d.name} <span className="cm-ai-tag">AI staff</span></div>
          <div className="cm-who-note">{d.title}</div>
          <div className="cm-who-note" data-testid={`cm-desk-status-${d.id}`}>{status}</div>
        </div>
      </div>
      {live && (
        <>
          <button type="button" className="cm-btn is-secondary" data-testid={`cm-desk-message-${d.id}`}
            onClick={() => { openDmThroughShell(d.enrollment_id!, d.name); onMessaged?.(); }}>Message {d.name}</button>
          {d.prompts.length > 0 && (
            <ul className="cm-desk-prompts">
              {d.prompts.map((q) => <li key={q}><button type="button" className="cm-link" onClick={() => ask(q)}>{q}</button></li>)}
            </ul>
          )}
        </>
      )}
      {d.on_duty && !host && <p className="cm-who-note">Open Today to message {d.name}.</p>}
      {note && <p className="cm-who-note" role="status">{note}</p>}
    </div>
  );
}
