/**
 * Ticket's afterCreate ledger hook (`ticketCreationLedgerHook`, Ticket Board Honesty
 * fix, session CC-20260816-q4mz). Tests the exported handler function DIRECTLY,
 * bypassing Sequelize's own hook-execution machinery entirely — mirrors
 * `models/__tests__/timelineCardSkillMappingHook.test.ts`'s established pattern for
 * the identical class of problem (many direct `.create()` call sites, one required
 * side effect fixed at the model layer).
 *
 * The critical property under test: a ledger-emit failure must NEVER surface as a
 * thrown error from the hook, or Sequelize would abort the `create` transaction it is
 * attached to — a ticket create must never fail because of ledger bookkeeping
 * (Failure-First Design, same non-fatal contract as capeSkillMappingHook and
 * emitLedgerEventSafe.ts's own never-throw guarantee).
 */
jest.mock('../../services/workLedger/emitLedgerEventSafe', () => ({
  emitLedgerEventSafe: jest.fn(),
}));

import { emitLedgerEventSafe } from '../../services/workLedger/emitLedgerEventSafe';
import { ticketCreationLedgerHook } from '../../services/workLedger/ticketCreationLedgerHook';

const mockEmit = emitLedgerEventSafe as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ticketCreationLedgerHook', () => {
  it('happy path: emits one ledger event with the ticket\'s real actor identity and a stable idempotency key', async () => {
    mockEmit.mockResolvedValue(undefined);
    const instance = { id: 'tk-1', type: 'bpos_execution', created_by_type: 'cory', created_by_id: 'bpos_orchestrator' };

    await ticketCreationLedgerHook(instance);

    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit.mock.calls[0][0]).toMatchObject({
      ticketId: 'tk-1',
      actorType: 'cory',
      actorId: 'bpos_orchestrator',
      intent: 'ticket.create',
      domain: 'tickets',
      actionClass: 'create',
      targetType: 'ticket',
      targetId: 'tk-1',
      idempotencyKey: 'ticket-created:tk-1',
      result: 'success',
      sourceRecordType: 'ticket',
      sourceRecordId: 'tk-1',
    });
  });

  it('uses the SAME idempotency key format ticketService.createTicket() already uses, so the two never double-emit', async () => {
    mockEmit.mockResolvedValue(undefined);
    const instance = { id: 'tk-42', created_by_type: 'human', created_by_id: 'ali' };

    await ticketCreationLedgerHook(instance);

    // ticketService.ts's own createTicket() emits with idempotencyKey `ticket-created:${ticket.id}`
    // — this hook must match that exact format for emitEvent()'s dedup-by-idempotency-key
    // to collapse the two into one row when both fire for the same ticket.
    expect(mockEmit.mock.calls[0][0].idempotencyKey).toBe(`ticket-created:${instance.id}`);
  });

  it('failure: a rejected emitLedgerEventSafe call never propagates out of the hook', async () => {
    mockEmit.mockRejectedValue(new Error('db unavailable'));
    const instance = { id: 'tk-2', created_by_type: 'agent', created_by_id: 'workforce_intelligence_engine' };

    await expect(ticketCreationLedgerHook(instance)).resolves.toBeUndefined();
  });

  it('failure: even a synchronous throw (e.g. a broken dynamic import) is caught, not just a rejected promise', async () => {
    mockEmit.mockImplementation(() => {
      throw new Error('sync failure');
    });
    const instance = { id: 'tk-3', created_by_type: 'agent', created_by_id: 'security_director' };

    await expect(ticketCreationLedgerHook(instance)).resolves.toBeUndefined();
  });

  it('boundary: an instance missing created_by_type/created_by_id (defensive — the DB constraint should prevent this) never calls emit and never throws', async () => {
    const instance = { id: 'tk-4', created_by_type: null, created_by_id: null } as any;

    await expect(ticketCreationLedgerHook(instance)).resolves.toBeUndefined();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('boundary: an instance missing id never calls emit and never throws', async () => {
    const instance = { id: '', created_by_type: 'human', created_by_id: 'ali' } as any;

    await expect(ticketCreationLedgerHook(instance)).resolves.toBeUndefined();
    expect(mockEmit).not.toHaveBeenCalled();
  });
});
