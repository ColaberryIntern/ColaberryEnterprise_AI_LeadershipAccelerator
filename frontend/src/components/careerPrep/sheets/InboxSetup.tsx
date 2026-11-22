import React, { useState } from 'react';
import { CENTRAL_INBOX, saveInboxApi, type InboxView } from '../inboxApi';

/**
 * Career Prep v27, CP6.1 (kit F2): the four setup steps, each ticked only when the platform has seen it happen (the
 * server decides the ticks). Step 2 is the one the student does here: a Gmail address made just for the job search.
 */
const STEPS: Array<{ key: keyof InboxView['steps']; title: string; how: React.ReactNode }> = [
  { key: 'create', title: 'Create a Gmail just for your job search', how: <>Something like <code>first.last.careers@gmail.com</code>.</> },
  { key: 'added', title: 'Add it here', how: 'It must be a Gmail address, and only you can use it.' },
  { key: 'forwarding', title: 'Forward it to the central inbox', how: <>In that Gmail: Settings, then See all settings, then Forwarding and POP/IMAP, then Add a forwarding address: <code>{CENTRAL_INBOX}</code>. Google sends a confirmation there; our team confirms it for you.</> },
  { key: 'tested', title: 'Send a test', how: 'We email your job-search address; when it arrives through forwarding, this step is done.' },
];

export function InboxSetup({ inbox, onSaved }: { inbox: InboxView; onSaved: (v: InboxView) => void }): React.ReactElement {
  const [address, setAddress] = useState(inbox.address ?? '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setProblem(null);
    try { onSaved(await saveInboxApi(address.trim())); } catch (err) {
      setProblem((err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Could not save the address. Try again.');
    } finally { setBusy(false); }
  };
  return (
    <ol className="cp-inbox-steps" data-testid="cp-inbox-steps">
      {STEPS.map((s, i) => (
        <li key={s.key} className={inbox.steps[s.key] ? 'is-done' : ''} data-testid={`cp-inbox-step-${s.key}`} data-done={inbox.steps[s.key] ? 'yes' : 'no'}>
          <span className="cp-inbox-mark" aria-hidden="true">{inbox.steps[s.key] ? <i className="ri-check-line" /> : i + 1}</span>
          <div>
            <b>{s.title}</b>{inbox.steps[s.key] && <span className="visually-hidden"> (done)</span>}
            <p className="cp-muted">{s.how}</p>
            {s.key === 'added' && (
              <form className="cp-inbox-form" onSubmit={(e) => { void save(e); }}>
                <label htmlFor="cp-inbox-address" className="visually-hidden">Your job-search Gmail address</label>
                <input id="cp-inbox-address" type="email" autoComplete="off" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="first.last.careers@gmail.com" data-testid="cp-inbox-address" />
                <button type="submit" className="cp-send" disabled={busy || !address.trim()} data-testid="cp-inbox-save">{busy ? 'Saving...' : 'Save'}</button>
              </form>
            )}
            {s.key === 'added' && problem && <p role="alert" className="cp-form-problem" data-testid="cp-inbox-problem">{problem}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
