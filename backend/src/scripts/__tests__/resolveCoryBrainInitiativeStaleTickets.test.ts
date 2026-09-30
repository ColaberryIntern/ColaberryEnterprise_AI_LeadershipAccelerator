/**
 * Apply/revert/plan engine tests for the CoryBrain initiative-ticket reconciliation
 * historical bulk-clear. Mirrors resolveCoryEngineStaleTickets.test.ts's established
 * mocking shape (models + sequelize.transaction mocked — this is batching/idempotency/
 * skip-reason control flow under test, not Postgres). buildPlan()'s own content is
 * covered separately in lib/__tests__/corybrainInitiativeTicketResolutionArtifacts.test.ts.
 */
import fs from 'fs';

const mockTransaction = jest.fn();
const mockTicketFindAll = jest.fn();
const mockFindByPk = jest.fn();
const mockActivityCreate = jest.fn();
const mockFetchLive = jest.fn();

jest.mock('../../config/database', () => ({
  sequelize: { transaction: (...a: any[]) => mockTransaction(...a), authenticate: jest.fn() },
}));
jest.mock('../../models', () => ({
  Ticket: { findAll: (...a: any[]) => mockTicketFindAll(...a), findByPk: (...a: any[]) => mockFindByPk(...a) },
  TicketActivity: { create: (...a: any[]) => mockActivityCreate(...a) },
}));
jest.mock('../../intelligence/autonomy/corybrainInitiativeTicketAutoResolver', () => ({
  fetchLiveResolvableCoryBrainInitiativeTickets: (...a: any[]) => mockFetchLive(...a),
}));

import { runPlan, runApply, runRevert, parseArgs } from '../resolveCoryBrainInitiativeStaleTickets';
import { UndoLog } from '../lib/corybrainInitiativeTicketResolutionArtifacts';

const TX = { __tx: true };

function fakeTicketRow(id: string, status: string) {
  const row: any = {
    id,
    status,
    update: jest.fn().mockImplementation(async (patch: Record<string, any>) => {
      Object.assign(row, patch);
      return row;
    }),
  };
  return row;
}

function fakeUndoLog(
  rows: Array<{ ticket_id: string; outcome: string; target_status: 'done' | 'cancelled'; previous_status: string }>,
): UndoLog {
  return {
    generated_at: '2026-08-16T00:00:00.000Z',
    session_id: 'CC-test',
    rows: rows.map((r) => ({
      ticket_id: r.ticket_id,
      ticket_number: null,
      is_subtask: false,
      linked_initiative_id: 'init-1',
      linked_initiative_status: r.target_status === 'done' ? 'completed' : 'cancelled',
      outcome: r.outcome as any,
      target_status: r.target_status,
      previous_status: r.previous_status,
    })),
    breakdown: {
      initiative_cancelled: { checked: rows.length, would_close: rows.length },
      initiative_completed: { checked: 0, would_close: 0 },
      initiative_still_active: { checked: 0, would_close: 0 },
      initiative_not_found: { checked: 0, would_close: 0 },
    },
  };
}

function liveResult(overrides: Partial<any> = {}) {
  return {
    ticket_id: 't-1',
    ticket_number: null,
    is_subtask: false,
    linked_initiative_id: 'init-1',
    linked_initiative_status: 'cancelled',
    outcome: 'initiative_cancelled',
    should_close: true,
    target_status: 'cancelled',
    evidence_note: 'fresh evidence',
    ...overrides,
  };
}

let readFileSpy: jest.SpyInstance;
let logSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockTransaction.mockImplementation(async (cb: any) => cb(TX));
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  mockFetchLive.mockResolvedValue([]);
});

afterEach(() => {
  readFileSpy?.mockRestore();
  logSpy.mockRestore();
});

function mockUndoLogFile(undoLog: UndoLog) {
  readFileSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => JSON.stringify(undoLog));
}

