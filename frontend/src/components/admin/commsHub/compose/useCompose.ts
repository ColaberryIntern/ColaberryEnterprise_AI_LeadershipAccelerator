import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  apiErrorMessage, apiProblems, createMessage, editMessageDraft, getDestinationOptions, getMessage, listHubEvents, messageAction,
  regenerateMessage, rejectHubMessage, setMessageDestinations, setMessageSendTime,
  type Channel, type DestinationView, type HubEvent, type MessageKind, type MessageView, type Tone,
} from '../../../../services/commsHubApi';

/**
 * Compose state (CH6.5, design 03). The URL holds the message (?message=<id>) so a reload or a link
 * from Today / the promotion plan lands on it; ?text= carries the Today box's words into step 1.
 * Every action answers with the message as it now is; an edit that voided an approval is said in words.
 */
export interface StartForm { from: 'event' | 'subject'; eventId: string; subject: string; kind: MessageKind; tone: Tone; notes: string; include: { thumbnail: boolean; join_link: boolean; registration_link: boolean } }

export type Busy = null | 'create' | 'regenerate' | 'edit' | 'recipients' | 'time' | 'submit' | 'approve' | 'reject' | 'undo' | 'cancel';

const APPROVED = new Set(['approved', 'scheduled', 'partially_failed', 'failed']);
const CHANGES = new Set<Busy>(['edit', 'regenerate', 'recipients', 'time']);

