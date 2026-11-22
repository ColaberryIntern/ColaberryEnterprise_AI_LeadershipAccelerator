import React, { useEffect, useState } from 'react';
import { fetchInboxApi, fetchReceivedApi, type InboxHealth, type InboxView, type ReceivedItem } from '../inboxApi';
import { InboxSetup } from './InboxSetup';
import './careerPrepSheets.css';

/**
 * Career Prep v27, CP6.1 (kit F2): the #inbox sheet. The status card (the address, its health, the last mail and this
 * month's count), the four setup steps, "Everything it received" and "What we never do". Every value comes from the
 * server; nothing is filled in, and an empty list says so plainly.
 */
const PILL: Record<InboxHealth, string> = { healthy: 'ok', quiet: 'warn', broken: 'bad', untested: 'info', setup: 'info' };
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function Status({ inbox }: { inbox: InboxView }): React.ReactElement {
  return (
    <div className="cp-inbox-card" data-testid="cp-inbox-status">
      <p className="cp-inbox-addr"><code data-testid="cp-inbox-addr">{inbox.address ?? 'No address yet'}</code> <span className={`cp-pill ${PILL[inbox.health]}`} data-testid="cp-inbox-health">{inbox.healthLabel}</span></p>
      <p className="cp-muted">
        {inbox.lastReceivedAt ? `Last email received ${when(inbox.lastReceivedAt)} Central` : 'Nothing received yet'} · {inbox.receivedThisMonth} this month
        {inbox.lastTestMs !== null && ` · last test arrived in ${Math.round(inbox.lastTestMs / 1000)} seconds`}
      </p>
      <p className="cp-inbox-callout">Use this address on every application. Interviews that arrive there come to Cora and your recruiter. You never have to log in to it.</p>
      {inbox.health === 'broken' && <p role="alert" className="cp-form-problem">Your forwarding stopped working. Check step 3 in that Gmail, then send a test.</p>}
    </div>
  );
}

function Received({ items, failed }: { items: ReceivedItem[] | null; failed: boolean }): React.ReactElement {
  // A failed load is never shown as "nothing arrived": that would be a made-up empty inbox.
  if (failed) return <p role="alert" className="cp-form-problem" data-testid="cp-inbox-received-failed">Could not load what your inbox received.</p>;
  if (items === null) return <p className="cp-muted" aria-live="polite">Loading...</p>;
  if (!items.length) return <p className="cp-muted" data-testid="cp-inbox-empty">Nothing has arrived yet.</p>;
  return (
    <table className="cp-inbox-table" data-testid="cp-inbox-received">
      <thead><tr><th scope="col">When (Central)</th><th scope="col">From and subject</th><th scope="col">Read as</th><th scope="col">What happened</th></tr></thead>
      <tbody>{items.map((m) => (
        <tr key={m.messageId}>
          <td data-label="When">{when(m.receivedAt)}</td>
          <td data-label="From">{m.fromName ?? 'Unknown sender'} · {m.subject ?? '(no subject)'}</td>
          <td data-label="Read as">{m.category ? <span className="cp-pill info">{m.category}{m.confidence !== null ? ` ${Math.round(m.confidence * 100)}%` : ''}</span> : 'Not read yet'}</td>
          <td data-label="Happened">{m.outcome ?? 'Nothing yet'}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

export function InboxSheet(): React.ReactElement {
  const [inbox, setInbox] = useState<InboxView | null>(null);
  const [items, setItems] = useState<ReceivedItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [receivedFailed, setReceivedFailed] = useState(false);
  useEffect(() => {
    let live = true;
    Promise.resolve().then(fetchInboxApi).then((v) => { if (live) setInbox(v); }).catch(() => { if (live) setFailed(true); });
    Promise.resolve().then(fetchReceivedApi).then((l) => { if (live) setItems(l); }).catch(() => { if (live) setReceivedFailed(true); });
    return () => { live = false; };
  }, []);
  if (failed) return <p role="alert" className="cp-form-problem" data-testid="cp-inbox-failed">Could not load your job-search inbox. Try again in a moment.</p>;
  if (!inbox) return <p className="cp-muted" aria-live="polite">Loading...</p>;
  return (
    <div className="cp-inbox" data-testid="cp-inbox-sheet">
      <Status inbox={inbox} />
      <h3>Set it up</h3>
      <InboxSetup inbox={inbox} onSaved={setInbox} />
      <h3>Everything it received</h3>
      <Received items={items} failed={receivedFailed} />
      <h3>What we never do</h3>
      <p data-testid="cp-inbox-never">We never log in to your Gmail, and we never send from it.</p>
    </div>
  );
}
