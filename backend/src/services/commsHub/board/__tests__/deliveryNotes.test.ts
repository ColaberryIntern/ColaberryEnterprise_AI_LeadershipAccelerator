import { deliveryNotes, failureReason } from '../failureReason';

/** CH10.4 plain words for WhatsApp waits and already-sent rows; only from codes the hub writes, never provider text. */
it('an earlier try had already sent it: WhatsApp and other channels say so in their own words', () => {
  expect(deliveryNotes([{ channel: 'whatsapp', status: 'sent', error: 'already_done: an earlier attempt had already sent it, so it was not sent again' }]))
    .toEqual(['Already in the WhatsApp group, so it was not sent again.']);
  expect(deliveryNotes([{ channel: 'community_post', status: 'sent', error: 'already_done: x' }])).toEqual(['An earlier try had already sent it, so it was not sent again.']);
});

it('each WhatsApp wait reads as a sentence, once, only while the row is waiting', () => {
  const held = (reason: string, status = 'pending') => ({ channel: 'whatsapp', status, error: `held: ${reason}` });
  expect(deliveryNotes([held('whatsapp_paused_by_whatsapp'), held('whatsapp_paused_by_whatsapp')])).toEqual(['Waiting: WhatsApp paused the hub number. Sending resumes on its own.']);
  expect(deliveryNotes([held('whatsapp_window')])).toEqual(['Waiting for 8 AM Central: WhatsApp messages go out between 8 AM and 8 PM.']);
  expect(deliveryNotes([held('whatsapp_daily_cap')])).toEqual(["Waiting for tomorrow: today's WhatsApp limit is reached."]);
  expect(deliveryNotes([held('whatsapp_pacing'), held('whatsapp_disconnected'), held('whatsapp_check_failed')])).toHaveLength(3);
  expect(deliveryNotes([held('whatsapp_window', 'sent')])).toEqual([]);
});

it('anything else, including a provider\'s own text, adds no note', () => {
  expect(deliveryNotes([
    { channel: 'whatsapp', status: 'pending', error: 'held: quiet_hours' },
    { channel: 'whatsapp', status: 'failed', error: 'Error: WhatsApp refused a message to this group.' },
    { channel: 'whatsapp', status: 'pending', error: 'held: <script>alert(1)</script>' },
    { channel: 'in_app', status: 'sent', error: null },
  ])).toEqual([]);
});

it('a WhatsApp delivery skipped because its event had started has its own failure sentence', () => {
  expect(failureReason('partially_failed', ['event_already_started'])).toBe('Not sent to WhatsApp: its event had already started.');
});
