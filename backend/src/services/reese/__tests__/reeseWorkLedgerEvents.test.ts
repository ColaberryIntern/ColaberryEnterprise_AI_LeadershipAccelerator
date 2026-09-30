jest.mock('../../workLedger/workLedgerService', () => ({ emitEvent: jest.fn() }));

import { emitEvent } from '../../workLedger/workLedgerService';
import { emitReeseLedgerEvent } from '../reeseWorkLedgerEvents';

const mockEmitEvent = emitEvent as unknown as jest.Mock;

const INPUT = {
  ticketId: 'ticket-1',
  traceId: '11111111-1111-1111-1111-111111111111',
  actorType: 'ai_staff' as const,
  actorId: 'reese-admin-1',
  intent: 'reese.autonomous_outreach',
  domain: 'student_support',
  actionClass: 'dm_message',
  targetType: 'ticket',
  targetId: 'ticket-1',
  idempotencyKey: 'reese-outreach-send:msg-1',
  result: 'success' as const,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('emitReeseLedgerEvent', () => {
  it('happy path: calls the real emitEvent with the exact envelope given', async () => {
    mockEmitEvent.mockResolvedValue({ event_id: 'evt-1' });

    await emitReeseLedgerEvent(INPUT);

    expect(mockEmitEvent).toHaveBeenCalledWith(INPUT);
  });

  it('failure path: a rejected emitEvent never propagates — the caller must never break over a ledger-write failure', async () => {
    mockEmitEvent.mockRejectedValue(new Error('ledger unavailable'));

    await expect(emitReeseLedgerEvent(INPUT)).resolves.toBeUndefined();
  });
});
