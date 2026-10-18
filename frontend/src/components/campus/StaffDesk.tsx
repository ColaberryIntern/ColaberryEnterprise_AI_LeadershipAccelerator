import React, { Suspense, lazy, useRef, useState } from 'react';
import type { StaffDesk as Desk } from './campusPeopleApi';
import { initialsOf } from './WhoIsHere';
import { hasDmHost, openDmThroughShell } from './dmHost';
import { openDm, sendDmMessage } from '../../services/dmApi';

// C6: Maya is the website's admissions chat. Loaded only when a learner asks, so portal pages do not carry it otherwise.
const MayaChatWidget = lazy(() => import('../MayaChatWidget'));

/** True when this browser already has the public site's visitor id (written only by the site's own tracker). The campus
 *  only READS it: creating one in the portal would be a tracking/consent change, which is Ali's decision. */
export function hasSiteVisitorId(): boolean {
  try { return !!window.localStorage.getItem('cb_visitor_fp'); } catch { return false; }
}

/** The widget hides itself entirely for Do Not Track browsers (site and campus alike); the desk says so instead. */
export function doNotTrackOn(): boolean {
  return typeof navigator !== 'undefined' && navigator.doNotTrack === '1';
}

const ENROLL_PAGE = '/enroll';

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
  const [mayaOpen, setMayaOpen] = useState(false);
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

  const status = isMaya && !d.on_duty ? `${d.name}'s desk opens soon`
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
      {d.on_duty && !host && !isMaya && <p className="cm-who-note">Open Today to message {d.name}.</p>}
      {isMaya && d.on_duty && doNotTrackOn() && (
        <p className="cm-who-note" data-testid="cm-maya-dnt">Your browser asks sites not to track you, so Maya's chat stays hidden.</p>
      )}
      {isMaya && d.on_duty && !doNotTrackOn() && (hasSiteVisitorId()
        ? <button type="button" className="cm-btn is-secondary" data-testid="cm-ask-maya" onClick={() => setMayaOpen(true)}>Ask Maya about enrolling</button>
        : (
          <>
            <a className="cm-btn is-secondary" href={ENROLL_PAGE} target="_blank" rel="noopener noreferrer" data-testid="cm-ask-maya-site">Ask Maya about enrolling</a>
            <p className="cm-who-note">Maya chats on our enrollment page; it opens in a new tab.</p>
          </>
        ))}
      {isMaya && mayaOpen && (
        <Suspense fallback={null}>
          <MayaChatWidget mode="embedded" open onClose={() => setMayaOpen(false)} />
        </Suspense>
      )}
      {note && <p className="cm-who-note" role="status">{note}</p>}
    </div>
  );
}
