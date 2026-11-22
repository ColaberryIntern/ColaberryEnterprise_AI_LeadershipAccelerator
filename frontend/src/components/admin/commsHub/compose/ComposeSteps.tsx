import React, { useEffect, useState } from 'react';
import type { Channel, DestinationView, MessageKind, MessageView, Tone } from '../../../../services/commsHubApi';
import type { Compose } from './useCompose';
import RegistrantReachNote from './RegistrantReachNote';
import RichText from '../../../../pages/portal/community/RichText';
import { centralLabel, centralToIso, isoToCentral } from './centralTime';

/** The three steps of Compose (design 03, CH6.5): what it is about, check the message, who gets it and when. */
const KINDS: Array<[MessageKind, string]> = [
  ['reminder', 'Reminder, 1 day before'], ['announcement', 'Announcement'], ['starting_soon', 'Starting in 1 hour'], ['recording_thanks', 'Recording and thanks'],
  ['time_change', 'Change of time'], ['cancellation', 'Cancellation'], ['update', 'Update'], ['other', 'Something else'],
];
const TONES: Array<[Tone, string]> = [['friendly', 'Friendly · Colaberry default'], ['professional', 'Professional'], ['urgent', 'Urgent']];
const STATUS_WORDS: Record<string, string> = {
  draft: 'Draft', needs_approval: 'Needs approval', approved: 'Approved', scheduled: 'Approved and scheduled', sending: 'Sending',
  sent: 'Sent', partially_failed: 'Partly sent', failed: 'Failed', cancelled: 'Cancelled',
};

