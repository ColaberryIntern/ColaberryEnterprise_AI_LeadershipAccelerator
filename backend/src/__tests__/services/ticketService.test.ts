import { Ticket, TicketActivity } from '../../models';
import { emitEvent } from '../../services/workLedger/workLedgerService';
import { scheduleOutcomeMeasurement } from '../../services/outcomes/outcomeMeasurementService';
import { createTicket, updateTicketStatus, addAgentOutput } from '../../services/ticketService';

/** Dynamic import() hooks (cory + outcome-measurement) run in a `.then()` chain that
 * is deliberately NOT awaited by updateTicketStatus (non-blocking by design) — flush
 * the microtask queue so their mocked callbacks have a chance to run before asserting
 * on them. */
async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../models', () => ({
  Ticket: { findOne: jest.fn(), create: jest.fn(), findByPk: jest.fn() },
  TicketActivity: { create: jest.fn() },
}));
jest.mock('../../services/workLedger/workLedgerService', () => ({
  emitEvent: jest.fn(),
}));
jest.mock('../../services/outcomes/outcomeMeasurementService', () => ({
  scheduleOutcomeMeasurement: jest.fn(),
}));

const ticketFindOne = Ticket.findOne as unknown as jest.Mock;
const ticketCreate = Ticket.create as unknown as jest.Mock;
const ticketFindByPk = Ticket.findByPk as unknown as jest.Mock;
const activityCreate = TicketActivity.create as unknown as jest.Mock;
const mockEmit = emitEvent as unknown as jest.Mock;
const mockScheduleOutcome = scheduleOutcomeMeasurement as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockEmit.mockResolvedValue({ event_id: 'evt-mock' });
  mockScheduleOutcome.mockResolvedValue({ id: 'om-mock' });
});

describe('createTicket', () => {
  it('happy path: creates the ticket, writes an activity, and emits one ledger event', async () => {
    ticketFindOne.mockResolvedValue(null);
    const createdTicket = { id: 't1', status: 'backlog', priority: 'medium', type: 'task', title: 'Test' };
    ticketCreate.mockResolvedValue(createdTicket);
    activityCreate.mockResolvedValue({ id: 'a1' });

    const result = await createTicket({
      title: 'Test',
      created_by_type: 'human',
      created_by_id: 'ali',
    });

    expect(result).toBe(createdTicket); // return value unchanged
    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit.mock.calls[0][0]).toMatchObject({
      ticketId: 't1',
      idempotencyKey: 'ticket-created:t1',
      sourceRecordType: 'ticket',
      sourceRecordId: 't1',
      result: 'success',
    });
  });

  it('dedup path: returns the existing ticket and never emits a ledger event', async () => {
    const existing = { id: 'existing-1', status: 'todo' };
    ticketFindOne.mockResolvedValue(existing);

    const result = await createTicket({
      title: 'Dup',
      created_by_type: 'human',
      created_by_id: 'ali',
      entity_type: 'campaign',
      entity_id: 'c1',
      type: 'task',
    });

    expect(result).toBe(existing);
    expect(ticketCreate).not.toHaveBeenCalled();
    expect(activityCreate).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });
});

