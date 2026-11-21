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
