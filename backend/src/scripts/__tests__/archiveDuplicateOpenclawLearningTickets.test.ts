/**
 * Apply/revert engine tests for the OpenclawLearningOptimizationAgent duplicate-ticket
 * archive. Models and the sequelize instance are mocked — this is the batching,
 * transaction-per-batch, idempotency, and drift-detection control flow under test,
 * not Postgres. buildPlan()/comment-content are covered separately in
 * lib/__tests__/openclawDuplicateTicketClusters.test.ts.
 */
import fs from 'fs';

const mockTransaction = jest.fn();
const mockFindAll = jest.fn();
const mockFindByPk = jest.fn();
const mockActivityCreate = jest.fn();

jest.mock('../../config/database', () => ({
  sequelize: { transaction: (...a: any[]) => mockTransaction(...a), authenticate: jest.fn() },
}));
jest.mock('../../models', () => ({
  Ticket: { findAll: (...a: any[]) => mockFindAll(...a), findByPk: (...a: any[]) => mockFindByPk(...a) },
  TicketActivity: { create: (...a: any[]) => mockActivityCreate(...a) },
}));

import { runApply, runRevert, parseArgs } from '../archiveDuplicateOpenclawLearningTickets';
import { UndoLog } from '../lib/openclawDuplicateTicketArtifacts';
import {
  CORY_ENGINE_DUPLICATE_TITLE,
  CORY_ENGINE_DUPLICATE_DESCRIPTION_SUBSTRING,
} from '../lib/openclawDuplicateTicketClusters';

const TX = { __tx: true };

/** A minimal fake Sequelize ticket instance with a real, spy-able .update(). */
function fakeTicketRow(id: string, status: string) {
  const row: any = {
    id,
    status,
    update: jest.fn().mockImplementation(async (patch: Record<string, any>) => {
      Object.assign(row, patch);
      return row;
    }),
    toJSON: () => ({
      id,
      created_by_id: 'cory-engine',
      title: CORY_ENGINE_DUPLICATE_TITLE,
      description: `**Problem:** ${CORY_ENGINE_DUPLICATE_DESCRIPTION_SUBSTRING}\n...`,
      status: row.status,
      created_at: '2026-08-01T00:00:00.000Z',
    }),
  };
  return row;
}

function fakeUndoLog(rows: Array<{ ticket_id: string; is_representative: boolean; previous_status: string }>): UndoLog {
  return {
    generated_at: '2026-08-15T00:00:00.000Z',
    clusters: {
      'cory-engine': {
        representative_id: rows.find((r) => r.is_representative)?.ticket_id ?? rows[0].ticket_id,
        duplicate_count: rows.length,
        earliest_seen_at: '2026-08-01T00:00:00.000Z',
        latest_seen_at: '2026-08-14T00:00:00.000Z',
        representative_comment: 'REPRESENTATIVE COMMENT TEXT',
        duplicate_pointer_comment: 'DUPLICATE POINTER COMMENT TEXT',
      },
    },
    rows: rows.map((r) => ({ ticket_id: r.ticket_id, cluster: 'cory-engine', previous_status: r.previous_status, is_representative: r.is_representative })),
  };
}

let readFileSpy: jest.SpyInstance;
let logSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockTransaction.mockImplementation(async (cb: any) => cb(TX));
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
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
  it('reads a custom --batch-size', () => {
    expect(parseArgs(['--batch-size', '50'])).toMatchObject({ batchSize: 50 });
  });
});

describe('runApply — happy path', () => {
  it('closes every row across 2 batches, representative gets the long comment, others the pointer comment', async () => {
    const rows = [
      { ticket_id: 't-rep', is_representative: true, previous_status: 'todo' },
      { ticket_id: 't-d1', is_representative: false, previous_status: 'todo' },
      { ticket_id: 't-d2', is_representative: false, previous_status: 'todo' },
    ];
    const undoLog = fakeUndoLog(rows);
    mockUndoLogFile(undoLog);
    mockFindAll.mockResolvedValue(rows.map((r) => fakeTicketRow(r.ticket_id, 'todo')));

    const tickets: Record<string, any> = Object.fromEntries(rows.map((r) => [r.ticket_id, fakeTicketRow(r.ticket_id, 'todo')]));
    mockFindByPk.mockImplementation(async (id: string) => tickets[id]);

    const result = await runApply('/tmp/undo.json', 2);

    expect(result).toMatchObject({ processed: 3, closed: 3, skippedAlreadyDone: 0, batches: 2 });
    expect(tickets['t-rep'].update).toHaveBeenCalledWith({ status: 'done' }, { transaction: TX });
    expect(mockActivityCreate).toHaveBeenCalledWith(
      expect.objectContaining({ ticket_id: 't-rep', action: 'commented', comment: 'REPRESENTATIVE COMMENT TEXT' }),
      { transaction: TX },
    );
    expect(mockActivityCreate).toHaveBeenCalledWith(
      expect.objectContaining({ ticket_id: 't-d1', action: 'commented', comment: 'DUPLICATE POINTER COMMENT TEXT' }),
      { transaction: TX },
    );
    expect(mockActivityCreate).toHaveBeenCalledWith(
      expect.objectContaining({ ticket_id: 't-rep', action: 'status_changed', from_value: 'todo', to_value: 'done' }),
      { transaction: TX },
    );
  });
});