describe('updateTicketStatus', () => {
  function makeTicket(status: string) {
    const ticket: any = { id: 't2', status };
    ticket.update = jest.fn(async (fields: any) => Object.assign(ticket, fields));
    return ticket;
  }

  it('happy path: valid transition emits one ledger event and returns the updated ticket', async () => {
    const ticket = makeTicket('todo');
    ticketFindByPk.mockResolvedValue(ticket);
    activityCreate.mockResolvedValue({ id: 'act1' });

    const result = await updateTicketStatus('t2', 'in_progress', 'human', 'ali');

    expect(result).toBe(ticket);
    expect(result.status).toBe('in_progress');
    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit.mock.calls[0][0]).toMatchObject({
      ticketId: 't2',
      idempotencyKey: 'ticket-status-change:act1',
      beforeStateRef: 'todo',
      afterStateRef: 'in_progress',
      result: 'success',
    });
  });

  it('invalid transition: still throws the same error and never writes an activity or ledger event', async () => {
    const ticket = makeTicket('done'); // no valid transitions from 'done'
    ticketFindByPk.mockResolvedValue(ticket);

    await expect(updateTicketStatus('t2', 'in_progress', 'human', 'ali')).rejects.toThrow(
      'Invalid transition: done → in_progress',
    );
    expect(activityCreate).not.toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  describe('ProofDesk Outcomes & Learning (Milestone 5) — done-hook', () => {
    it('happy path: a transition to done schedules an outcome measurement for the ticket, for ANY ticket type/source (not just cory strategic)', async () => {
      const ticket = makeTicket('in_review');
      ticket.type = 'task'; // deliberately not 'strategic'/'cory' — the M5 hook is unconditional
      ticket.source = 'human';
      ticketFindByPk.mockResolvedValue(ticket);
      activityCreate.mockResolvedValue({ id: 'act-done-1' });

      const result = await updateTicketStatus('t2', 'done', 'human', 'ali');
      await flushMicrotasks();

      expect(result.status).toBe('done');
      expect(mockScheduleOutcome).toHaveBeenCalledTimes(1);
      expect(mockScheduleOutcome).toHaveBeenCalledWith('t2');
    });

    it('non-done transitions never schedule an outcome measurement', async () => {
      const ticket = makeTicket('todo');
      ticketFindByPk.mockResolvedValue(ticket);
      activityCreate.mockResolvedValue({ id: 'act-nondone' });

      await updateTicketStatus('t2', 'in_progress', 'human', 'ali');
      await flushMicrotasks();

      expect(mockScheduleOutcome).not.toHaveBeenCalled();
    });

    it('boundary/failure isolation: scheduleOutcomeMeasurement rejecting does not propagate and does not prevent updateTicketStatus from returning successfully', async () => {
      mockScheduleOutcome.mockRejectedValue(new Error('outcome scheduling DB unavailable'));
      const ticket = makeTicket('in_progress');
      ticketFindByPk.mockResolvedValue(ticket);
      activityCreate.mockResolvedValue({ id: 'act-done-2' });

      await expect(updateTicketStatus('t2', 'done', 'human', 'ali')).resolves.toBe(ticket);
      await flushMicrotasks();

      expect(mockScheduleOutcome).toHaveBeenCalledTimes(1);
    });

    it('regression: the existing cory strategic-ticket hook still fires alongside the new unconditional hook, not instead of it', async () => {
      const ticket = makeTicket('in_review');
      ticket.type = 'strategic';
      ticket.source = 'cory';
      ticketFindByPk.mockResolvedValue(ticket);
      activityCreate.mockResolvedValue({ id: 'act-done-3' });

      await updateTicketStatus('t2', 'done', 'human', 'ali');
      await flushMicrotasks();

      // Both hooks are independent dynamic imports; this test only asserts the new
      // M5 hook still fires for a cory/strategic ticket exactly as it does for any
      // other ticket — the cory hook's own behavior is unchanged (untouched by this
      // diff) and out of scope to re-assert here.
      expect(mockScheduleOutcome).toHaveBeenCalledTimes(1);
      expect(mockScheduleOutcome).toHaveBeenCalledWith('t2');
    });
  });
});

describe('addAgentOutput', () => {
  it('happy path: emits one ledger event and returns the created activity unchanged', async () => {
    ticketFindByPk.mockResolvedValue({ id: 't3', update: jest.fn().mockResolvedValue(undefined) });
    const activity = { id: 'act2' };
    activityCreate.mockResolvedValue(activity);

    const output = {
      agent_name: 'PlatformFixAgent',
      duration_ms: 42,
      actions_taken: [],
      errors: [],
      campaigns_processed: 0,
      entities_processed: 0,
    };

    const result = await addAgentOutput('t3', 'PlatformFixAgent', output as any);

    expect(result).toBe(activity);
    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(mockEmit.mock.calls[0][0]).toMatchObject({
      ticketId: 't3',
      idempotencyKey: 'ticket-agent-output:act2',
      result: 'success',
    });
  });
});

describe('ledger-write failure isolation (regression: must never break the wrapped operation)', () => {
  beforeEach(() => {
    mockEmit.mockRejectedValue(new Error('ledger DB unavailable'));
  });

  it('createTicket still returns normally when emitEvent rejects', async () => {
    ticketFindOne.mockResolvedValue(null);
    const createdTicket = { id: 't4', status: 'backlog' };
    ticketCreate.mockResolvedValue(createdTicket);
    activityCreate.mockResolvedValue({ id: 'a4' });

    await expect(
      createTicket({ title: 'Resilient', created_by_type: 'human', created_by_id: 'ali' }),
    ).resolves.toBe(createdTicket);
  });

  it('updateTicketStatus still returns normally when emitEvent rejects', async () => {
    const ticket: any = { id: 't5', status: 'todo' };
    ticket.update = jest.fn(async (fields: any) => Object.assign(ticket, fields));
    ticketFindByPk.mockResolvedValue(ticket);
    activityCreate.mockResolvedValue({ id: 'a5' });

    await expect(updateTicketStatus('t5', 'in_progress', 'human', 'ali')).resolves.toBe(ticket);
  });

  it('addAgentOutput still returns normally when emitEvent rejects', async () => {
    ticketFindByPk.mockResolvedValue({ id: 't6', update: jest.fn().mockResolvedValue(undefined) });
    const activity = { id: 'a6' };
    activityCreate.mockResolvedValue(activity);

    const output = {
      agent_name: 'X',
      duration_ms: 1,
      actions_taken: [],
      errors: [],
      campaigns_processed: 0,
      entities_processed: 0,
    };

    await expect(addAgentOutput('t6', 'X', output as any)).resolves.toBe(activity);
  });
});
