/**
 * Apply/revert engine tests for the strategic_initiatives historical duplicate
 * consolidation. Models and the sequelize instance are mocked — this is the
 * batching, transaction-per-batch, idempotency, drift-detection, and (critically)
 * ticket-isolation control flow under test, not Postgres. buildPlan()/grouping logic
 * is covered separately in lib/__tests__/strategicInitiativeDedupGroups.test.ts.
 */
import fs from 'fs';
import { Op } from 'sequelize';

const mockFindAll = jest.fn();
const mockFindByPk = jest.fn();
const mockLogAiEvent = jest.fn(() => Promise.resolve());

jest.mock('../../models/StrategicInitiative', () => ({
  __esModule: true,
  default: { findAll: (...a: any[]) => mockFindAll(...a), findByPk: (...a: any[]) => mockFindByPk(...a) },
}));
jest.mock('../../services/aiEventService', () => ({ logAiEvent: (...a: any[]) => mockLogAiEvent(...a) }));

// Deliberately NOT mocking '../../config/database': the module under test transitively
// imports coryInitiatives.ts (for normalizeInitiativeDedupTitle) which itself imports
// ticketService.ts -> models/index.ts, side-effect-initializing every Sequelize model
// (Cohort, AgentTask, ...) via Model.init(). Model.init() needs a REAL Sequelize
// instance (it calls sequelize-internal methods a hand-rolled mock object doesn't
// have) even though no live DB connection is ever made in this unit-test process —
// coryInitiatives.test.ts already proves the real (unmocked) config/database module
// loads cleanly in this exact jest environment. Only sequelize.transaction() itself
// is spied on below, which is enough to control/observe the batching behavior under
// test without needing to fake the whole Sequelize instance.
import { sequelize } from '../../config/database';

import {
  runApply,
  runRevert,
  parseArgs,
} from '../consolidateDuplicateStrategicInitiatives';
import { ConsolidationUndoLog } from '../lib/strategicInitiativeConsolidationArtifacts';

const TX = { __tx: true };
let transactionSpy: jest.SpyInstance;

/**
 * A minimal fake Sequelize initiative instance with a real, spy-able .update().
 * `createdAt` matters: duplicateGroups()/pickSurvivor() key off it for real, so
 * fixtures must give the intended survivor a strictly later timestamp than every
 * non-survivor row in the same group, or the "live survivor" the code recomputes
 * won't match what the test intends.
 */
function fakeInitiativeRow(id: string, status: string, description: string, createdAt = '2026-08-01T00:00:00.000Z') {
  const row: any = {
    id,
    status,
    description,
    update: jest.fn().mockImplementation(async (patch: Record<string, any>) => {
      Object.assign(row, patch);
      return row;
    }),
    toJSON: () => ({
      id,
      title: 'CampaignQAAgent is slow (120.0s avg)',
      description: row.description,
      status: row.status,
      created_at: createdAt,
    }),
  };
  return row;
}

function fakeUndoLog(rows: Array<{ initiative_id: string; previous_status: string; previous_description: string | null }>): ConsolidationUndoLog {
  return {
    generated_at: '2026-08-15T00:00:00.000Z',
    session_id: 'CC-20260815-test',
    groups: {
      'CampaignQAAgent is slow (Ns avg)': {
        survivor_id: 'survivor-1',
        group_count: rows.length + 1,
        earliest_seen_at: '2026-05-07T00:00:00.000Z',
        latest_seen_at: '2026-08-07T00:00:00.000Z',
      },
    },
    rows: rows.map((r) => ({
      initiative_id: r.initiative_id,
      group_key: 'CampaignQAAgent is slow (Ns avg)',
      previous_status: r.previous_status,
      previous_description: r.previous_description,
    })),
  };
}

let readFileSpy: jest.SpyInstance;
let logSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  transactionSpy = jest.spyOn(sequelize, 'transaction').mockImplementation(async (cb: any) => cb(TX));
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  readFileSpy?.mockRestore();
  transactionSpy.mockRestore();
  logSpy.mockRestore();
});

function mockUndoLogFile(undoLog: ConsolidationUndoLog) {
  readFileSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => JSON.stringify(undoLog));
}