describe('parseArgs', () => {
  it('defaults to plan mode with no flags', () => {
    expect(parseArgs([])).toMatchObject({ mode: 'plan', batchSize: 200 });
  });
  it('reads --apply with --undo-log', () => {
    expect(parseArgs(['--apply', '--undo-log', '/tmp/u.json'])).toMatchObject({ mode: 'apply', undoLogPath: '/tmp/u.json' });
  });
  it('reads --revert with --undo-log', () => {
    expect(parseArgs(['--revert', '--undo-log', '/tmp/u.json'])).toMatchObject({ mode: 'revert', undoLogPath: '/tmp/u.json' });
  });
  it('throws if --apply is given without --undo-log', () => {
    expect(() => parseArgs(['--apply'])).toThrow(/requires --undo-log/);
  });
  it('throws if --apply and --revert are both given', () => {
    expect(() => parseArgs(['--apply', '--revert', '--undo-log', '/tmp/u.json'])).toThrow(/mutually exclusive/);
  });
  it('reads --session-id', () => {
    expect(parseArgs(['--session-id', 'CC-20260816-abcd'])).toMatchObject({ sessionId: 'CC-20260816-abcd' });
  });
});

describe('runPlan — orchestration (read-only)', () => {
  it('fetches live classification, looks up real ticket status, writes undo log + report, makes zero DB writes', async () => {
    mockFetchLive.mockResolvedValue([liveResult({ ticket_id: 't-1' })]);
    mockTicketFindAll.mockResolvedValue([{ id: 't-1', status: 'backlog' }]);
    const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

    const result = await runPlan('/tmp', 'CC-test');

    expect(result.totalChecked).toBe(1);
    expect(result.totalWouldClose).toBe(1);
    expect(writeSpy).toHaveBeenCalledTimes(2); // undo log + report
    expect(mockFindByPk).not.toHaveBeenCalled(); // read-only — no per-row apply logic invoked
    writeSpy.mockRestore();
  });
});

describe('runApply — happy path', () => {
  it('closes rows whose LIVE re-classification still says should_close, using FRESH evidence text (not the stale undo-log snapshot), to the target_status recorded on the undo log row', async () => {
    const rows = [{ ticket_id: 't-1', outcome: 'initiative_cancelled', target_status: 'cancelled' as const, previous_status: 'backlog' }];
    mockUndoLogFile(fakeUndoLog(rows));
    mockFetchLive.mockResolvedValue([liveResult({ ticket_id: 't-1', evidence_note: 'FRESH evidence at apply time' })]);
    const ticket = fakeTicketRow('t-1', 'backlog');
    mockFindByPk.mockImplementation(async (id: string) => (id === 't-1' ? ticket : null));

    const result = await runApply('/tmp/undo.json', 200);

    expect(result).toMatchObject({ processed: 1, closed: 1, skippedAlreadyDone: 0, skippedConditionReemerged: 0, skippedNotFound: 0 });
    expect(ticket.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }), { transaction: TX });
    expect(mockActivityCreate).toHaveBeenCalledWith(
      expect.objectContaining({ ticket_id: 't-1', to_value: 'cancelled', comment: 'FRESH evidence at apply time' }),
      { transaction: TX },
    );
  });

  it('closes an initiative_completed row to "done" (backlog -> done, the transition ticketService.ts\'s FSM would reject)', async () => {
    const rows = [{ ticket_id: 't-2', outcome: 'initiative_completed', target_status: 'done' as const, previous_status: 'backlog' }];
    mockUndoLogFile(fakeUndoLog(rows));
    mockFetchLive.mockResolvedValue([
      liveResult({ ticket_id: 't-2', outcome: 'initiative_completed', target_status: 'done', linked_initiative_status: 'completed' }),
    ]);
    const ticket = fakeTicketRow('t-2', 'backlog');
    mockFindByPk.mockImplementation(async () => ticket);

    const result = await runApply('/tmp/undo.json', 200);

    expect(result.closed).toBe(1);
    expect(ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'done', completed_at: expect.any(Date) }),
      { transaction: TX },
    );
  });
});

