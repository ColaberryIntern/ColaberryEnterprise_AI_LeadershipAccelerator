/**
 * Plain words for why a message did not fully go out (CH7.4). The delivery rows keep the technical
 * error for the logs; the page only ever sees one of these sentences, so a provider's error body
 * never reaches the screen. The code is the part of the stored error before the first colon.
 */
const BY_CODE: Record<string, string> = {
  event_cancelled: 'Stopped automatically when the event was cancelled.',
  approval_changed: 'Not sent: the message changed after it was approved. Approve it again to send it.',
  no_draft: 'Not sent: there was no text for one of its channels.',
  destination_not_allowed: 'Not sent: one of its recipients is no longer available.',
  event_already_started: 'Not sent to WhatsApp: its event had already started.',
  SendAbandonedError: 'Stopped: the send took too long to finish.',
  ConnectorPermanentError: 'Not sent: the post was refused. Check the message and try again.',
};

const codeOf = (error: string | null): string | null => (error ? error.split(':')[0].trim() : null);

export function failureReason(status: string, errors: Array<string | null>, eventCancelled = false): string {
  const codes = errors.map(codeOf).filter((c): c is string => !!c);
  if (status === 'cancelled') return eventCancelled || codes.includes('event_cancelled') ? BY_CODE.event_cancelled : 'Cancelled before it went out.';
  const known = codes.map((c) => BY_CODE[c]).find(Boolean);
  if (known) return known;
  return status === 'partially_failed' ? 'Some recipients did not receive it after every try.' : 'Nothing was delivered after every try.';
}

/**
 * CH10.4 Plain words for a row that is still waiting on WhatsApp, or that an earlier try had already
 * sent. Built only from codes the hub itself writes ("held: <reason>", "already_done: ..."), never from
 * a provider's text. Each sentence once.
 */
const HELD: Record<string, string> = {
  whatsapp_paused_by_whatsapp: 'Waiting: WhatsApp paused the hub number. Sending resumes on its own.',
  whatsapp_pacing: 'Waiting a moment between WhatsApp messages.',
  whatsapp_window: 'Waiting for 8 AM Central: WhatsApp messages go out between 8 AM and 8 PM.',
  whatsapp_daily_cap: "Waiting for tomorrow: today's WhatsApp limit is reached.",
  whatsapp_disconnected: 'Waiting: the WhatsApp phone is not connected.',
  whatsapp_check_failed: 'Waiting: WhatsApp could not be checked. It is tried again shortly.',
};

export function deliveryNotes(rows: Array<{ channel: string; status: string; error: string | null }>): string[] {
  const out = new Set<string>();
  for (const r of rows) {
    if (!r.error) continue;
    if (r.status === 'sent' && r.error.startsWith('already_done')) {
      out.add(r.channel === 'whatsapp' ? 'Already in the WhatsApp group, so it was not sent again.' : 'An earlier try had already sent it, so it was not sent again.');
    }
    const held = /^held: (\w+)$/.exec(r.error);
    if (r.status === 'pending' && held && HELD[held[1]]) out.add(HELD[held[1]]);
  }
  return [...out];
}