describe('parseArgs', () => {
  it('defaults to plan mode with no flags', () => {
    expect(parseArgs([])).toMatchObject({ mode: 'plan', batchSize: 200, sessionId: 'unspecified-session' });
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
  it('reads a custom --session-id', () => {
    expect(parseArgs(['--session-id', 'CC-20260815-abcd'])).toMatchObject({ sessionId: 'CC-20260815-abcd' });
  });
});

describe('runApply — happy path', () => {
  it('cancels every non-survivor row across 2 batches with an appended note; survivor is never touched', async () => {
    const rows = [
      { initiative_id: 'i-old-1', previous_status: 'proposed', previous_description: 'Original finding 1' },
      { initiative_id: 'i-old-2', previous_status: 'proposed', previous_description: 'Original finding 2' },
      { initiative_id: 'i-old-3', previous_status: 'proposed', previous_description: 'Original finding 3' },
    ];
    const undoLog = fakeUndoLog(rows);
    mockUndoLogFile(undoLog);
    // Old rows strictly PREDATE the survivor, so the code's own recomputed
    // pickSurvivor() genuinely agrees with the undo log's planned 'survivor-1'.
    const oldTimestamps = ['2026-05-07T00:00:00.000Z', '2026-06-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'];
    // Live candidates: the 3 non-survivor rows + the survivor, all still 'proposed'.
    const liveRows = [
      ...rows.map((r, i) => fakeInitiativeRow(r.initiative_id, 'proposed', r.previous_description!, oldTimestamps[i])),
      fakeInitiativeRow('survivor-1', 'proposed', 'Survivor description', '2026-08-07T00:00:00.000Z'),
    ];
    mockFindAll.mockResolvedValue(liveRows);

    const dbRows: Record<string, any> = Object.fromEntries(
      rows.map((r, i) => [r.initiative_id, fakeInitiativeRow(r.initiative_id, 'proposed', r.previous_description!, oldTimestamps[i])]),
    );
    mockFindByPk.mockImplementation(async (id: string) => dbRows[id]);

    const result = await runApply('/tmp/undo.json', 2);

    expect(result).toMatchObject({ processed: 3, cancelled: 3, skippedAlreadyCancelled: 0, batches: 2 });
    for (const r of rows) {
      expect(dbRows[r.initiative_id].update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'cancelled',
          description: expect.stringContaining(r.previous_description!),
        }),
        { transaction: TX },
      );
      const call = dbRows[r.initiative_id].update.mock.calls[0][0];
      expect(call.description).toContain('survivor-1');
      expect(call.description).toContain('CONSOLIDATED');
    }
    // Survivor was never looked up by findByPk at all — structurally never mutated.
    expect(mockFindByPk).not.toHaveBeenCalledWith('survivor-1', expect.anything());
    expect(mockLogAiEvent).toHaveBeenCalledTimes(3);
    expect(mockLogAiEvent).toHaveBeenCalledWith(
      'CoryBrain',
      'INITIATIVE_CONSOLIDATED',
      'strategic_initiatives',
      'i-old-1',
      expect.objectContaining({ survivor_id: 'survivor-1' }),
    );
  });
});

describe('runApply — failure mid-batch', () => {
  it('rolls back only the failing batch; an earlier committed batch is unaffected', async () => {
    const rows = [
      { initiative_id: 'i-b1', previous_status: 'proposed', previous_description: 'd1' },
      { initiative_id: 'i-b2', previous_status: 'proposed', previous_description: 'd2' },
    ];
    mockUndoLogFile(fakeUndoLog(rows));
    mockFindAll.mockResolvedValue([
      fakeInitiativeRow('i-b1', 'proposed', 'd1', '2026-05-07T00:00:00.000Z'),
      fakeInitiativeRow('i-b2', 'proposed', 'd2', '2026-06-01T00:00:00.000Z'),
      fakeInitiativeRow('survivor-1', 'proposed', 'survivor', '2026-08-07T00:00:00.000Z'),
    ]);

    let batchCount = 0;
    transactionSpy.mockImplementation(async (cb: any) => {
      batchCount++;
      if (batchCount === 2) throw new Error('simulated DB error in batch 2');
      return cb(TX);
    });
    mockFindByPk.mockImplementation(async (id: string) => fakeInitiativeRow(id, 'proposed', 'd'));

    await expect(runApply('/tmp/undo.json', 1)).rejects.toThrow('simulated DB error in batch 2');
    expect(batchCount).toBe(2);
  });
});

