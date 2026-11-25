import React, { useCallback, useEffect, useState } from 'react';
import {
  getRecap, saveRecap, draftRecap, sendRecap, recapError,
  type RecapState, type RecapSummary, type RecapViolation, type RecapSendResult,
} from '../../../services/weeklyLiveRecapApi';

/**
 * The recap panel on Studio setup (Basecamp WL1.4, Ali 2026-11-24): after class, the recap goes to
 * everyone who checked in, with a visual overview, their personal link back to the class page and
 * chat, and the next event's Eventbrite link.
 *
 * Order is enforced, not suggested: the real send stays disabled until the overview is saved, the
 * Eventbrite link is a valid https link, and a test copy has gone to Ali. Ali pre-approved sending
 * once the test copy reaches him, so there is no second approval step after that.
 */
const HTTPS = /^https:\/\/\S+\.\S+/;
const SKIP_LABEL: Record<string, string> = {
  test_guest: 'test check-ins', opted_out: 'opted out of recaps', lead_suppressed: 'unsubscribed from email', invalid_email: 'invalid email',
};

export function canSend(s: { hasSavedSummary: boolean; nextEventUrl: string; testSentAt: string | null }, dirty: boolean): boolean {
  return s.hasSavedSummary && !dirty && HTTPS.test(s.nextEventUrl) && Boolean(s.testSentAt);
}

