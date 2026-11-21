import type { Actor } from './activityLog';
import { cancelEventWithCascade, eventView } from './eventService';
import type { EventView } from './eventSchemas';
import { cancelPreparedLive } from './live/livePanel';
import type { CancelCascade } from './messages/eventCascade';

/**
 * Cancelling an event, end to end (CH7.3). The event and its messages change in one transaction
 * (eventService.cancelEventWithCascade). After it commits:
 *  - a broadcast prepared for it and not live yet is cancelled (livePanel.cancelPreparedLive);
 *  - a cancellation message is OFFERED: the AI drafts one for the event, as a draft Jackie reviews,
 *    edits and approves like any other (it is never sent on its own).
 * Neither after-step can undo the cancellation: each failure is logged and reported in the answer
 * ('failed' / a null draft). Cancelling again retries the stream (the messages are not touched twice,
 * and no second draft is made); a cancelled event also refuses Prepare and Go live outright.
 */
export interface CancelOutcome {
  event: EventView;
  cancellation: (CancelCascade & { broadcast: 'cancelled' | 'none' | 'failed'; draft_message_id: string | null }) | null;
}

type Drafter = (eventId: string, actor: Actor) => Promise<string>;

function log(event: string, ctx: Record<string, unknown>): void {
  console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', service: 'comms-hub', event, ...ctx }));
}

async function draftCancellation(eventId: string, actor: Actor): Promise<string> {
  const { createDraftMessage } = await import('./messages/drafting');
  const r = await createDraftMessage({ eventId, kind: 'cancellation', tone: 'professional', include: { thumbnail: false, join_link: false, registration_link: false } }, actor);
  return r.message.id;
}

export async function cancelEventAndOffer(id: string, actor: Actor, drafter: Drafter = draftCancellation): Promise<CancelOutcome> {
  const { event, cascade } = await cancelEventWithCascade(id, actor);
  let broadcast: 'cancelled' | 'none' | 'failed' = 'none';
  try { broadcast = await cancelPreparedLive(event, actor); } catch (err) {
    broadcast = 'failed';
    log('comms_hub_cancel_broadcast_failed', { event_id: id, outcome: 'failure', error_class: (err as Error)?.name ?? 'UnexpectedError', error: (err as Error)?.message });
  }
  if (!cascade) {
    // Already cancelled: nothing new about the messages. Cancelling again is how a stream that could not
    // be cancelled the first time is retried, so that result (and only that) is reported.
    if (broadcast === 'none') return { event: eventView(event), cancellation: null };
    return { event: eventView(event), cancellation: { messages_cancelled: 0, deliveries_cancelled: 0, sending_voided: 0, broadcast, draft_message_id: null } };
  }
  let draft_message_id: string | null = null;
  try { draft_message_id = await drafter(id, actor); } catch (err) {
    log('comms_hub_cancel_draft_failed', { event_id: id, outcome: 'failure', error_class: (err as Error)?.name ?? 'UnexpectedError', error: (err as Error)?.message });
  }
  return { event: eventView(event), cancellation: { ...cascade, broadcast, draft_message_id } };
}
