import { useCallback, useEffect, useState } from 'react';
import {
  apiErrorMessage, cancelHubEvent, type CancelCascade, createHubEvent, describeHubEvent, duplicateHubEvent, getHubEvent, listHubCohorts, updateHubEvent,
  type HubCohort, type HubEvent,
} from '../../../../services/commsHubApi';
import { emptyForm, fromEvent, toInput, validate, type EventFormState, type FormErrors } from './eventForm';
import type { DescribeControls } from './EventFormFields';

/** What the organizer is told after cancelling (CH7.3): what stopped, and what is still to do. */
export function cancelNotice(c: CancelCascade | null): string {
  const parts = ['Cancelled. It is off the calendar and the Events page.'];
  if (!c) return parts[0];
  const stopped = c.messages_cancelled + c.sending_voided;
  if (stopped > 0) parts.push(`${stopped} ${stopped === 1 ? 'message' : 'messages'} about it will not be sent.`);
  if (c.broadcast === 'cancelled') parts.push('The live stream prepared for it was cancelled too.');
  if (c.broadcast === 'failed') parts.push('The live stream prepared for it could not be cancelled yet. It cannot go live while the event is cancelled; try cancelling it again below.');
  // A retried stream cancel reports only the stream (the messages were handled the first time).
  if (c.messages_cancelled + c.deliveries_cancelled + c.sending_voided === 0 && !c.draft_message_id && c.broadcast === 'cancelled') return parts.join(' ');
  parts.push(c.draft_message_id ? 'A message telling people it is cancelled is ready for you to review.' : 'Tell people it is cancelled from Compose.');
  return parts.join(' ');
}

/**
 * The event editor's state and actions (CH3.2). Every server call reports failure in plain words
 * and leaves the form as the organizer left it; nothing is retried behind their back.
 */
export type LoadState = 'loading' | 'ready' | 'error';

export function useEventEditor(eventId: string | null, onSaved: (ev: HubEvent) => void) {
  const [load, setLoad] = useState<LoadState>(eventId ? 'loading' : 'ready');
  const [event, setEvent] = useState<HubEvent | null>(null);
  const [cohorts, setCohorts] = useState<HubCohort[]>([]);
  const [form, setForm] = useState<EventFormState>(emptyForm());
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    listHubCohorts().then(setCohorts).catch(() => setCohorts([]));
    if (!eventId) { setEvent(null); setForm(emptyForm()); setLoad('ready'); return; }
    setLoad('loading');
    getHubEvent(eventId)
      .then((ev) => { setEvent(ev); setForm(fromEvent(ev)); setLoad('ready'); })
      .catch(() => setLoad('error'));
  }, [eventId]);

  const change = useCallback((patch: Partial<EventFormState>) => { setForm((f) => ({ ...f, ...patch })); setNotice(null); }, []);

  const save = async (status: 'draft' | 'scheduled'): Promise<void> => {
    const found = validate(form);
    setErrors(found);
    if (Object.keys(found).length) { setNotice('Fix the highlighted fields, then save again.'); return; }
    setBusy('save');
    try {
      const saved = event ? await updateHubEvent(event.id, toInput(form, status)) : await createHubEvent(toInput(form, status));
      setEvent(saved); setForm(fromEvent(saved));
      setNotice(status === 'draft' ? 'Saved as a draft. It is not on the platform yet.' : 'Saved. It is on the platform.');
      onSaved(saved);
    } catch (err) {
      setErrors({ form: apiErrorMessage(err, 'The event was not saved. Nothing changed; try again.') });
    } finally { setBusy(null); }
  };

  const [cancelled, setCancelled] = useState<CancelCascade | null>(null);
  const act = async (kind: 'duplicate' | 'cancel'): Promise<void> => {
    if (!event) return;
    setBusy(kind);
    try {
      if (kind === 'duplicate') {
        const copy = await duplicateHubEvent(event.id);
        setNotice('Copied as a draft. Change the date, then save.');
        onSaved(copy);
      } else {
        const { event: done, cancellation } = await cancelHubEvent(event.id);
        setEvent(done); setForm(fromEvent(done));
        // A retry of the stream only reports the stream: keep the draft the first cancel offered.
        const merged = cancellation && cancelled?.draft_message_id && !cancellation.draft_message_id
          ? { ...cancellation, draft_message_id: cancelled.draft_message_id } : cancellation;
        setCancelled(merged ?? cancelled);
        setNotice(cancelNotice(merged ?? cancelled));
      }
    } catch (err) {
      setErrors({ form: apiErrorMessage(err, kind === 'duplicate' ? 'The copy was not made.' : 'The event was not cancelled.') });
    } finally { setBusy(null); }
  };

  const describe = useDescribe(form, change);
  // CH5.2: going live or ending changes the event's status on the server; re-read the event only, so unsaved form edits stay.
  const refresh = useCallback(async (): Promise<void> => {
    if (!eventId) return;
    try { setEvent(await getHubEvent(eventId)); } catch { /* the panel already said what went wrong */ }
  }, [eventId]);

  return { load, event, cohorts, form, errors, busy, notice, cancelled, change, save, act, describe, refresh };
}

/** "Write with AI" for the description, with one-step undo of the AI text. */
export function useDescribe(form: EventFormState, change: (patch: Partial<EventFormState>) => void): DescribeControls {
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [beforeAi, setBeforeAi] = useState<string | null>(null);
  return {
    busy: aiBusy, error: aiError, canUndo: beforeAi !== null,
    run: async (): Promise<void> => {
      setAiBusy(true); setAiError(null);
      try {
        const text = await describeHubEvent({ title: form.title, event_type: form.event_type, hosts: form.hosts.map((h) => h.name).filter(Boolean), notes: form.description || null });
        setBeforeAi(form.description); change({ description: text });
      } catch (err) { setAiError(apiErrorMessage(err, 'The AI writer is not answering. Write it yourself, or try again.')); } finally { setAiBusy(false); }
    },
    undo: (): void => { if (beforeAi !== null) { change({ description: beforeAi }); setBeforeAi(null); } },
  };
}
