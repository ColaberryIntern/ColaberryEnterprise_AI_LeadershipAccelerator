jest.mock('../../config/database', () => ({
  sequelize: { transaction: jest.fn((cb: any) => cb({})), authenticate: jest.fn() },
}));
jest.mock('../../models', () => ({
  Ticket: { findAll: jest.fn(), findByPk: jest.fn() },
}));
jest.mock('fs');

import fs from 'fs';
import { Ticket } from '../../models';
import { parseArgs, runPlan, runApply, runRevert } from '../backfillTicketDueDates20260928';

const mockTicketFindAll = Ticket.findAll as unknown as jest.Mock;
const mockTicketFindByPk = Ticket.findByPk as unknown as jest.Mock;
const mockWriteFileSync = fs.writeFileSync as unknown as jest.Mock;
const mockReadFileSync = fs.readFileSync as unknown as jest.Mock;

function makeTicket(overrides: Record<string, any> = {}) {
  const base = {
    id: 't1',
    priority: 'medium',
    status: 'todo',
    due_date: null,
    update: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return base;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('parseArgs', () => {
  it('defaults to plan mode with sane defaults', () => {
    const opts = parseArgs([]);
    expect(opts.mode).toBe('plan');
    expect(opts.batchSize).toBe(200);
  });

  it('--apply requires --undo-log', () => {
    expect(() => parseArgs(['--apply'])).toThrow(/requires --undo-log/);
  });

  it('--revert requires --undo-log', () => {
    expect(() => parseArgs(['--revert'])).toThrow(/requires --undo-log/);
  });

  it('--apply and --revert are mutually exclusive', () => {
    expect(() => parseArgs(['--apply', '--revert', '--undo-log', 'x.json'])).toThrow(/mutually exclusive/);
  });
});

describe('runPlan', () => {
  it('makes ZERO writes — read-only', async () => {
    mockTicketFindAll.mockResolvedValue([makeTicket()]);

    await runPlan('/tmp', 'test-session');

    expect((Ticket as any).update).toBeUndefined();
    expect((Ticket as any).create).toBeUndefined();
    expect(mockTicketFindByPk).not.toHaveBeenCalled();
  });

  it('reports every live null-due-date open ticket with its computed default due_date', async () => {
    mockTicketFindAll.mockResolvedValue([
      makeTicket({ id: 't-critical', priority: 'critical' }),
      makeTicket({ id: 't-low', priority: 'low' }),
    ]);

    const result = await runPlan('/tmp', 'test-session');

    expect(result.totalCandidates).toBe(2);
    const [[, undoLogJson]] = mockWriteFileSync.mock.calls;
    const undoLog = JSON.parse(undoLogJson);
    expect(undoLog.rows).toHaveLength(2);
    expect(undoLog.rows.find((r: any) => r.ticket_id === 't-critical').priority).toBe('critical');
    expect(undoLog.rows.every((r: any) => r.previous_due_date === null)).toBe(true);
    expect(undoLog.rows.every((r: any) => typeof r.new_due_date === 'string' && r.new_due_date.length > 0)).toBe(true);
  });

  it('queries only live open tickets with a null due_date (terminal statuses and real due dates are filtered server-side by the query, not client-side)', async () => {
    mockTicketFindAll.mockResolvedValue([]);
    await runPlan('/tmp', 'test-session');
    const whereArg = mockTicketFindAll.mock.calls[0][0].where;
    expect(whereArg.status[Object.getOwnPropertySymbols(whereArg.status)[0]]).toEqual(['done', 'cancelled']);
  });
});

describe('runApply', () => {
  const UNDO_LOG = {
    generated_at: '2026-09-28T00:00:00Z',
    session_id: 'test-session',
    rows: [
      { ticket_id: 't1', priority: 'medium', previous_due_date: null, new_due_date: '2026-10-01T00:00:00.000Z' },
    ],
  };

  beforeEach(() => {
    mockReadFileSync.mockReturnValue(JSON.stringify(UNDO_LOG));
  });

  it('writes the real computed due_date for a live-matching ticket', async () => {
    const ticket = makeTicket({ id: 't1', priority: 'medium', due_date: null, status: 'todo' });
    mockTicketFindByPk.mockResolvedValue(ticket);

    const result = await runApply('/tmp/undo.json', 200);

    expect(result.updated).toBe(1);
    expect(ticket.update).toHaveBeenCalledTimes(1);
    const [updateArg] = ticket.update.mock.calls[0];
    expect(updateArg.due_date).toBeInstanceOf(Date);
  });

  it('skips (zero write) a row whose ticket has already gone terminal since --plan', async () => {
    const ticket = makeTicket({ id: 't1', status: 'done', due_date: null });
    mockTicketFindByPk.mockResolvedValue(ticket);

    const result = await runApply('/tmp/undo.json', 200);

    expect(result.updated).toBe(0);
    expect(result.skippedNoLongerOpen).toBe(1);
    expect(ticket.update).not.toHaveBeenCalled();
  });

  it('skips (zero write) a row that already has a real due_date — e.g. the R110/R111 hook already defaulted it, or a prior --apply already ran', async () => {
    const ticket = makeTicket({ id: 't1', status: 'todo', due_date: new Date('2026-11-01') });
    mockTicketFindByPk.mockResolvedValue(ticket);

    const result = await runApply('/tmp/undo.json', 200);

    expect(result.updated).toBe(0);
    expect(result.skippedAlreadyHasDueDate).toBe(1);
    expect(ticket.update).not.toHaveBeenCalled();
  });

  it('is idempotent: a second --apply run against the same undo log updates zero rows', async () => {
    const ticket = makeTicket({ id: 't1', status: 'todo', due_date: null });
    mockTicketFindByPk.mockResolvedValue(ticket);
    await runApply('/tmp/undo.json', 200);

    // Second run: the ticket now has a real due_date (as the mock would reflect in reality).
    ticket.due_date = new Date('2026-10-01T00:00:00.000Z');
    ticket.update.mockClear();
    const result = await runApply('/tmp/undo.json', 200);

    expect(result.updated).toBe(0);
    expect(result.skippedAlreadyHasDueDate).toBe(1);
  });

  it('throws if a ticket in the undo log no longer exists', async () => {
    mockTicketFindByPk.mockResolvedValue(null);
    await expect(runApply('/tmp/undo.json', 200)).rejects.toThrow(/not found mid-apply/);
  });
});

describe('runRevert', () => {
  const UNDO_LOG = {
    generated_at: '2026-09-28T00:00:00Z',
    session_id: 'test-session',
    rows: [
      { ticket_id: 't1', priority: 'medium', previous_due_date: null, new_due_date: '2026-10-01T00:00:00.000Z' },
    ],
  };

  beforeEach(() => {
    mockReadFileSync.mockReturnValue(JSON.stringify(UNDO_LOG));
  });

  it('restores due_date to null for a backfilled row', async () => {
    const ticket = makeTicket({ id: 't1', due_date: new Date('2026-10-01') });
    mockTicketFindByPk.mockResolvedValue(ticket);

    const result = await runRevert('/tmp/undo.json', 200);

    expect(result.reverted).toBe(1);
    expect(ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({ due_date: null }),
      expect.anything(),
    );
  });

  it('is idempotent: a row already null is skipped', async () => {
    const ticket = makeTicket({ id: 't1', due_date: null });
    mockTicketFindByPk.mockResolvedValue(ticket);

    const result = await runRevert('/tmp/undo.json', 200);

    expect(result.reverted).toBe(0);
    expect(result.skippedAlreadyNull).toBe(1);
    expect(ticket.update).not.toHaveBeenCalled();
  });
});
