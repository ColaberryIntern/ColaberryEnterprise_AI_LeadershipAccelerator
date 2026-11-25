import React, { useCallback, useEffect, useRef, useState } from 'react';
import { trapTab } from '../campus/focusTrap';
import { collectContext, installRecorders } from '../../pages/admin/marketing/bugReport/reportContext';
import { fetchFeedback, markFeedbackSeen, sendFeedback, watchPortalFailures, type FeedbackItem, type FeedbackKind } from './feedbackApi';
import { shrinkImage } from './logic/shrinkImage';
import { useEscapeLayer } from './useEscapeLayer';
import './feedbackPanel.css';

/**
 * Career Prep pilot feedback (Ali, 2026-11-25): "a feedback mechanism in the app where they can submit feedback and ways
 * to make it better". A button on every Career Prep screen (above the sheets) opens one form: what kind, what happened,
 * what would make it better, an optional screenshot (pasted or picked). The page, the open tab, errors and failed
 * requests go along. Below it: everything this student sent, with where it stands and our answer; a badge counts unread
 * answers. A failed send keeps what was typed, and the same attempt key makes a retry the same item.
 */
export const KINDS: ReadonlyArray<{ key: FeedbackKind; icon: string; label: string; ask: string }> = [
  { key: 'broken', icon: 'ri-bug-line', label: 'Something broke', ask: 'What did you do, and what happened?' },
  { key: 'confusing', icon: 'ri-question-line', label: 'It confused me', ask: 'What was not clear?' },
  { key: 'idea', icon: 'ri-lightbulb-line', label: 'I have an idea', ask: 'What is your idea?' },
  { key: 'works', icon: 'ri-thumb-up-line', label: 'This works well', ask: 'What worked for you?' },
];
export const STATUS_LABEL: Record<FeedbackItem['status'], string> = { new: 'Received', looking: 'Looking into it', fixed: 'Fixed', planned: 'Planned', not_now: 'Not now' };
const newKey = () => `fb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
const serverSays = (err: unknown) => (err as { response?: { data?: { error?: string } } })?.response?.data?.error;

export interface FeedbackPanelProps { tab: string; sheet?: string; interviewId?: string }

function Screenshot({ shot, onFile, onRemove }: { shot: string | null; onFile: (f: File | null | undefined) => void; onRemove: () => void }): React.ReactElement {
  if (shot) return <div className="cp-pfb-shot"><img src={shot} alt="Your screenshot" /><button type="button" className="cp-linkbtn" onClick={onRemove}>Remove picture</button></div>;
  return (
    <label className="cp-pfb-pick">Add a screenshot: paste it here, or choose a picture (optional)
      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} data-testid="cp-pfb-file" />
    </label>
  );
}

function FeedbackForm({ where, onSent }: { where: FeedbackPanelProps; onSent: (i: FeedbackItem) => void }): React.ReactElement {
  const [kind, setKind] = useState<FeedbackKind>('broken');
  const [message, setMessage] = useState('');
  const [better, setBetter] = useState('');
  const [shot, setShot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const key = useRef(newKey());

  const addImage = async (file: File | null | undefined) => {
    if (!file) return;
    const small = await shrinkImage(file);
    if (small) { setShot(small); setNote(null); } else setNote({ ok: false, text: 'That picture could not be read. Try another one.' });
  };
  const onPaste = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'));
    if (item) { e.preventDefault(); void addImage(item.getAsFile()); }
  };
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || message.trim().length < 5) return;
    setBusy(true);
    setNote(null);
    try {
      const c = collectContext(null);
      onSent(await sendFeedback({
        clientKey: key.current, kind, message: message.trim(), better: better.trim() || undefined, screenshot: shot ?? undefined,
        context: { pageUrl: c.pageUrl.slice(0, 1000), tab: where.tab, sheet: where.sheet, interviewId: where.interviewId, browser: c.browser.slice(0, 500), viewport: c.viewport,
          errors: c.errors.slice(-15), failedRequests: c.failedRequests.slice(-15).map((r) => ({ ...r, url: r.url.slice(0, 600) })) },
      }));
      key.current = newKey();
      setMessage('');
      setBetter('');
      setShot(null);
      setNote({ ok: true, text: 'Sent. Thank you. We will answer you right here.' });
    } catch (err) {
      setNote({ ok: false, text: serverSays(err) ?? 'Could not send it. Try again; your words are still here.' });
    } finally { setBusy(false); }
  };

  return (
    <form className="cp-pfb-form" onSubmit={(e) => { void send(e); }} onPaste={onPaste}>
      <div className="cp-pfb-kinds" role="group" aria-label="What kind of feedback">
        {KINDS.map((k) => (
          <button key={k.key} type="button" className={`cp-pfb-kind${kind === k.key ? ' is-on' : ''}`} aria-pressed={kind === k.key} onClick={() => setKind(k.key)} data-testid={`cp-pfb-kind-${k.key}`}>
            <i className={k.icon} aria-hidden="true" />{k.label}
          </button>
        ))}
      </div>
      <label>{KINDS.find((k) => k.key === kind)!.ask}<textarea rows={3} maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)} data-testid="cp-pfb-message" /></label>
      <label>What would make it better? (optional)<textarea rows={2} maxLength={4000} value={better} onChange={(e) => setBetter(e.target.value)} data-testid="cp-pfb-better" /></label>
      <Screenshot shot={shot} onFile={(f) => { void addImage(f); }} onRemove={() => setShot(null)} />
      <p className="cp-muted cp-pfb-privacy">We also send the page you are on and any errors it had. Your recordings are not sent.</p>
      {note && <p role={note.ok ? 'status' : 'alert'} className={note.ok ? 'cp-pfb-ok' : 'cp-form-problem'}>{note.text}</p>}
      <button type="submit" className="cp-send" disabled={busy || message.trim().length < 5} data-testid="cp-pfb-send">{busy ? 'Sending...' : 'Send feedback'}</button>
    </form>
  );
}

function Sent({ items }: { items: FeedbackItem[] }): React.ReactElement | null {
  if (!items.length) return null;
  return (
    <section aria-label="What you sent">
      <h3>What you sent</h3>
      <ul className="cp-pfb-list">{items.map((i) => (
        <li key={i.id} data-testid="cp-pfb-item">
          <span className={`cp-pill ${i.status === 'fixed' ? 'ok' : i.status === 'new' ? '' : 'info'}`}>{STATUS_LABEL[i.status]}</span>
          {i.unread && <span className="cp-pill warn">New answer</span>}
          <p>{i.message}</p>
          {i.reply && <p className="cp-pfb-reply"><b>Our answer:</b> <span>{i.reply}</span></p>}
        </li>
      ))}</ul>
    </section>
  );
}

export function FeedbackPanel(where: FeedbackPanelProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const title = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const load = useCallback(async (): Promise<FeedbackItem[]> => {
    // A list that will not load never blocks the form.
    try { const got = await fetchFeedback(); setItems(got); return got; } catch { return []; }
  }, []);
  const close = useCallback(() => {
    setOpen(false);
    setItems((all) => all.map((i) => ({ ...i, unread: false })));
    opener.current?.focus();
  }, []);
  // Recording starts with the room: the error worth reading happened before anyone opened the form.
  useEffect(() => { installRecorders(); watchPortalFailures(); void load(); }, [load]);
  useEscapeLayer(open, close);
  useEffect(() => {
    if (!open) return;
    title.current?.focus();
    void load().then((got) => { if (got.some((i) => i.unread)) markFeedbackSeen().catch(() => undefined); });
  }, [open, load]);
  const unread = items.filter((i) => i.unread).length;

  return (
    <>
      <button ref={opener} type="button" className="cp-pfb-open" onClick={() => setOpen(true)} data-testid="cp-pfb-open"
        aria-label={unread ? `Give feedback, ${unread} new ${unread === 1 ? 'answer' : 'answers'}` : 'Give feedback'}>
        <i className="ri-feedback-line" aria-hidden="true" />Give feedback{unread > 0 && <span className="cp-pfb-badge">{unread}</span>}
      </button>
      {open && (
        <div className="cp-pfb-layer">
          <button type="button" className="cp-sheet-scrim" aria-label="Close feedback" tabIndex={-1} onClick={close} />
          <section className="cp-pfb" role="dialog" aria-modal="true" aria-labelledby="cp-pfb-title" onKeyDown={trapTab} data-testid="cp-pfb">
            <header>
              <h2 id="cp-pfb-title" ref={title} tabIndex={-1}>Help us make this better</h2>
              <button type="button" className="cp-ghost sm" onClick={close} data-testid="cp-pfb-close">Close</button>
            </header>
            <FeedbackForm where={where} onSent={(i) => setItems((all) => [i, ...all.filter((x) => x.id !== i.id)])} />
            <Sent items={items} />
          </section>
        </div>
      )}
    </>
  );
}