export function useCompose() {
  const [params, setParams] = useSearchParams();
  const messageId = params.get('message');
  const [message, setMessage] = useState<MessageView | null>(null);
  const [events, setEvents] = useState<HubEvent[]>([]);
  const [options, setOptions] = useState<DestinationView[]>([]);
  const [form, setForm] = useState<StartForm>(() => ({
    from: params.get('text') ? 'subject' : 'event', eventId: '', subject: params.get('text') ?? '', kind: 'reminder', tone: 'friendly', notes: '',
    include: { thumbnail: true, join_link: true, registration_link: true },
  }));
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * Unsaved changes on screen (an edited draft, ticked recipients, a typed time). Each step registers a
   * save while it has one; "Approve and schedule" and "Save as draft" run them all first, so they act on
   * exactly what is on screen, and stop if one is refused.
   */
  const pending = useRef(new Map<string, () => Promise<boolean>>());
  const register = useCallback((key: string, save: (() => Promise<boolean>) | null) => {
    if (save) pending.current.set(key, save); else pending.current.delete(key);
  }, []);
  // One save-then-act sequence at a time: a double click must not write a second version.
  const acting = useRef(false);
  const once = async (act: () => Promise<unknown>): Promise<void> => {
    if (acting.current) return;
    acting.current = true;
    try { await act(); } finally { acting.current = false; }
  };
  const flush = async (): Promise<boolean> => {
    for (const [key, save] of Array.from(pending.current)) {
      if (!(await save())) return false;
      pending.current.delete(key);
    }
    return true;
  };

  useEffect(() => {
    listHubEvents('upcoming').then((e) => { setEvents(e); setForm((f) => (f.eventId || !e[0] ? f : { ...f, eventId: e[0].id })); }, () => setEvents([]));
  }, []);
  // CH9.6: the options follow the open message's event, so a managed Eventbrite event offers its registrants.
  const optionsEventId = message?.event?.id ?? null;
  useEffect(() => {
    getDestinationOptions(optionsEventId).then(setOptions, () => setOptions([]));
  }, [optionsEventId]);
  // The message already on screen (just created or changed here) is not fetched again when the URL catches up.
  const shown = useRef<string | null>(null);
  useEffect(() => {
    if (!messageId) { shown.current = null; setMessage(null); return; }
    if (shown.current === messageId) return;
    shown.current = messageId;
    getMessage(messageId).then(setMessage, (err) => setError(apiErrorMessage(err, 'That message did not load.')));
  }, [messageId]);

  // Step 1 shows what the open message was written from (not the defaults), once per message.
  useEffect(() => {
    if (!message) return;
    setForm({
      from: message.event ? 'event' : 'subject', eventId: message.event?.id ?? '', subject: message.subject ?? '',
      kind: message.kind, tone: message.tone ?? 'friendly', notes: message.notes ?? '',
      include: { thumbnail: message.include.thumbnail !== false, join_link: message.include.join_link !== false, registration_link: message.include.registration_link !== false },
    });
  }, [message?.id]);

  const run = useCallback(async (what: Busy, call: () => Promise<MessageView>, done?: (before: MessageView | null, after: MessageView) => string | null): Promise<boolean> => {
    setBusy(what); setError(null); setProblems([]); setNotice(null);
    const before = message;
    try {
      const after = await call();
      shown.current = after.id;
      setMessage(after);
      if (after.id !== messageId) setParams({ message: after.id }, { replace: false });
      // Only a change to the content can void an approval; Undo moves to needs_approval on purpose.
      const voided = CHANGES.has(what) && before && APPROVED.has(before.status) && after.status === 'needs_approval';
      setNotice(voided ? 'This changed what was approved, so it needs approval again.' : done?.(before, after) ?? null);
      return true;
    } catch (err) {
      setProblems(apiProblems(err));
      setError(apiErrorMessage(err, 'That did not work. Try again.'));
      // A refusal can mean someone else changed it: show the message as it now is.
      const current = message?.id ?? messageId;
      if (current) await Promise.resolve().then(() => getMessage(current)).then((now) => { if (now) setMessage(now); }, () => undefined);
      return false;
    } finally { setBusy(null); }
  }, [message, messageId, setParams]);

  const id = message?.id ?? '';
  return {
    message, events, options, form, setForm, busy, error, problems, notice,
    start: () => run('create', () => createMessage({
      event_id: form.from === 'event' ? form.eventId || null : null, subject: form.from === 'subject' ? form.subject.trim() || null : null,
      kind: form.kind, tone: form.tone, notes: form.notes.trim() || null, include: form.include,
    }), () => 'The AI wrote a first draft. Check it below.'),
    regenerate: (i: 'shorter' | 'warmer' | 'more_detail') => run('regenerate', () => regenerateMessage(id, i), () => 'A new draft was written. Earlier drafts are kept.'),
    edit: (channel: Channel, text: { title?: string | null; body: string }) => run('edit', () => editMessageDraft(id, channel, text), () => 'Saved as a new draft.'),
    setRecipients: (d: DestinationView[]) => run('recipients', () => setMessageDestinations(id, d)),
    setTime: (iso: string | null) => run('time', () => setMessageSendTime(id, iso)),
    /** Saves what is on screen first, then submits it, so the approver sees exactly this. */
    submit: () => once(async () => { if (await flush()) await run('submit', () => messageAction(id, 'submit'), () => 'It is ready for approval.'); }),
    /** Saves what is on screen first, then approves and schedules (a draft is submitted in the same step). */
    approve: () => once(async () => { if (await flush()) await run('approve', () => messageAction(id, 'approve'), () => 'Approved. It is scheduled to go out.'); }),
    reject: (note: string | null) => run('reject', () => rejectHubMessage(id, note), () => 'Rejected. It is back to draft for changes.'),
    undo: () => run('undo', () => messageAction(id, 'undo'), () => 'Approval undone. Nothing will be sent until it is approved again.'),
    cancel: () => run('cancel', () => messageAction(id, 'cancel'), () => 'Cancelled. It will not be sent.'),
    startOver: () => { pending.current.clear(); setParams({}); setMessage(null); setError(null); setProblems([]); setNotice(null); },
    /** Saves every unsaved change on screen; it stays a draft until it is submitted or approved. */
    keepDraft: () => once(async () => { if (await flush()) setNotice('Saved. It stays a draft until you submit it for approval.'); }),
    register,
    /** A step refusing to save (for example a half-typed time) says why in the same alert as the server. */
    refuse: (why: string) => { setProblems([]); setNotice(null); setError(why); },
  };
}
export type Compose = ReturnType<typeof useCompose>;