describe('runApply — failure mid-batch', () => {
  it('rolls back only the failing batch; an earlier committed batch is unaffected', async () => {
    const rows = [
      { ticket_id: 't-b1-1', is_representative: true, previous_status: 'todo' },
      { ticket_id: 't-b2-1', is_representative: false, previous_status: 'todo' },
    ];
    mockUndoLogFile(fakeUndoLog(rows));
    mockFindAll.mockResolvedValue(rows.map((r) => fakeTicketRow(r.ticket_id, 'todo')));

    let batchCount = 0;
    mockTransaction.mockImplementation(async (cb: any) => {
      batchCount++;
      if (batchCount === 2) throw new Error('simulated DB error in batch 2');
      return cb(TX);
    });
    mockFindByPk.mockImplementation(async (id: string) => fakeTicketRow(id, 'todo'));

    await expect(runApply('/tmp/undo.json', 1)).rejects.toThrow('simulated DB error in batch 2');
    // Batch 1 (t-b1-1) went through cb(TX) and its update was called; batch 2 never
    // reached the callback at all (transaction() itself rejected), so no partial
    // row-level state — either a batch fully committed or never touched the DB.
    expect(batchCount).toBe(2);
  });
});

describe('runApply — idempotency', () => {
  it('running apply twice against a fixture where rows are already done makes zero additional writes', async () => {
    const rows = [
      { ticket_id: 't-1', is_representative: true, previous_status: 'todo' },
      { ticket_id: 't-2', is_representative: false, previous_status: 'todo' },
    ];
    mockUndoLogFile(fakeUndoLog(rows));
    // Live candidates still match content predicate (status doesn't affect the
    // predicate), but both rows are already 'done'.
    mockFindAll.mockResolvedValue(rows.map((r) => fakeTicketRow(r.ticket_id, 'done')));
    mockFindByPk.mockImplementation(async (id: string) => fakeTicketRow(id, 'done'));

    const result = await runApply('/tmp/undo.json', 200);

    expect(result).toMatchObject({ closed: 0, skippedAlreadyDone: 2 });
    expect(mockActivityCreate).not.toHaveBeenCalled();
  });
});

describe('runApply — drift detection', () => {
  it('aborts with no writes when the undo log has a ticket id no longer matching live predicates', async () => {
    const rows = [{ ticket_id: 't-gone', is_representative: true, previous_status: 'todo' }];
    mockUndoLogFile(fakeUndoLog(rows));
    // Live candidates come back EMPTY — t-gone no longer matches (e.g. someone
    // already closed/edited it differently outside this script).
    mockFindAll.mockResolvedValue([]);

    await expect(runApply('/tmp/undo.json', 200)).rejects.toThrow(/Drift detected/);
    expect(mockFindByPk).not.toHaveBeenCalled();
    expect(mockActivityCreate).not.toHaveBeenCalled();
  });

  it('aborts with no writes when a NEW live candidate exists that the undo log does not cover', async () => {
    const rows = [{ ticket_id: 't-known', is_representative: true, previous_status: 'todo' }];
    mockUndoLogFile(fakeUndoLog(rows));
    mockFindAll.mockResolvedValue([fakeTicketRow('t-known', 'todo'), fakeTicketRow('t-new', 'todo')]);

    await expect(runApply('/tmp/undo.json', 200)).rejects.toThrow(/Drift detected/);
    expect(mockActivityCreate).not.toHaveBeenCalled();
  });
});

describe('runRevert — happy path + idempotency', () => {
  it('restores every row to its previous_status and adds a revert activity pair', async () => {
    const rows = [
      { ticket_id: 't-1', is_representative: true, previous_status: 'todo' },
      { ticket_id: 't-2', is_representative: false, previous_status: 'backlog' },
    ];
    mockUndoLogFile(fakeUndoLog(rows));
    const tickets: Record<string, any> = { 't-1': fakeTicketRow('t-1', 'done'), 't-2': fakeTicketRow('t-2', 'done') };
    mockFindByPk.mockImplementation(async (id: string) => tickets[id]);

    const result = await runRevert('/tmp/undo.json', 200);

    expect(result).toMatchObject({ processed: 2, reverted: 2, skippedAlreadyAtPreviousStatus: 0 });
    expect(tickets['t-1'].update).toHaveBeenCalledWith({ status: 'todo' }, { transaction: TX });
    expect(tickets['t-2'].update).toHaveBeenCalledWith({ status: 'backlog' }, { transaction: TX });
    // Append-only: a NEW status_changed + commented pair is added, nothing deleted.
    expect(mockActivityCreate).toHaveBeenCalledTimes(4);
  });

  it('is idempotent: a second revert run over already-reverted rows makes zero additional writes', async () => {
    const rows = [{ ticket_id: 't-1', is_representative: true, previous_status: 'todo' }];
    mockUndoLogFile(fakeUndoLog(rows));
    mockFindByPk.mockImplementation(async (id: string) => fakeTicketRow(id, 'todo')); // already at previous_status

    const result = await runRevert('/tmp/undo.json', 200);

    expect(result).toMatchObject({ reverted: 0, skippedAlreadyAtPreviousStatus: 1 });
    expect(mockActivityCreate).not.toHaveBeenCalled();
  });
});