export default function StudioRecapPanel({ sessionId, onClose }: { sessionId: string; onClose: () => void }): React.ReactElement {
  const [state, setState] = useState<RecapState | null>(null);
  const [summary, setSummary] = useState<RecapSummary | null>(null);
  const [url, setUrl] = useState('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [violations, setViolations] = useState<RecapViolation[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<RecapSendResult | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await getRecap(sessionId);
      setState(s); setSummary(s.summary); setUrl(s.nextEventUrl); setDirty(false);
    } catch (e) { setMsg({ kind: 'error', text: recapError(e).message }); }
  }, [sessionId]);
  useEffect(() => { load(); }, [load]);

  const edit = (patch: Partial<RecapSummary>) => { if (summary) { setSummary({ ...summary, ...patch }); setDirty(true); } };
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setMsg(null);
    try { await fn(); } catch (e) { const r = recapError(e); setMsg({ kind: 'error', text: r.message }); setViolations(r.violations); }
    finally { setBusy(null); }
  };

  if (!state || !summary) {
    return <div className="cls-modal" role="dialog" aria-label="Class recap"><div className="cls-modal-body"><p className="cls-empty">{msg ? msg.text : 'Loading the recap.'}</p><button type="button" className="cls-btn cls-btn-ghost" onClick={onClose}>Close</button></div></div>;
  }

  const save = () => run('save', async () => {
    const r = await saveRecap(sessionId, { summary, nextEventUrl: url.trim() });
    setViolations(r.violations); await load();
    setMsg({ kind: 'ok', text: r.violations.length ? 'Saved, but fix the flagged words before sending.' : 'Saved.' });
  });
  const draft = () => run('draft', async () => {
    const d = await draftRecap(sessionId);
    setSummary(d.summary); setViolations(d.violations); setDirty(d.source !== 'ai');
    if (d.source === 'ai') await load();
    setMsg({ kind: d.source === 'ai' ? 'ok' : 'error', text: d.source === 'ai' ? 'Drafted from the class deck. Read it, edit, then save.' : 'The draft did not come back; write the overview by hand.' });
  });
  const test = () => run('test', async () => { const r = await sendRecap(sessionId, 'test'); await load(); setMsg({ kind: 'ok', text: `Test copy sent to ${r.to}.` }); });
  const sendAll = () => run('send', async () => { const r = await sendRecap(sessionId, 'send'); setResult(r); setConfirming(false); await load(); });

  const ready = canSend({ ...state, nextEventUrl: url.trim() || state.nextEventUrl }, dirty);
  const skippedText = Object.entries(state.dry.skipped).map(([k, n]) => `${n} ${SKIP_LABEL[k] || k}`).join(', ');

  return (
    <div className="cls-modal" role="dialog" aria-label="Class recap" data-testid="recap-panel">
      <div className="cls-modal-body">
        <div className="cls-row" style={{ border: 0, padding: 0 }}>
          <div className="cls-row-main"><strong>Class recap: {state.session.title}</strong><span className="cls-row-when">{state.session.date}</span></div>
          <button type="button" className="cls-btn cls-btn-ghost" onClick={onClose}>Close</button>
        </div>

        <p className="cls-note" data-testid="recap-counts">
          {state.dry.checkedIn} checked in · {state.dry.toSend} will get the recap · {state.counts.sent} already sent
          {skippedText ? ` · skipped: ${skippedText}` : ''}{state.counts.failed ? ` · ${state.counts.failed} failed (Send again retries them)` : ''}
        </p>

        <label className="cls-label" htmlFor="rcp-url">Eventbrite link for the next class</label>
        <input id="rcp-url" className="cls-input" value={url} onChange={(e) => { setUrl(e.target.value); setDirty(true); }} placeholder="https://www.eventbrite.com/e/..." data-testid="recap-url" />

        <div className="cls-recap-actions">
          <button type="button" className="cls-btn cls-btn-ghost" onClick={draft} disabled={busy !== null} data-testid="recap-draft">{busy === 'draft' ? 'Drafting...' : 'Draft from the class deck'}</button>
        </div>

        <label className="cls-label" htmlFor="rcp-headline">Headline</label>
        <input id="rcp-headline" className="cls-input" value={summary.headline} onChange={(e) => edit({ headline: e.target.value })} />
        <label className="cls-label" htmlFor="rcp-intro">Intro</label>
        <textarea id="rcp-intro" className="cls-input" rows={2} value={summary.intro} onChange={(e) => edit({ intro: e.target.value })} />
        <span className="cls-label">Key ideas (up to 5): icon, title, one sentence</span>
        {summary.ideas.map((d, i) => (
          <div className="cls-recap-idea" key={i}>
            <input aria-label={`Idea ${i + 1} icon`} className="cls-input cls-recap-icon" value={d.icon} onChange={(e) => edit({ ideas: summary.ideas.map((x, j) => (j === i ? { ...x, icon: e.target.value } : x)) })} />
            <input aria-label={`Idea ${i + 1} title`} className="cls-input" value={d.title} onChange={(e) => edit({ ideas: summary.ideas.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
            <input aria-label={`Idea ${i + 1} sentence`} className="cls-input" value={d.text} onChange={(e) => edit({ ideas: summary.ideas.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
          </div>
        ))}
        {summary.ideas.length < 5 && <button type="button" className="cls-btn cls-btn-ghost" onClick={() => edit({ ideas: [...summary.ideas, { icon: '', title: '', text: '' }] })}>Add an idea</button>}
        <label className="cls-label" htmlFor="rcp-steps">What we built, one step per line</label>
        <textarea id="rcp-steps" className="cls-input" rows={4} value={summary.steps.join('\n')} onChange={(e) => edit({ steps: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 6) })} />
        <label className="cls-label" htmlFor="rcp-quote">Quote from the class</label>
        <input id="rcp-quote" className="cls-input" value={summary.quote} onChange={(e) => edit({ quote: e.target.value })} />
        <label className="cls-label" htmlFor="rcp-homework">One task for this week</label>
        <input id="rcp-homework" className="cls-input" value={summary.homework} onChange={(e) => edit({ homework: e.target.value })} />

        {violations.length > 0 && (
          <div className="cls-note cls-note-warn" role="alert" data-testid="recap-violations">
            Fix before sending: {violations.map((v) => `"${v.match}" in ${v.field}`).join('; ')}
          </div>
        )}
        {msg && <p className={msg.kind === 'error' ? 'cls-note cls-note-error' : 'cls-note'} role={msg.kind === 'error' ? 'alert' : 'status'}>{msg.text}</p>}

        <div className="cls-recap-actions">
          <button type="button" className="cls-btn cls-btn-ghost" onClick={save} disabled={busy !== null} data-testid="recap-save">{busy === 'save' ? 'Saving...' : 'Save'}</button>
          <button type="button" className="cls-btn cls-btn-ghost" onClick={test} disabled={busy !== null || dirty || !state.hasSavedSummary} data-testid="recap-test">{busy === 'test' ? 'Sending...' : 'Send a test to Ali'}</button>
          <button type="button" className="cls-btn cls-btn-primary" onClick={() => setConfirming(true)} disabled={busy !== null || !ready || state.dry.toSend === 0} data-testid="recap-send">
            Send to {state.dry.toSend} {state.dry.toSend === 1 ? 'person' : 'people'}
          </button>
        </div>
        {!ready && <p className="cls-label" data-testid="recap-send-why">To send: save the overview, paste the https Eventbrite link, then send the test to Ali.</p>}

        {confirming && (
          <div className="cls-note cls-note-warn" role="alertdialog" aria-label="Confirm send" data-testid="recap-confirm">
            <p>Send the recap to {state.dry.toSend} people who checked in? Each person gets it once.</p>
            <button type="button" className="cls-btn cls-btn-primary" onClick={sendAll} disabled={busy !== null} data-testid="recap-confirm-yes">{busy === 'send' ? 'Sending...' : 'Yes, send it'}</button>
            <button type="button" className="cls-btn cls-btn-ghost" onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        )}
        {result && (
          <p className="cls-note" role="status" data-testid="recap-result">
            Sent {result.sent}{result.failed ? `, ${result.failed} failed (send again to retry them)` : ''}{result.alreadySent ? `, ${result.alreadySent} already had it` : ''}.
          </p>
        )}
      </div>
    </div>
  );
}
