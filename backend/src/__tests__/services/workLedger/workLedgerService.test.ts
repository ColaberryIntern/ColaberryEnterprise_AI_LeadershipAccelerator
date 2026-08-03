import { WorkLedgerEvent, TicketActionLink } from '../../../models';
import { emitEvent, WorkLedgerValidationError } from '../../../services/workLedger/workLedgerService';

jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../../models', () => ({
  WorkLedgerEvent: { findOne: jest.fn(), create: jest.fn() },
  TicketActionLink: { findOrCreate: jest.fn() },
}));

const findOne = WorkLedgerEvent.findOne as unknown as jest.Mock;
const create = WorkLedgerEvent.create as unknown as jest.Mock;
const findOrCreate = TicketActionLink.findOrCreate as unknown as jest.Mock;

const baseEnvelope = {
  traceId: '11111111-1111-4111-8111-111111111111',
  actorType: 'agent',
  actorId: 'PlatformFixAgent',
  intent: 'ticket.status_change',
  domain: 'tickets',
  actionClass: 'status_change',
  targetType: 'ticket',
  idempotencyKey: 'ticket-status-change:aaaa',
  result: 'success' as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  findOne.mockResolvedValue(null);
  create.mockResolvedValue({ event_id: 'evt-1', idempotency_key: baseEnvelope.idempotencyKey });
  findOrCreate.mockResolvedValue([{ id: 'link-1' }, true]);
});

describe('emitEvent — happy path', () => {
  it('validates, writes one row, and links the primary ticket', async () => {
    const result = await emitEvent({ ...baseEnvelope, ticketId: '22222222-2222-4222-8222-222222222222' });

    expect(findOne).toHaveBeenCalledWith({ where: { idempotency_key: baseEnvelope.idempotencyKey } });
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({
      idempotency_key: baseEnvelope.idempotencyKey,
      ticket_id: '22222222-2222-4222-8222-222222222222',
      result: 'success',
      environment: 'test',
      risk_tier: 'R0',
    });
    expect(findOrCreate).toHaveBeenCalledTimes(1);
    expect(findOrCreate.mock.calls[0][0].defaults).toMatchObject({ link_role: 'primary' });
    expect(result).toEqual({ event_id: 'evt-1', idempotency_key: baseEnvelope.idempotencyKey });
  });

  it('links related tickets in addition to the primary one', async () => {
    await emitEvent({
      ...baseEnvelope,
      ticketId: '22222222-2222-4222-8222-222222222222',
      relatedTicketIds: ['33333333-3333-4333-8333-333333333333'],
    });

    expect(findOrCreate).toHaveBeenCalledTimes(2);
    expect(findOrCreate.mock.calls[1][0].defaults).toMatchObject({
      ticket_id: '33333333-3333-4333-8333-333333333333',
      link_role: 'related',
    });
  });
});

describe('emitEvent — idempotency (duplicate key = no-op, not an error)', () => {
  it('returns the existing row and never calls create when the key already exists', async () => {
    const existingRow = { event_id: 'evt-existing', idempotency_key: baseEnvelope.idempotencyKey };
    findOne.mockResolvedValueOnce(existingRow);

    const result = await emitEvent({ ...baseEnvelope });

    expect(result).toBe(existingRow);
    expect(create).not.toHaveBeenCalled();
    expect(findOrCreate).not.toHaveBeenCalled();
  });
});

describe('emitEvent — malformed envelope (failure path)', () => {
  it('rejects when a required field is missing, and never calls create', async () => {
    const malformed: any = { ...baseEnvelope };
    delete malformed.actorId;

    await expect(emitEvent(malformed)).rejects.toThrow(WorkLedgerValidationError);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects an invalid traceId (not a UUID)', async () => {
    await expect(emitEvent({ ...baseEnvelope, traceId: 'not-a-uuid' })).rejects.toThrow(WorkLedgerValidationError);
  });
});

describe('emitEvent — concurrency race (boundary)', () => {
  it('re-fetches and returns the winner row when create hits a unique-constraint race', async () => {
    const winnerRow = { event_id: 'evt-winner', idempotency_key: baseEnvelope.idempotencyKey };
    const raceError = new Error('duplicate key value violates unique constraint');
    raceError.name = 'SequelizeUniqueConstraintError';

    create.mockRejectedValueOnce(raceError);
    findOne
      .mockResolvedValueOnce(null) // first check: not found, proceed to create
      .mockResolvedValueOnce(winnerRow); // re-fetch after the race

    const result = await emitEvent({ ...baseEnvelope });

    expect(result).toBe(winnerRow);
    expect(findOne).toHaveBeenCalledTimes(2);
  });

  it('rethrows a non-unique-constraint DB error', async () => {
    const dbError = new Error('connection terminated');
    create.mockRejectedValueOnce(dbError);

    await expect(emitEvent({ ...baseEnvelope })).rejects.toThrow('connection terminated');
  });
});
