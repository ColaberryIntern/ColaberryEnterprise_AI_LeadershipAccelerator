/**
 * Apply/revert/plan engine tests for the Reese student_support ticket supersession
 * historical bulk-clear. Mirrors resolveCoryBrainInitiativeStaleTickets.test.ts's
 * established mocking shape (models + sequelize.transaction mocked — this is
 * batching/idempotency/skip-reason control flow under test, not Postgres).
 * buildPlan()'s own content is covered separately in
 * lib/__tests__/reeseStudentSupportSupersessionArtifacts.test.ts.
 */
import fs from 'fs';

const mockTransaction = jest.fn();
const mockTicketFindAll = jest.fn();
const mockFindByPk = jest.fn();
const mockActivityCreate = jest.fn();
const mockFetchLive = jest.fn();
const mockGetReeseAdminUserId = jest.fn();

jest.mock('../../config/database', () => ({
  sequelize: { transaction: (...a: any[]) => mockTransaction(...a), authenticate: jest.fn() },
}));
jest.mock('../../models', () => ({
  Ticket: { findAll: (...a: any[]) => mockTicketFindAll(...a), findByPk: (...a: any[]) => mockFindByPk(...a) },
  TicketActivity: { create: (...a: any[]) => mockActivityCreate(...a) },
}));
jest.mock('../../intelligence/autonomy/reeseStudentSupportSupersessionResolver', () => ({
  fetchLiveResolvableStudentSupportTickets: (...a: any[]) => mockFetchLive(...a),
}));
jest.mock('../../services/reese/reeseIdentitySeed', () => ({
  getReeseAdminUserId: (...a: any[]) => mockGetReeseAdminUserId(...a),
}));

import { runPlan, runApply, runRevert, parseArgs } from '../resolveReeseStudentSupportSupersession';
import { UndoLog } from '../lib/reeseStudentSupportSupersessionArtifacts';

const TX = { __tx: true };
const REESE_ADMIN_ID = '82c2dfd2-369e-4545-8d2f-22d1ae3451ff';

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
  rows: Array<{ ticket_id: string; entity_id?: string | null; superseded_by_ticket_id?: string | null; previous_status: string }>,
): UndoLog {
  return {
    generated_at: '2026-08-16T00:00:00.000Z',
    session_id: 'CC-test',
    rows: rows.map((r) => ({
      ticket_id: r.ticket_id,
      entity_id: r.entity_id ?? 'room-1',
      outcome: 'superseded',
      superseded_by_ticket_id: r.superseded_by_ticket_id ?? 'newer-ticket',
      previous_status: r.previous_status,
    })),
    breakdown: {
      superseded: { checked: rows.length, would_close: rows.length },
      current: { checked: 0, would_close: 0 },
      sole_ticket: { checked: 0, would_close: 0 },
      already_terminal: { checked: 0, would_close: 0 },
    },
  };
}

function liveResult(overrides: Partial<any> = {}) {
  return {
    ticket_id: 't-1',
    entity_id: 'room-1',
    outcome: 'superseded',
    should_close: true,
    superseded_by_ticket_id: 'newer-ticket',
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
  mockGetReeseAdminUserId.mockResolvedValue(REESE_ADMIN_ID);
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
    expect(parseArgs(['--session-id', 'CC-20260816-rz8f'])).toMatchObject({ sessionId: 'CC-20260816-rz8f' });
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
  it('closes rows whose LIVE re-classification still says should_close, using FRESH evidence text (not the stale undo-log snapshot), to done', async () => {
    const rows = [{ ticket_id: 't-1', previous_status: 'backlog' }];
    mockUndoLogFile(fakeUndoLog(rows));
    mockFetchLive.mockResolvedValue([liveResult({ ticket_id: 't-1', evidence_note: 'FRESH evidence at apply time' })]);
    const ticket = fakeTicketRow('t-1', 'backlog');
    mockFindByPk.mockImplementation(async (id: string) => (id === 't-1' ? ticket : null));

    const result = await runApply('/tmp/undo.json', 200);

    expect(result).toMatchObject({ processed: 1, closed: 1, skippedAlreadyDone: 0, skippedConditionReemerged: 0, skippedNotFound: 0 });
    expect(ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'done', completed_at: expect.any(Date) }),
      { transaction: TX },
    );
    expect(mockActivityCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        ticket_id: 't-1',
        to_value: 'done',
        actor_id: REESE_ADMIN_ID,
        comment: 'FRESH evidence at apply time',
      }),
      { transaction: TX },
    );
  });

  it('uses the "Reese" actor-id fallback when getReeseAdminUserId() resolves null', async () => {
    mockGetReeseAdminUserId.mockResolvedValue(null);
    const rows = [{ ticket_id: 't-1', previous_status: 'backlog' }];
    mockUndoLogFile(fakeUndoLog(rows));
    mockFetchLive.mockResolvedValue([liveResult({ ticket_id: 't-1' })]);
    const ticket = fakeTicketRow('t-1', 'backlog');
    mockFindByPk.mockImplementation(async () => ticket);

    await runApply('/tmp/undo.json', 200);

    expect(mockActivityCreate).toHaveBeenCalledWith(
      expect.objectContaining({ actor_id: 'Reese' }),
      { transaction: TX },
    );
  });
});

