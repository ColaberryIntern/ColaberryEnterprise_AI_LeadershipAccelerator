import React, { useState } from 'react';
import type { HeldLink } from './careerDeskApi';
import { looksLikeEmail, PrepLink } from './DeskParts';

/**
 * Held booking links (T16 carry): a reply held while employer email was off (or the switch could not be read) is never sent
 * later on its own; it waits here, with the server's note saying why, until staff send it. One with no employer email on
 * file asks for one first.
 */
interface Props { held: HeldLink[]; note: string; busy: string | null; onSend: (h: HeldLink, contactEmail?: string) => void }
export const heldKey = (h: HeldLink) => `held:${h.interviewId}`;

const HeldRow: React.FC<{ h: HeldLink; busy: string | null; onSend: Props['onSend'] }> = ({ h, busy, onSend }) => {
  const [email, setEmail] = useState('');
  const needs = !h.hasContact;
  return (
    <li className="cdesk-held-row" data-testid={`cdesk-held-${h.interviewId}`}>
      <div>
        <b>{h.company || 'Company not named'}</b>{h.position ? `, ${h.position}` : ''}
        <div className="cdesk-small cdesk-muted">{h.learner || 'Learner not named'} · held {h.heldLabel} Central <PrepLink enrollmentId={h.enrollmentId} name={h.learner} /></div>
      </div>
      {needs && (
        <div className="cdesk-field cdesk-field-inline">
          <label htmlFor={`cdesk-held-email-${h.interviewId}`}>Employer email</label>
          <input id={`cdesk-held-email-${h.interviewId}`} type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      )}
      <button type="button" className="cdesk-btn cdesk-ghost cdesk-sm" data-testid={`cdesk-held-send-${h.interviewId}`}
        disabled={busy !== null || (needs && !looksLikeEmail(email))} onClick={() => onSend(h, needs ? email.trim() : undefined)}>
        {busy === heldKey(h) ? 'Working...' : h.action.label}
      </button>
    </li>
  );
};

export const DeskHeldList: React.FC<Props> = ({ held, note, busy, onSend }) => (
  <section className="cdesk-card" aria-labelledby="cdesk-held-h" data-testid="cdesk-held">
    <h3 className="cdesk-h3" id="cdesk-held-h">Held booking links</h3>
    <p className="cdesk-small cdesk-muted" data-testid="cdesk-held-note">{note}</p>
    {held.length === 0
      ? <p className="cdesk-small" data-testid="cdesk-held-empty">No booking link is held.</p>
      : <ul className="cdesk-held">{held.map((h) => <HeldRow key={h.interviewId} h={h} busy={busy} onSend={onSend} />)}</ul>}
  </section>
);
