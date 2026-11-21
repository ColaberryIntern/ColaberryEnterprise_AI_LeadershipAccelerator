/**
 * CH7.3 cancelling end to end, after the transaction: a prepared stream is cancelled, a cancellation
 * message is offered (drafted for review, never sent on its own), and neither failing can undo the
 * cancellation. A second cancel does nothing new.
 */
const mockCascade = jest.fn();
const mockLive = jest.fn();
jest.mock('../eventService', () => ({
  cancelEventWithCascade: (...a: unknown[]) => mockCascade(...(a as [])),
  eventView: (e: { id: string; status: string }) => ({ id: e.id, status: e.status }),
}));
jest.mock('../live/livePanel', () => ({ cancelPreparedLive: (...a: unknown[]) => mockLive(...(a as [])) }));

import { cancelEventAndOffer } from '../eventCancel';

const JACKIE = { id: 'jackie-1', label: 'Jackie' };
const EVENT = { id: 'e1', status: 'cancelled' };
const CASCADE = { messages_cancelled: 3, deliveries_cancelled: 2, sending_voided: 1 };

beforeEach(() => {
  jest.clearAllMocks();
  mockCascade.mockResolvedValue({ event: EVENT, cascade: CASCADE });
  mockLive.mockResolvedValue('cancelled');
});

it('the cascade, then the prepared stream, then a cancellation draft offered: all reported', async () => {
  const drafter = jest.fn(async () => '11111111-1111-4111-8111-111111111111');
  const r = await cancelEventAndOffer('e1', JACKIE, drafter);
  expect(mockCascade).toHaveBeenCalledWith('e1', JACKIE);
  expect(mockLive).toHaveBeenCalledWith(EVENT, JACKIE);
  expect(drafter).toHaveBeenCalledWith('e1', JACKIE);
  expect(r).toEqual({ event: EVENT, cancellation: { ...CASCADE, broadcast: 'cancelled', draft_message_id: '11111111-1111-4111-8111-111111111111' } });
});

it('already cancelled, stream already cancelled: nothing new happens (no second draft)', async () => {
  mockCascade.mockResolvedValue({ event: EVENT, cascade: null });
  mockLive.mockResolvedValue('none');
  const drafter = jest.fn();
  expect(await cancelEventAndOffer('e1', JACKIE, drafter)).toEqual({ event: EVENT, cancellation: null });
  expect(drafter).not.toHaveBeenCalled();
});

it('cancelling again retries a stream that could not be cancelled the first time, and reports only that', async () => {
  mockCascade.mockResolvedValue({ event: EVENT, cascade: null });
  mockLive.mockResolvedValue('cancelled');
  const drafter = jest.fn();
  expect(await cancelEventAndOffer('e1', JACKIE, drafter)).toEqual({
    event: EVENT, cancellation: { messages_cancelled: 0, deliveries_cancelled: 0, sending_voided: 0, broadcast: 'cancelled', draft_message_id: null },
  });
  expect(mockLive).toHaveBeenCalledWith(EVENT, JACKIE);
  expect(drafter).not.toHaveBeenCalled();
});

it('a stream that cannot be cancelled, or a draft the AI cannot write, is reported, logged, and the event stays cancelled', async () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  mockLive.mockRejectedValue(Object.assign(new Error('provider down'), { name: 'LivePanelError' }));
  const r = await cancelEventAndOffer('e1', JACKIE, async () => { throw Object.assign(new Error('model timeout'), { name: 'DraftModelError' }); });
  expect(r.cancellation).toEqual({ ...CASCADE, broadcast: 'failed', draft_message_id: null });
  const events = warn.mock.calls.map((c) => JSON.parse(String(c[0])));
  expect(events).toEqual([
    expect.objectContaining({ event: 'comms_hub_cancel_broadcast_failed', error_class: 'LivePanelError', event_id: 'e1' }),
    expect.objectContaining({ event: 'comms_hub_cancel_draft_failed', error_class: 'DraftModelError', event_id: 'e1' }),
  ]);
  warn.mockRestore();
});

it('a refused cancel (a live event) throws before anything else runs', async () => {
  mockCascade.mockRejectedValue(new Error('End the live stream before cancelling this event.'));
  const drafter = jest.fn();
  await expect(cancelEventAndOffer('e1', JACKIE, drafter)).rejects.toThrow(/End the live stream/);
  expect(mockLive).not.toHaveBeenCalled();
  expect(drafter).not.toHaveBeenCalled();
});

it('the default drafter asks for a cancellation message about the event, drafted (never sent) for review', async () => {
  jest.resetModules();
  const mockDraft = jest.fn(async () => ({ message: { id: 'm-cancel' } }));
  jest.doMock('../messages/drafting', () => ({ createDraftMessage: mockDraft }));
  jest.doMock('../eventService', () => ({ cancelEventWithCascade: async () => ({ event: EVENT, cascade: CASCADE }), eventView: (e: unknown) => e }));
  jest.doMock('../live/livePanel', () => ({ cancelPreparedLive: async () => 'none' }));
  const { cancelEventAndOffer: fresh } = await import('../eventCancel');
  const r = await fresh('e1', JACKIE);
  expect(mockDraft).toHaveBeenCalledWith({ eventId: 'e1', kind: 'cancellation', tone: 'professional', include: { thumbnail: false, join_link: false, registration_link: false } }, JACKIE);
  expect(r.cancellation).toEqual(expect.objectContaining({ broadcast: 'none', draft_message_id: 'm-cancel' }));
});