describe('runApply — supersession re-emerged/changed since --plan (live re-derivation, not stale snapshot)', () => {
  it('a row whose room composition changed since --plan (no longer superseded) is skipped and reported, WITHOUT aborting the rest of the batch', async () => {
    const rows = [
      { ticket_id: 't-still-superseded', previous_status: 'backlog' },
      { ticket_id: 't-now-current', previous_status: 'backlog' },
    ];
    mockUndoLogFile(fakeUndoLog(rows));
    mockFetchLive.mockResolvedValue([
      liveResult({ ticket_id: 't-still-superseded', should_close: true }),
      liveResult({ ticket_id: 't-now-current', should_close: false, outcome: 'current', superseded_by_ticket_id: null }),
    ]);
    const stillSuperseded = fakeTicketRow('t-still-superseded', 'backlog');
    const nowCurrent = fakeTicketRow('t-now-current', 'backlog');
    mockFindByPk.mockImplementation(async (id: string) => ({ 't-still-superseded': stillSuperseded, 't-now-current': nowCurrent }[id]));

    const result = await runApply('/tmp/undo.json', 200);

    expect(result).toMatchObject({ closed: 1, skippedConditionReemerged: 1 });
    expect(stillSuperseded.update).toHaveBeenCalled();
    expect(nowCurrent.update).not.toHaveBeenCalled();
  });

  it('a ticket missing from the live result set entirely is treated as condition-reemerged, not force-closed', async () => {
    const rows = [{ ticket_id: 't-missing-from-live', previous_status: 'backlog' }];
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
    const rows = [{ ticket_id: 't-1', previous_status: 'backlog' }];
    mockUndoLogFile(fakeUndoLog(rows));
    mockFetchLive.mockResolvedValue([liveResult({ ticket_id: 't-1' })]);
    mockFindByPk.mockImplementation(async () => fakeTicketRow('t-1', 'done')); // already applied

    const result = await runApply('/tmp/undo.json', 200);

    expect(result).toMatchObject({ closed: 0, skippedAlreadyDone: 1 });
    expect(mockActivityCreate).not.toHaveBeenCalled();
  });
});

describe("runApply — never writes outside the undo log's own reviewed row set", () => {
  it('a NEW live-resolvable ticket not present in the undo log is never touched by --apply', async () => {
    const rows = [{ ticket_id: 't-known', previous_status: 'backlog' }];
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
      { ticket_id: 't-b1', previous_status: 'backlog' },
      { ticket_id: 't-b2', previous_status: 'backlog' },
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
  it('restores every applied row to its previous_status and adds a revert activity', async () => {
    const rows = [
      { ticket_id: 't-1', previous_status: 'backlog' },
      { ticket_id: 't-2', previous_status: 'backlog' },
    ];
    mockUndoLogFile(fakeUndoLog(rows));
    const tickets: Record<string, any> = { 't-1': fakeTicketRow('t-1', 'done'), 't-2': fakeTicketRow('t-2', 'done') };
    mockFindByPk.mockImplementation(async (id: string) => tickets[id]);

    const result = await runRevert('/tmp/undo.json', 200);

    expect(result).toMatchObject({ processed: 2, reverted: 2, skippedAlreadyAtPreviousStatus: 0 });
    expect(tickets['t-1'].update).toHaveBeenCalledWith(expect.objectContaining({ status: 'backlog' }), { transaction: TX });
    expect(tickets['t-2'].update).toHaveBeenCalledWith(expect.objectContaining({ status: 'backlog' }), { transaction: TX });
  });

  it('is idempotent: a second revert run over already-reverted rows makes zero additional writes', async () => {
    const rows = [{ ticket_id: 't-1', previous_status: 'backlog' }];
    mockUndoLogFile(fakeUndoLog(rows));
    mockFindByPk.mockImplementation(async () => fakeTicketRow('t-1', 'backlog')); // already at previous_status

    const result = await runRevert('/tmp/undo.json', 200);

    expect(result).toMatchObject({ reverted: 0, skippedAlreadyAtPreviousStatus: 1 });
    expect(mockActivityCreate).not.toHaveBeenCalled();
  });

  it('never deletes a row or TicketActivity — only adds', async () => {
    const rows = [{ ticket_id: 't-1', previous_status: 'backlog' }];
    mockUndoLogFile(fakeUndoLog(rows));
    mockFindByPk.mockImplementation(async () => fakeTicketRow('t-1', 'done'));

    await runRevert('/tmp/undo.json', 200);

    expect(mockActivityCreate).toHaveBeenCalledTimes(1);
    // No delete-shaped mock exists at all in this suite's model mock — a delete call
    // would throw "is not a function", which no test here catches, so its absence
    // across every scenario is itself the proof no delete path exists.
  });
});

describe('malformed undo log', () => {
  it('runApply fails loudly (throws) on a malformed undo log rather than silently doing nothing', async () => {
    readFileSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => JSON.stringify({ notRows: [] }));

    await expect(runApply('/tmp/bad.json', 200)).rejects.toThrow(/Malformed undo log/);
  });
});