export function StepStart({ c }: { c: Compose }): React.ReactElement {
  const { form, setForm, events, busy, message } = c;
  const f = (p: Partial<typeof form>) => setForm({ ...form, ...p });
  const ev = events.find((e) => e.id === form.eventId);
  const locked = !!message;
  return (
    <section aria-labelledby="ch-c1" className="ch-compose-step">
      <h2 id="ch-c1" className="ch-studio-h">1. What is it about?</h2>
      <fieldset disabled={locked || busy !== null}>
        <legend className="form-label">Start from</legend>
        <div className="d-flex gap-3 mb-2">
          {(['event', 'subject'] as const).map((v) => (
            <div className="form-check" key={v}>
              <input className="form-check-input" type="radio" name="ch-from" id={`ch-from-${v}`} checked={form.from === v} onChange={() => f({ from: v })} />
              <label className="form-check-label" htmlFor={`ch-from-${v}`}>{v === 'event' ? 'An event' : 'A subject'}</label>
            </div>
          ))}
        </div>
        {form.from === 'event' ? (
          <div className="mb-2">
            <label className="form-label" htmlFor="ch-c-event">Event</label>
            <select id="ch-c-event" className="form-select" value={form.eventId} onChange={(e) => f({ eventId: e.target.value })}>
              {events.length === 0 && <option value="">No upcoming events</option>}
              {events.map((e) => <option key={e.id} value={e.id}>{e.title} {'·'} {e.central.label}</option>)}
            </select>
            {ev && <p className="ch-studio-hint mt-1 mb-0"><strong>{ev.title}</strong> {'·'} {ev.central.label}. Date, time, links and hosts come from the event.</p>}
          </div>
        ) : (
          <div className="mb-2">
            <label className="form-label" htmlFor="ch-c-subject">What is it about?</label>
            <input id="ch-c-subject" className="form-control" value={form.subject} maxLength={300} onChange={(e) => f({ subject: e.target.value })} />
          </div>
        )}
        <div className="row g-2">
          <div className="col-12">
            <label className="form-label" htmlFor="ch-c-kind">Kind of message</label>
            <select id="ch-c-kind" className="form-select" value={form.kind} onChange={(e) => f({ kind: e.target.value as MessageKind })}>
              {KINDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="col-12">
            <fieldset>
              <legend className="form-label">Tone</legend>
              {TONES.map(([v, l]) => (
                <div className="form-check" key={v}>
                  <input className="form-check-input" type="radio" name="ch-tone" id={`ch-tone-${v}`} checked={form.tone === v} onChange={() => f({ tone: v })} />
                  <label className="form-check-label" htmlFor={`ch-tone-${v}`}>{l}</label>
                </div>
              ))}
            </fieldset>
          </div>
        </div>
        <label className="form-label mt-2" htmlFor="ch-c-notes">Anything to add? (optional)</label>
        <textarea id="ch-c-notes" className="form-control" rows={2} maxLength={1000} value={form.notes} onChange={(e) => f({ notes: e.target.value })} />
        {form.from === 'event' && (
          <fieldset className="mt-2">
            <legend className="form-label">Include</legend>
            {([['thumbnail', 'Event thumbnail'], ['join_link', 'Join link'], ['registration_link', 'Registration link']] as const).map(([k, l]) => (
              <div className="form-check form-check-inline" key={k}>
                <input className="form-check-input" type="checkbox" id={`ch-inc-${k}`} checked={form.include[k]} onChange={(e) => f({ include: { ...form.include, [k]: e.target.checked } })} />
                <label className="form-check-label" htmlFor={`ch-inc-${k}`}>{l}</label>
              </div>
            ))}
          </fieldset>
        )}
      </fieldset>
      <div className="d-flex gap-2 mt-3">
        {!message && <button type="button" className="btn ch-btn-berry comms-hub-action" disabled={busy !== null || (form.from === 'event' ? !form.eventId : !form.subject.trim())} onClick={() => void c.start()}>{busy === 'create' ? 'Writing...' : 'Write it'}</button>}
        {message && <button type="button" className="btn btn-outline-secondary comms-hub-action" onClick={c.startOver}>Start a new message</button>}
      </div>
    </section>
  );
}

function PostPreview({ m }: { m: MessageView }): React.ReactElement {
  const d = m.drafts.community_post;
  const [broken, setBroken] = useState(false);
  const banner = m.include.thumbnail && m.event?.thumbnail_id ? `/api/comms-hub/thumbnails/${m.event.id}/3x1.png?v=${m.event.thumbnail_id}` : null;
  return (
    <figure className="ch-prev-feed" aria-label="How it looks in the community feed">
      <div className="ch-prev-head"><span className="ch-prev-avatar" aria-hidden="true">C</span><span><strong>Colaberry Team</strong><span className="ch-prev-sub">Announcement</span></span></div>
      {banner && !broken && <img className="ch-prev-banner" src={banner} alt="" onError={() => setBroken(true)} />}
      {/* The portal renders post bodies with RichText (links become links); the preview uses the same. */}
      <p className="ch-prev-body" style={{ whiteSpace: 'pre-wrap' }}>{d ? <RichText text={d.body} /> : 'No community post yet.'}</p>
      {m.event && <div className="ch-prev-event"><strong>{m.event.title}</strong><span className="ch-prev-sub">{m.event.when}</span></div>}
    </figure>
  );
}

function BellPreview({ m }: { m: MessageView }): React.ReactElement {
  const d = m.drafts.in_app;
  return (
    <figure className="ch-prev-bell" aria-label="How it looks in the notification bell">
      <span className="ch-prev-bell-ic" aria-hidden="true"><i className="ri-notification-3-line" /></span>
      <span className="ch-prev-bell-text"><strong>{d?.title ?? 'No notification yet.'}</strong> {d?.body}{m.event && <span className="ch-prev-link">Open event</span>}<span className="ch-prev-time">now</span></span>
    </figure>
  );
}

function Editor({ c, channel }: { c: Compose; channel: Channel }): React.ReactElement {
  const d = c.message!.drafts[channel];
  const [title, setTitle] = useState(d?.title ?? '');
  const [body, setBody] = useState(d?.body ?? '');
  useEffect(() => { setTitle(d?.title ?? ''); setBody(d?.body ?? ''); }, [d?.id, d?.title, d?.body]);
  const changed = body !== (d?.body ?? '') || (channel === 'in_app' && title !== (d?.title ?? ''));
  const locked = ['sending', 'sent', 'cancelled'].includes(c.message!.status) || c.busy !== null;
  const unsaved = changed && !['sending', 'sent', 'cancelled'].includes(c.message!.status);
  useEffect(() => {
    const key = `edit:${channel}`;
    c.register(key, unsaved ? () => (body.trim() ? c.edit(channel, { title: channel === 'in_app' ? title : null, body }) : Promise.resolve((c.refuse('A message cannot be empty.'), false))) : null);
    return () => c.register(key, null);
  });
  return (
    <div className="mt-2">
      {channel === 'in_app' && (<><label className="form-label" htmlFor="ch-e-title">Title</label><input id="ch-e-title" className="form-control mb-2" maxLength={120} value={title} disabled={locked} onChange={(e) => setTitle(e.target.value)} /></>)}
      <label className="form-label" htmlFor={`ch-e-${channel}`}>{channel === 'in_app' ? 'Short text' : 'Edit the community post'}</label>
      <textarea id={`ch-e-${channel}`} className="form-control" rows={channel === 'in_app' ? 2 : 4} maxLength={2000} value={body} disabled={locked} onChange={(e) => setBody(e.target.value)} />
      <button type="button" className="btn btn-outline-secondary comms-hub-action mt-2" disabled={locked || !changed || !body.trim()} onClick={() => void c.edit(channel, { title: channel === 'in_app' ? title : null, body })}>{c.busy === 'edit' ? 'Saving...' : 'Save my changes'}</button>
    </div>
  );
}

export function StepCheck({ c }: { c: Compose }): React.ReactElement {
  const m = c.message!;
  const [tab, setTab] = useState<Channel>('community_post');
  const post = m.drafts.community_post;
  const by = post ? (post.author === 'ai' ? 'written by AI' : 'edited by you') : '';
  const locked = ['sending', 'sent', 'cancelled'].includes(m.status) || c.busy !== null;
  return (
    <section aria-labelledby="ch-c2" className="ch-compose-step">
      <h2 id="ch-c2" className="ch-studio-h">2. Check the message <span className="fw-normal text-muted">{post ? `Draft ${post.version} · ${by}` : ''}</span></h2>
      {m.problems.length > 0 && (
        <div className="alert alert-warning py-2" role="note">
          <p className="fw-bold mb-1">Before it can be approved:</p>
          <ul className="mb-0">{m.problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
      <div className="ch-compose-tabs" role="tablist" aria-label="Channels">
        {(['community_post', 'in_app'] as const).map((ch) => (
          <button key={ch} type="button" role="tab" id={`ch-tab-${ch}`} aria-selected={tab === ch} aria-controls={`ch-panel-${ch}`} tabIndex={tab === ch ? 0 : -1}
            className={`ch-compose-tab${tab === ch ? ' active' : ''}`} onClick={() => setTab(ch)}
            onKeyDown={(e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const next = ch === 'community_post' ? 'in_app' : 'community_post'; setTab(next); document.getElementById(`ch-tab-${next}`)?.focus(); } }}>
            {ch === 'community_post' ? 'Community post' : 'In-app notification'}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="ch-panel-community_post" aria-labelledby="ch-tab-community_post" hidden={tab !== 'community_post'}>
        <h3 className="ch-prev-h">How it looks in the community feed</h3><PostPreview m={m} /><Editor c={c} channel="community_post" />
      </div>
      <div role="tabpanel" id="ch-panel-in_app" aria-labelledby="ch-tab-in_app" hidden={tab !== 'in_app'}>
        <h3 className="ch-prev-h">How it looks in the notification bell</h3><BellPreview m={m} /><Editor c={c} channel="in_app" />
      </div>
      <div className="d-flex flex-wrap align-items-center gap-2 mt-3">
        <span className="ch-studio-hint">Ask AI to make it:</span>
        {([['shorter', 'Shorter'], ['warmer', 'Warmer'], ['more_detail', 'More detail']] as const).map(([v, l]) => (
          <button type="button" key={v} className="btn btn-outline-secondary comms-hub-action" disabled={locked} onClick={() => void c.regenerate(v)}>{l}</button>
        ))}
      </div>
      <details className="ch-compose-versions mt-2">
        <summary>See earlier drafts ({m.versions.length})</summary>
        <ol className="mb-0">
          {m.versions.map((v) => (
            <li key={v.id}><strong>{v.channel === 'in_app' ? 'In-app' : 'Community post'} draft {v.version}</strong> ({v.author === 'ai' ? `AI${v.instruction && v.instruction !== 'edit' ? `, ${v.instruction.replace('_', ' ')}` : ''}` : 'your edit'}): {v.title ? `${v.title}: ` : ''}{v.body}</li>
          ))}
        </ol>
      </details>
    </section>
  );
}

const keyOf = (d: DestinationView): string => `${d.channel}|${d.target_type}|${d.target_id}`;

export function StepApprove({ c }: { c: Compose }): React.ReactElement {
  const m = c.message!;
  const [picked, setPicked] = useState<Set<string>>(new Set(m.destinations.map(keyOf)));
  const [mode, setMode] = useState<'now' | 'at'>(m.send_at ? 'at' : 'now');
  const initial = m.send_at ? isoToCentral(m.send_at) : { date: '', time: '18:00' };
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [note, setNote] = useState('');
  const savedKeys = m.destinations.map(keyOf).join(',');
  useEffect(() => { setPicked(new Set(m.destinations.map(keyOf))); setMode(m.send_at ? 'at' : 'now'); }, [m.id, savedKeys, m.send_at]);
  const [confirmCancel, setConfirmCancel] = useState(false);
  // The message's own rows win over the plain options, so a recipient already sent to keeps its lock.
  const all = [...c.options.map((o) => m.destinations.find((d) => keyOf(d) === keyOf(o)) ?? o), ...m.destinations.filter((d) => !c.options.some((o) => keyOf(o) === keyOf(d)))];
  const editable = !['sending', 'sent', 'cancelled'].includes(m.status) && c.busy === null;
  const chosen = all.filter((d) => picked.has(keyOf(d)));
  const recipientsChanged = chosen.length !== m.destinations.length || chosen.some((d) => !m.destinations.some((x) => keyOf(x) === keyOf(d)));
  const wantIso = mode === 'now' ? null : centralToIso(date, time);
  // "At a set time" with no date or time yet is a change too: it must not quietly mean "now".
  const timeIncomplete = mode === 'at' && !wantIso;
  const timeChanged = timeIncomplete || (wantIso ?? null) !== (m.send_at ? new Date(m.send_at).toISOString() : null);
  const open = !['sending', 'sent', 'cancelled'].includes(m.status);
  useEffect(() => {
    c.register('recipients', open && recipientsChanged ? () => c.setRecipients(chosen) : null);
    c.register('time', !open || !timeChanged ? null
      : timeIncomplete ? () => Promise.resolve((c.refuse('Pick a date and a time, or choose "As soon as I approve".'), false))
        : () => c.setTime(wantIso));
    return () => { c.register('recipients', null); c.register('time', null); };
  });
  const feeds = m.destinations.filter((d) => d.channel === 'community_post');
  const inApp = m.destinations.filter((d) => d.channel === 'in_app');
  const approved = m.status === 'approved' || m.status === 'scheduled';
  return (
    <section aria-labelledby="ch-c3" className="ch-compose-step">
      <h2 id="ch-c3" className="ch-studio-h">3. Who gets it, and when</h2>
      <p className="ch-studio-hint">{m.event ? 'AI picked everyone invited to this event.' : 'AI picked every open cohort.'} Change anything you like.</p>
      <fieldset disabled={!editable}>
        <legend className="form-label">On the platform</legend>
        {all.map((d) => (
          <div className="form-check" key={keyOf(d)}>
            <input className="form-check-input" type="checkbox" id={`ch-to-${keyOf(d)}`} checked={picked.has(keyOf(d))} disabled={!!d.has_delivery}
              onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(keyOf(d))) n.delete(keyOf(d)); else n.add(keyOf(d)); return n; })} />
            <label className="form-check-label" htmlFor={`ch-to-${keyOf(d)}`}>{d.channel === 'in_app' ? 'In-app notification: ' : 'Community feed: '}{d.label}{d.has_delivery ? ' (already sent)' : ''}</label>
            {/* CH9.6: before approving, how many registrants this actually reaches. */}
            {d.target_type === 'event_registrants' && <RegistrantReachNote hubEventId={d.target_id} />}
          </div>
        ))}
        {recipientsChanged && <button type="button" className="btn btn-outline-secondary comms-hub-action mt-1" onClick={() => void c.setRecipients(chosen)}>{c.busy === 'recipients' ? 'Saving...' : 'Save recipients'}</button>}
      </fieldset>
      <fieldset className="mt-3" disabled={!editable}>
        <legend className="form-label">When</legend>
        <div className="form-check"><input className="form-check-input" type="radio" name="ch-when" id="ch-when-now" checked={mode === 'now'} onChange={() => setMode('now')} /><label className="form-check-label" htmlFor="ch-when-now">As soon as I approve</label></div>
        <div className="form-check"><input className="form-check-input" type="radio" name="ch-when" id="ch-when-at" checked={mode === 'at'} onChange={() => setMode('at')} /><label className="form-check-label" htmlFor="ch-when-at">At a set time (Central)</label></div>
        {mode === 'at' && (
          <div className="d-flex flex-wrap gap-2 mt-1">
            <div><label className="form-label" htmlFor="ch-when-date">Date</label><input id="ch-when-date" type="date" className="form-control" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div><label className="form-label" htmlFor="ch-when-time">Time</label><input id="ch-when-time" type="time" className="form-control" value={time} onChange={(e) => setTime(e.target.value)} /></div>
          </div>
        )}
        {timeChanged && (mode === 'now' || wantIso) && <button type="button" className="btn btn-outline-secondary comms-hub-action mt-2" onClick={() => void c.setTime(wantIso)}>{c.busy === 'time' ? 'Saving...' : 'Save the time'}</button>}
      </fieldset>

      <div className="ch-compose-summary mt-3" aria-labelledby="ch-c-summary">
        <h3 id="ch-c-summary" className="ch-prev-h">{approved ? STATUS_WORDS[m.status] : 'You are approving'}</h3>
        <ul className="mb-1">
          {feeds.length > 0 && <li>1 community post{m.include.thumbnail && m.event?.thumbnail_id ? ' with banner' : ''} to {feeds.length} {feeds.length === 1 ? 'feed' : 'feeds'}</li>}
          {inApp.length > 0 && <li>1 in-app notification to {inApp.map((d) => d.label).join(', ')}</li>}
          {feeds.length + inApp.length === 0 && <li>No recipients yet</li>}
          <li>{m.send_at ? centralLabel(m.send_at) : 'As soon as it is approved'}</li>
        </ul>
        <p className="ch-studio-hint mb-0">If the message or the recipients change after this, it comes back to you for approval.</p>
      </div>

      <div className="d-flex flex-wrap gap-2 mt-3">
        {m.status === 'draft' && <button type="button" className="btn ch-btn-berry comms-hub-action" disabled={c.busy !== null} onClick={() => void c.submit()}>{c.busy === 'submit' ? 'Submitting...' : 'Submit for approval'}</button>}
        {(m.status === 'draft' || m.status === 'needs_approval') && <button type="button" className="btn btn-primary comms-hub-action" disabled={c.busy !== null} onClick={() => void c.approve()}>{c.busy === 'approve' ? 'Approving...' : 'Approve and schedule'}</button>}
        {m.status === 'needs_approval' && (
          <>
            <label className="visually-hidden" htmlFor="ch-reject-note">Why it is rejected (optional)</label>
            <input id="ch-reject-note" className="form-control ch-reject-note" placeholder="Why (optional)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
            <button type="button" className="btn btn-outline-danger comms-hub-action" disabled={c.busy !== null} onClick={() => void c.reject(note.trim() || null)}>Reject</button>
          </>
        )}
        {m.status === 'draft' && <button type="button" className="btn btn-outline-secondary comms-hub-action" disabled={c.busy !== null} onClick={() => void c.keepDraft()}>Save as draft</button>}
        {approved && <button type="button" className="btn btn-outline-secondary comms-hub-action" disabled={c.busy !== null} onClick={() => void c.undo()}>Undo approval</button>}
        {open && !confirmCancel && <button type="button" className="btn btn-link comms-hub-action" disabled={c.busy !== null} onClick={() => setConfirmCancel(true)}>Cancel this message</button>}
      </div>
      {open && confirmCancel && (
        <div className="alert alert-warning py-2 mt-2" role="group" aria-labelledby="ch-cancel-q">
          <p id="ch-cancel-q" className="mb-2">Cancel this message? It will not be sent, and this cannot be undone.</p>
          <div className="d-flex flex-wrap gap-2">
            <button type="button" className="btn btn-danger comms-hub-action" disabled={c.busy !== null} onClick={() => { setConfirmCancel(false); void c.cancel(); }}>Yes, cancel it</button>
            <button type="button" className="btn btn-outline-secondary comms-hub-action" onClick={() => setConfirmCancel(false)}>Keep it</button>
          </div>
        </div>
      )}
    </section>
  );
}

export { STATUS_WORDS };
