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
 * ('failed' / a null draft), and Jackie can still cancel the stream or write the message herself.
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
  if (!cascade) return { event: eventView(event), cancellation: null }; // already cancelled: nothing new
  let broadcast: 'cancelled' | 'none' | 'failed' = 'none';
  try { broadcast = await cancelPreparedLive(event, actor); } catch (err) {
    broadcast = 'failed';
    log('comms_hub_cancel_broadcast_failed', { event_id: id, outcome: 'failure', error_class: (err as Error)?.name ?? 'UnexpectedError', error: (err as Error)?.message });
  }
  let draft_message_id: string | null = null;
  try { draft_message_id = await drafter(id, actor); } catch (err) {
    log('comms_hub_cancel_draft_failed', { event_id: id, outcome: 'failure', error_class: (err as Error)?.name ?? 'UnexpectedError', error: (err as Error)?.message });
  }
  return { event: eventView(event), cancellation: { ...cascade, broadcast, draft_message_id } };
}