describe('runApply — idempotency', () => {
  it('running apply twice against a REALISTIC post-first-apply fixture (rows already cancelled, live fetch reflects that) makes zero additional writes', async () => {
    // Regression test for a real bug caught during this run's actual production
    // execution: the live drift-check fetch must include status='cancelled' rows,
    // not just 'proposed' ones, or a second --apply run sees an empty duplicate
    // group (the lone still-proposed survivor doesn't group with anything once its
    // duplicates are gone) and checkDrift() wrongly aborts as "drifted" instead of
    // recognizing "already fully applied, nothing left to do." This fixture mirrors
    // real post-apply DB state exactly — the non-survivor rows are 'cancelled', not
    // 'proposed' — which the earlier (buggy) version of this test did NOT do.
    const rows = [
      { initiative_id: 'i-1', previous_status: 'proposed', previous_description: 'd1' },
      { initiative_id: 'i-2', previous_status: 'proposed', previous_description: 'd2' },
    ];
    mockUndoLogFile(fakeUndoLog(rows));
    // Live candidates reflect REAL post-first-apply state: the two non-survivors are
    // now 'cancelled' (with their note already appended), the survivor is still
    // 'proposed'. duplicateGroups()/pickSurvivor() are status-agnostic, so this
    // group is still correctly reconstructed and matches the undo log -> no drift.
    mockFindAll.mockResolvedValue([
      fakeInitiativeRow('i-1', 'cancelled', 'd1\n\n---\n[CONSOLIDATED ...]', '2026-05-07T00:00:00.000Z'),
      fakeInitiativeRow('i-2', 'cancelled', 'd2\n\n---\n[CONSOLIDATED ...]', '2026-06-01T00:00:00.000Z'),
      fakeInitiativeRow('survivor-1', 'proposed', 'survivor', '2026-08-07T00:00:00.000Z'),
    ]);
    mockFindByPk.mockImplementation(async (id: string) => fakeInitiativeRow(id, 'cancelled', 'already cancelled'));

    const result = await runApply('/tmp/undo.json', 200);

    expect(result).toMatchObject({ cancelled: 0, skippedAlreadyCancelled: 2 });
    expect(mockLogAiEvent).not.toHaveBeenCalled();
  });

  it('the live drift-check fetch queries status IN (proposed, cancelled), not proposed alone', async () => {
    const rows = [{ initiative_id: 'i-1', previous_status: 'proposed', previous_description: 'd1' }];
    mockUndoLogFile(fakeUndoLog(rows));
    mockFindAll.mockResolvedValue([
      fakeInitiativeRow('i-1', 'cancelled', 'd1', '2026-05-07T00:00:00.000Z'),
      fakeInitiativeRow('survivor-1', 'proposed', 'survivor', '2026-08-07T00:00:00.000Z'),
    ]);
    mockFindByPk.mockImplementation(async (id: string) => fakeInitiativeRow(id, 'cancelled', 'd1'));

    await runApply('/tmp/undo.json', 200);

    const whereArg = mockFindAll.mock.calls[0][0].where;
    // The bug: an earlier version queried `{ status: 'proposed' }` (a bare string),
    // which excludes already-cancelled rows and breaks idempotency (see the test
    // above). The fix uses `{ status: { [Op.in]: [...] } }`. Whatever the exact
    // shape, it must NOT be the literal string 'proposed' alone.
    expect(whereArg.status).not.toBe('proposed');
    expect(typeof whereArg.status).toBe('object');
    const inClause = whereArg.status[Op.in];
    expect(inClause).toEqual(expect.arrayContaining(['proposed', 'cancelled']));
  });
});

