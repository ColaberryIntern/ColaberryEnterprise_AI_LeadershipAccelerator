import React, { useState } from 'react';
import type { InboxLine, QueueItem } from './careerDeskApi';
import { kindPill, LearnerPicker, looksLikeEmail, PrepLink } from './DeskParts';

/**
 * The selected review-queue item (kit F9 detail card): why it is here, what the email said, and the item's actions exactly as
 * the server lists them (labels included). "Match and send" needs a learner picked; "Send booking link" on an item with no
 * employer email needs one typed first. Every button is off while any action is in flight.
 */
export interface ActExtra { enrollmentId?: string; contactEmail?: string }
interface Props { item: QueueItem; learners: InboxLine[] | null; learnersError: string | null; busy: string | null; onAct: (item: QueueItem, action: string, extra: ActExtra) => void }

const CENTRAL = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export const centralLabel = (iso: string) => `${CENTRAL.format(new Date(iso))} Central`;
export const actKey = (item: QueueItem, action: string) => `${item.source}:${item.id}:${action}`;

const Related: React.FC<{ item: QueueItem }> = ({ item }) => (item.related.length === 0 ? null : (
  <div className="cdesk-related">
    <p className="cdesk-small cdesk-muted">This learner's interviews:</p>
    <ul data-testid="cdesk-q-related">
      {item.related.map((r) => <li key={r.interviewId}>{[r.company, r.position].filter(Boolean).join(', ') || 'Interview'} ({r.state}){r.startsAt ? `, ${centralLabel(r.startsAt)}` : ''}</li>)}
    </ul>
  </div>
));

export const DeskQueueDetail: React.FC<Props> = ({ item, learners, learnersError, busy, onAct }) => {
  const [learner, setLearner] = useState('');
  const [email, setEmail] = useState('');
  const asksEmail = item.needsContact && item.actions.some((a) => a.action === 'send_link');
  const asksLearner = item.actions.some((a) => a.action === 'match');
  const blocked = (action: string) => (action === 'match' && !learner) || (action === 'send_link' && asksEmail && !looksLikeEmail(email));
  return (
    <section className="cdesk-card cdesk-acc" aria-label="Selected item" data-testid="cdesk-q-detail">
      <div className="cdesk-eyebrow">{kindPill(item.kind)[0]}</div>
      <h3 className="cdesk-h3">{item.company || 'Company not named'}</h3>
      <p className="cdesk-small cdesk-muted">{[item.subject ? `"${item.subject}"` : null, item.position, item.learner].filter(Boolean).join(' · ') || 'No subject or learner on file'}{' '}<PrepLink enrollmentId={item.enrollmentId} name={item.learner} /></p>
      <p className="cdesk-strong" data-testid="cdesk-q-title">{item.title}</p>
      {item.detail && <p className="cdesk-small" data-testid="cdesk-q-why">{item.detail}</p>}
      <p className="cdesk-small cdesk-faint">Waiting since {centralLabel(item.since)}</p>
      <Related item={item} />
      {asksLearner && <LearnerPicker id="cdesk-q-learner" label="Learner this email is for" learners={learners} value={learner} onChange={setLearner} error={learnersError} />}
      {asksEmail && (
        <div className="cdesk-field">
          <label htmlFor="cdesk-q-email">Employer email (needed to send the booking link)</label>
          <input id="cdesk-q-email" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="cdesk-q-email" />
        </div>
      )}
      <div className="cdesk-actions" data-testid="cdesk-q-actions">
        {item.actions.map((a, i) => (
          <button key={a.action} type="button" className={`cdesk-btn ${i === 0 ? 'cdesk-primary' : 'cdesk-ghost'}`} data-testid={`cdesk-q-act-${a.action}`}
            disabled={busy !== null || blocked(a.action)} aria-busy={busy === actKey(item, a.action)}
            onClick={() => onAct(item, a.action, { ...(learner ? { enrollmentId: learner } : {}), ...(asksEmail && email.trim() ? { contactEmail: email.trim() } : {}) })}>
            {busy === actKey(item, a.action) ? 'Working...' : a.label}
          </button>
        ))}
      </div>
    </section>
  );
};