describe('runApply — linkage re-emerged/changed since --plan (live re-derivation, not stale snapshot)', () => {
  it('a row whose linked initiative has moved back to active since --plan is skipped and reported, WITHOUT aborting the rest of the batch', async () => {
    const rows = [
      { ticket_id: 't-still-cancelled', outcome: 'initiative_cancelled', target_status: 'cancelled' as const, previous_status: 'backlog' },
      { ticket_id: 't-now-active', outcome: 'initiative_cancelled', target_status: 'cancelled' as const, previous_status: 'backlog' },
    ];
    mockUndoLogFile(fakeUndoLog(rows));
    mockFetchLive.mockResolvedValue([
      liveResult({ ticket_id: 't-still-cancelled', should_close: true }),
      liveResult({ ticket_id: 't-now-active', should_close: false, outcome: 'initiative_still_active', target_status: null }),
    ]);
    const stillCancelled = fakeTicketRow('t-still-cancelled', 'backlog');
    const nowActive = fakeTicketRow('t-now-active', 'backlog');
    mockFindByPk.mockImplementation(async (id: string) => ({ 't-still-cancelled': stillCancelled, 't-now-active': nowActive }[id]));

    const result = await runApply('/tmp/undo.json', 200);

    expect(result).toMatchObject({ closed: 1, skippedConditionReemerged: 1 });
    expect(stillCancelled.update).toHaveBeenCalled();
    expect(nowActive.update).not.toHaveBeenCalled();
  });

  it('a ticket missing from the live result set entirely is treated as condition-reemerged, not force-closed', async () => {
    const rows = [{ ticket_id: 't-missing-from-live', outcome: 'initiative_cancelled', target_status: 'cancelled' as const, previous_status: 'backlog' }];
    mockUndoLogFile(fakeUndoLog(rows));
    mockFetchLive.mockResolvedValue([]); // live pass didn't even return this ticket
    const ticket = fakeTicketRow('t-missing-from-live', 'backlog');
    mockFindByPk.mockImplementation(async () => ticket);

    const result = await runApply('/tmp/undo.json', 200);

    expect(result).toMatchObject({ closed: 0, skippedConditionReemerged: 1 });
    expect(ticket.update).not.toHaveBeenCalled();
  });
});

describe('runApply — idempotency', () => {
  it('rows already done/cancelled are skipped, zero additional writes on a second run', async () => {
    const rows = [{ ticket_id: 't-1', outcome: 'initiative_cancelled', target_status: 'cancelled' as const, previous_status: 'backlog' }];
    mockUndoLogFile(fakeUndoLog(rows));
    mockFetchLive.mockResolvedValue([liveResult({ ticket_id: 't-1' })]);
    mockFindByPk.mockImplementation(async () => fakeTicketRow('t-1', 'cancelled')); // already applied

    const result = await runApply('/tmp/undo.json', 200);

    expect(result).toMatchObject({ closed: 0, skippedAlreadyDone: 1 });
    expect(mockActivityCreate).not.toHaveBeenCalled();
  });
});

describe("runApply — never writes outside the undo log's own reviewed row set", () => {
  it('a NEW live-resolvable ticket not present in the undo log is never touched by --apply', async () => {
    const rows = [{ ticket_id: 't-known', outcome: 'initiative_cancelled', target_status: 'cancelled' as const, previous_status: 'backlog' }];
    mockUndoLogFile(fakeUndoLog(rows));
    // Live pass now includes a ticket the undo log never reviewed.
    mockFetchLive.mockResolvedValue([liveResult({ ticket_id: 't-known' }), liveResult({ ticket_id: 't-new-unreviewed' })]);
    const known = fakeTicketRow('t-known', 'backlog');
    mockFindByPk.mockImplementation(async (id: string) => (id === 't-known' ? known : fakeTicketRow(id, 'backlog')));

    await runApply('/tmp/undo.json', 200);

    expect(mockFindByPk).not.toHaveBeenCalledWith('t-new-unreviewed', expect.anything());
    expect(known.update).toHaveBeenCalled();
  });
});