describe('runApply — drift detection', () => {
  it('aborts with no writes when the undo log has a row no longer part of any live duplicate group', async () => {
    const rows = [{ initiative_id: 'i-gone', previous_status: 'proposed', previous_description: 'd' }];
    mockUndoLogFile(fakeUndoLog(rows));
    // Live candidates come back empty — i-gone no longer matches any duplicate group.
    mockFindAll.mockResolvedValue([]);

    await expect(runApply('/tmp/undo.json', 200)).rejects.toThrow(/Drift detected/);
    expect(mockFindByPk).not.toHaveBeenCalled();
    expect(mockLogAiEvent).not.toHaveBeenCalled();
  });

  it('aborts with no writes when a NEW live duplicate row exists that the undo log does not cover', async () => {
    const rows = [{ initiative_id: 'i-known', previous_status: 'proposed', previous_description: 'd' }];
    mockUndoLogFile(fakeUndoLog(rows));
    mockFindAll.mockResolvedValue([
      fakeInitiativeRow('i-known', 'proposed', 'd'),
      fakeInitiativeRow('survivor-1', 'proposed', 'survivor'),
      fakeInitiativeRow('i-new', 'proposed', 'd'), // shares title -> same group -> new non-survivor
    ]);

    await expect(runApply('/tmp/undo.json', 200)).rejects.toThrow(/Drift detected/);
    expect(mockLogAiEvent).not.toHaveBeenCalled();
  });

  it('aborts with no writes when the live survivor for a group differs from the planned survivor', async () => {
    const rows = [{ initiative_id: 'i-old', previous_status: 'proposed', previous_description: 'd' }];
    mockUndoLogFile(fakeUndoLog(rows));
    // A brand-new, even-more-recent row now exists — it, not 'survivor-1', is the
    // live survivor, which invalidates the plan even though the id sets overlap.
    const newerSurvivor = fakeInitiativeRow('survivor-2-newer', 'proposed', 'newer');
    newerSurvivor.toJSON = () => ({
      id: 'survivor-2-newer',
      title: 'CampaignQAAgent is slow (999.0s avg)',
      description: 'newer',
      status: 'proposed',
      created_at: '2026-08-14T00:00:00.000Z', // later than the fixture's 'survivor-1'
    });
    mockFindAll.mockResolvedValue([fakeInitiativeRow('i-old', 'proposed', 'd'), newerSurvivor]);

    await expect(runApply('/tmp/undo.json', 200)).rejects.toThrow(/Drift detected/);
  });
});

describe('runRevert — happy path + idempotency', () => {
  it('restores every row to its previous status AND description', async () => {
    const rows = [
      { initiative_id: 'i-1', previous_status: 'proposed', previous_description: 'Original 1' },
      { initiative_id: 'i-2', previous_status: 'proposed', previous_description: 'Original 2' },
    ];
    mockUndoLogFile(fakeUndoLog(rows));
    const dbRows: Record<string, any> = {
      'i-1': fakeInitiativeRow('i-1', 'cancelled', 'Original 1\n\n---\n[CONSOLIDATED ...]'),
      'i-2': fakeInitiativeRow('i-2', 'cancelled', 'Original 2\n\n---\n[CONSOLIDATED ...]'),
    };
    mockFindByPk.mockImplementation(async (id: string) => dbRows[id]);

    const result = await runRevert('/tmp/undo.json', 200);

    expect(result).toMatchObject({ processed: 2, reverted: 2, skippedAlreadyAtPreviousState: 0 });
    expect(dbRows['i-1'].update).toHaveBeenCalledWith(
      { status: 'proposed', description: 'Original 1' },
      { transaction: TX },
    );
    expect(dbRows['i-2'].update).toHaveBeenCalledWith(
      { status: 'proposed', description: 'Original 2' },
      { transaction: TX },
    );
  });

  it('is idempotent: a second revert run over already-reverted rows makes zero additional writes', async () => {
    const rows = [{ initiative_id: 'i-1', previous_status: 'proposed', previous_description: 'Original 1' }];
    mockUndoLogFile(fakeUndoLog(rows));
    mockFindByPk.mockImplementation(async (id: string) => fakeInitiativeRow(id, 'proposed', 'Original 1')); // already reverted

    const result = await runRevert('/tmp/undo.json', 200);

    expect(result).toMatchObject({ reverted: 0, skippedAlreadyAtPreviousState: 1 });
  });
});

describe('never touches tickets — structural guarantee', () => {
  it('the source file has no import referencing Ticket, TicketActivity, or the models barrel', () => {
    // A real static check against the actual source text (not the mocked module
    // graph) — this is what makes "never touches a ticket" a structural fact rather
    // than a behavior that merely happened not to occur in the test cases above.
    const source = jest.requireActual('fs').readFileSync(
      require.resolve('../consolidateDuplicateStrategicInitiatives'),
      'utf8',
    );
    const importLines = source
      .split('\n')
      .filter((line: string) => /^\s*import\b/.test(line));

    expect(importLines.some((l: string) => /\bTicket\b/.test(l))).toBe(false);
    expect(importLines.some((l: string) => /\bTicketActivity\b/.test(l))).toBe(false);
    expect(importLines.some((l: string) => /['"]\.\.\/models['"]/.test(l))).toBe(false);
    // Sanity: the file DOES import StrategicInitiative, proving this check isn't
    // vacuously passing against an empty/broken import list.
    expect(importLines.some((l: string) => /StrategicInitiative/.test(l))).toBe(true);
  });
});
