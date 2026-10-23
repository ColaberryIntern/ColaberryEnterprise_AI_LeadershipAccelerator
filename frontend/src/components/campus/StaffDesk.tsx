import React, { Suspense, lazy, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { StaffDesk as Desk } from './campusPeopleApi';
import { initialsOf } from './WhoIsHere';
import { hasDmHost, openDmThroughShell } from './dmHost';
import { openDm, sendDmMessage } from '../../services/dmApi';
import { art } from './art/artColor';
import { staffRole, staffTone } from './staffCard';

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
      {isMaya && d.on_duty && doNotTrackOn() && (
        <p className="cm-pc-note" data-testid="cm-maya-dnt">Your browser asks sites not to track you, so Maya's chat stays hidden.</p>
      )}
      {isMaya && d.on_duty && !doNotTrackOn() && (hasSiteVisitorId()
        ? <button type="button" className="cm-btn is-secondary" data-testid="cm-ask-maya" onClick={() => setMayaOpen(true)}>Ask Maya about enrolling</button>
        : (
          <>
            <a className="cm-btn is-secondary" href={ENROLL_PAGE} target="_blank" rel="noopener noreferrer" data-testid="cm-ask-maya-site">Ask Maya about enrolling</a>
            <p className="cm-pc-note">Maya chats on our enrollment page; it opens in a new tab.</p>
          </>
        ))}
      {isMaya && mayaOpen && (
        // C11: Esc inside Maya's chat closes the chat, not the card and map around it.
        <div onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setMayaOpen(false); } }} data-testid="cm-maya-chat">
          <Suspense fallback={null}>
            <MayaChatWidget mode="embedded" open onClose={() => setMayaOpen(false)} />
          </Suspense>
        </div>
      )}
      {note && <p className="cm-pc-note" role="status">{note}</p>}
    </div>
  );
}