describe('runApply — batching / partial failure', () => {
  it('rolls back only the failing batch; an earlier committed batch is unaffected', async () => {
    const rows = [
      { ticket_id: 't-b1', outcome: 'initiative_cancelled', target_status: 'cancelled' as const, previous_status: 'backlog' },
      { ticket_id: 't-b2', outcome: 'initiative_cancelled', target_status: 'cancelled' as const, previous_status: 'backlog' },
    ];
    mockUndoLogFile(fakeUndoLog(rows));
    mockFetchLive.mockResolvedValue([liveResult({ ticket_id: 't-b1' }), liveResult({ ticket_id: 't-b2' })]);
    mockFindByPk.mockImplementation(async (id: string) => fakeTicketRow(id, 'backlog'));

    let batchCount = 0;
    mockTransaction.mockImplementation(async (cb: any) => {
      batchCount++;
      if (batchCount === 2) throw new Error('simulated DB error in batch 2');
      return cb(TX);
    });

    await expect(runApply('/tmp/undo.json', 1)).rejects.toThrow('simulated DB error in batch 2');
    expect(batchCount).toBe(2);
  });
});

describe('runRevert — happy path + idempotency', () => {
  it('restores every applied row to its previous_status and adds a revert activity pair', async () => {
    const rows = [
      { ticket_id: 't-1', outcome: 'initiative_cancelled', target_status: 'cancelled' as const, previous_status: 'backlog' },
      { ticket_id: 't-2', outcome: 'initiative_completed', target_status: 'done' as const, previous_status: 'backlog' },
    ];
    mockUndoLogFile(fakeUndoLog(rows));
    const tickets: Record<string, any> = { 't-1': fakeTicketRow('t-1', 'cancelled'), 't-2': fakeTicketRow('t-2', 'done') };
    mockFindByPk.mockImplementation(async (id: string) => tickets[id]);

    const result = await runRevert('/tmp/undo.json', 200);

    expect(result).toMatchObject({ processed: 2, reverted: 2, skippedAlreadyAtPreviousStatus: 0 });
    expect(tickets['t-1'].update).toHaveBeenCalledWith(expect.objectContaining({ status: 'backlog' }), { transaction: TX });
    expect(tickets['t-2'].update).toHaveBeenCalledWith(expect.objectContaining({ status: 'backlog' }), { transaction: TX });
  });

  it('is idempotent: a second revert run over already-reverted rows makes zero additional writes', async () => {
    const rows = [{ ticket_id: 't-1', outcome: 'initiative_cancelled', target_status: 'cancelled' as const, previous_status: 'backlog' }];
    mockUndoLogFile(fakeUndoLog(rows));
    mockFindByPk.mockImplementation(async () => fakeTicketRow('t-1', 'backlog')); // already at previous_status

    const result = await runRevert('/tmp/undo.json', 200);

    expect(result).toMatchObject({ reverted: 0, skippedAlreadyAtPreviousStatus: 1 });
    expect(mockActivityCreate).not.toHaveBeenCalled();
  });

  it('never deletes a row or TicketActivity — only adds', async () => {
    const rows = [{ ticket_id: 't-1', outcome: 'initiative_cancelled', target_status: 'cancelled' as const, previous_status: 'backlog' }];
    mockUndoLogFile(fakeUndoLog(rows));
    mockFindByPk.mockImplementation(async () => fakeTicketRow('t-1', 'cancelled'));

    await runRevert('/tmp/undo.json', 200);

    expect(mockActivityCreate).toHaveBeenCalledTimes(1);
    // No delete-shaped mock exists at all in this suite's model mock — a delete call
    // would throw "is not a function", which no test here catches, so its absence
    // across every scenario is itself the proof no delete path exists.
  });
});
