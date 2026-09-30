/**
 * Apply/revert engine tests for the stale strategic_initiatives resolution. Mirrors
 * the mocking shape workforceTicketAutoResolver.test.ts already uses for the same
 * dynamic-import convention (mock '../models' and 'sequelize' internals directly) —
 * this file uses dynamic `await import('../models')`/`await import('../config/database')`
 * throughout (not static top-level imports), matching this repo's own convention in
 * workforceTicketAutoResolver.ts / ticketOrchestrator.ts, and specifically to avoid
 * needing a real Sequelize connection in this unit-test process. Classification
 * (T001) and artifact-building (T002) are covered in their own dedicated test files;
 * this file is the batching/transaction/idempotency/drift-detection control flow.
 */
import fs from 'fs';

const mockInitiativeFindAll = jest.fn();
const mockInitiativeFindByPk = jest.fn();
const mockTicketFindAll = jest.fn();
const mockTicketFindByPk = jest.fn();
const mockTicketActivityCreate = jest.fn();
const mockAiAgentFindAll = jest.fn();
const mockLogAiEvent = jest.fn(() => Promise.resolve());

jest.mock('../../models', () => ({
  StrategicInitiative: {
    findAll: (...a: any[]) => mockInitiativeFindAll(...a),
    findByPk: (...a: any[]) => mockInitiativeFindByPk(...a),
  },
  Ticket: {
    findAll: (...a: any[]) => mockTicketFindAll(...a),
    findByPk: (...a: any[]) => mockTicketFindByPk(...a),
  },
  TicketActivity: { create: (...a: any[]) => mockTicketActivityCreate(...a) },
  AiAgent: { findAll: (...a: any[]) => mockAiAgentFindAll(...a) },
}));
jest.mock('../../services/aiEventService', () => ({ logAiEvent: (...a: any[]) => mockLogAiEvent(...a) }));

// Deliberately NOT mocking '../../config/database': the module under test dynamically
// imports '../../services/agentRegistrySeed' for RETIRED_AGENTS, which statically
// imports '../models/AiAgent' (the individual model file, not the mocked barrel
// above) — that file calls AiAgent.init() at load time, which needs a REAL Sequelize
// instance (it calls sequelize-internal methods a hand-rolled mock object doesn't
// have), even though no live DB connection is ever made in this unit-test process.
// Only sequelize.transaction() is spied on below (same technique
// consolidateDuplicateStrategicInitiatives.test.ts already uses for this exact
// reason), which is enough to control/observe batching without faking the whole
// Sequelize instance.
import { sequelize } from '../../config/database';

import {
  parseArgs,
  fetchLiveResolvableRows,
  runPlan,
  runApply,
  runRevert,
} from '../resolveStaleStrategicInitiatives';
import { StaleInitiativeUndoLog } from '../lib/staleInitiativeResolutionArtifacts';

const TX = { __tx: true };
let transactionSpy: jest.SpyInstance;

function fakeInitiative(id: string, status: string, description: string, ticketId: string) {
  const row: any = {
    id,
    status,
    description,
    ticket_id: ticketId,
    title: `${id}-title`,
    update: jest.fn().mockImplementation(async (patch: Record<string, any>) => {
      Object.assign(row, patch);
      return row;
    }),
  };
  return row;
}

function fakeTicket(id: string, status: string) {
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
  rows: Array<{
    initiative_id: string;
    ticket_id: string;
    outcome: 'healthy_completed' | 'retired_completed' | 'dept_alert_cancelled';
    target_initiative_status: 'completed' | 'cancelled';
    target_ticket_status: 'done' | 'cancelled';
    previous_ticket_status?: string;
  }>,
): StaleInitiativeUndoLog {
  return {
    generated_at: '2026-08-15T00:00:00.000Z',
    session_id: 'CC-20260815-test',
    rows: rows.map((r) => ({
      initiative_id: r.initiative_id,
      ticket_id: r.ticket_id,
      outcome: r.outcome,
      agent_name: 'SomeAgent',
      previous_initiative_status: 'proposed',
      previous_initiative_description: 'Original description',
      previous_ticket_status: r.previous_ticket_status ?? 'backlog',
      target_initiative_status: r.target_initiative_status,
      target_ticket_status: r.target_ticket_status,
      evidence_note: 'Evidence text.',
    })),
    skipped: [],
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

function mockUndoLogFile(undoLog: StaleInitiativeUndoLog) {
  readFileSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => JSON.stringify(undoLog));
}

describe('parseArgs', () => {
  it('defaults to plan mode', () => {
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
});

describe('fetchLiveResolvableRows', () => {
  it('joins initiatives to their linked ticket status and classifies each via the real classifier', async () => {
    mockInitiativeFindAll.mockResolvedValue([
      { id: 'i-1', title: 'AgentA is in error state', description: 'd1', ticket_id: 't-1' },
      { id: 'i-2', title: 'Finance department triggered 6 alerts in 24h', description: 'd2', ticket_id: 't-2' },
    ]);
    mockTicketFindAll.mockResolvedValue([
      { id: 't-1', status: 'backlog' },
      { id: 't-2', status: 'backlog' },
    ]);
    mockAiAgentFindAll.mockResolvedValue([
      { agent_name: 'AgentA', status: 'idle', enabled: true, run_count: 1000, error_count: 5 },
    ]);

    const rows = await fetchLiveResolvableRows();

    expect(rows).toHaveLength(2);
    const agentRow = rows.find((r) => r.initiative_id === 'i-1')!;
    expect(agentRow.ticket_status).toBe('backlog');
    expect(agentRow.classification.outcome).toBe('healthy_completed');
    const deptRow = rows.find((r) => r.initiative_id === 'i-2')!;
    expect(deptRow.classification.outcome).toBe('dept_alert_cancelled');
  });

  it('an initiative with no ticket_id gets ticket_status: null rather than throwing', async () => {
    mockInitiativeFindAll.mockResolvedValue([{ id: 'i-orphan', title: 'AgentA is in error state', description: null, ticket_id: null }]);
    mockTicketFindAll.mockResolvedValue([]);
    mockAiAgentFindAll.mockResolvedValue([{ agent_name: 'AgentA', status: 'idle', enabled: true, run_count: 100, error_count: 1 }]);

    const rows = await fetchLiveResolvableRows();
    expect(rows[0].ticket_id).toBeNull();
    expect(rows[0].ticket_status).toBeNull();
  });
});

describe('end-to-end through the full mocked-DB pipeline: untouched outcomes never become writable rows', () => {
  it('a candidate set mixing resolvable and all three untouched outcomes only counts/plans the resolvable ones, all the way from fetchLiveResolvableRows through runPlan', async () => {
    // Full-pipeline version of the same guarantee staleInitiativeResolutionArtifacts.test.ts
    // already proves for buildPlan() in isolation — this exercises it end-to-end
    // through the live-mocked fetch + classify + plan path, per plan.md T003's own
    // acceptance criteria.
    mockInitiativeFindAll.mockResolvedValue([
      { id: 'i-healthy', title: 'AgentA is in error state', description: 'd-healthy', ticket_id: 't-healthy' },
      { id: 'i-still-unhealthy', title: 'AgentB is in error state', description: 'd-unhealthy', ticket_id: 't-unhealthy' },
      {
        id: 'i-excluded',
        title: 'OpenclawLearningOptimizationAgent has 84% error rate',
        description: 'd-excluded',
        ticket_id: 't-excluded',
      },
      { id: 'i-ambiguous', title: 'AgentC is slow (120.1s avg)', description: 'd-ambiguous', ticket_id: 't-ambiguous' },
      {
        id: 'i-dept',
        title: 'Finance department triggered 6 alerts in 24h',
        description: 'd-dept',
        ticket_id: 't-dept',
      },
    ]);
    mockTicketFindAll.mockResolvedValue([
      { id: 't-healthy', status: 'backlog' },
      { id: 't-unhealthy', status: 'backlog' },
      { id: 't-excluded', status: 'backlog' },
      { id: 't-ambiguous', status: 'backlog' },
      { id: 't-dept', status: 'backlog' },
    ]);
    mockAiAgentFindAll.mockResolvedValue([
      { agent_name: 'AgentA', status: 'idle', enabled: true, run_count: 1000, error_count: 5 }, // healthy
      { agent_name: 'AgentB', status: 'active', enabled: true, run_count: 100, error_count: 40 }, // still unhealthy
      { agent_name: 'AgentC', status: 'idle', enabled: true, run_count: 500, error_count: 2 }, // healthy numbers but ambiguous title
      { agent_name: 'OpenclawLearningOptimizationAgent', status: 'idle', enabled: true, run_count: 882, error_count: 736 },
    ]);

    const rows = await fetchLiveResolvableRows();
    expect(rows).toHaveLength(5);
    const outcomesByInitiative = Object.fromEntries(rows.map((r) => [r.initiative_id, r.classification.outcome]));
    expect(outcomesByInitiative).toEqual({
      'i-healthy': 'healthy_completed',
      'i-still-unhealthy': 'still_unhealthy',
      'i-excluded': 'explicitly_excluded',
      'i-ambiguous': 'ambiguous_skipped',
      'i-dept': 'dept_alert_cancelled',
    });

    const writeFileSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    const planResult = await runPlan('/tmp/out', 'CC-20260815-test');
    writeFileSpy.mockRestore();

    // Only the 2 genuinely resolvable rows (healthy + dept-alert) are plannable —
    // the 3 untouched outcomes never reach totalRowsToResolve or the breakdown's
    // writable-row counts, even though all 5 were live candidates.
    expect(planResult.totalCandidates).toBe(5);
    expect(planResult.totalRowsToResolve).toBe(2);
    expect(planResult.breakdown.healthy_completed).toBe(1);
    expect(planResult.breakdown.dept_alert_cancelled).toBe(1);
    expect(planResult.breakdown.still_unhealthy).toBe(1); // present in the report for transparency...
    expect(planResult.breakdown.explicitly_excluded).toBe(1); // ...but none of these three
    expect(planResult.breakdown.ambiguous_skipped).toBe(1); // ever counts toward totalRowsToResolve above.
  });
});

describe('runPlan', () => {
  it('writes an undo log covering resolvable rows and reports the breakdown', async () => {
    mockInitiativeFindAll.mockResolvedValue([
      { id: 'i-1', title: 'AgentA is in error state', description: 'd1', ticket_id: 't-1' },
    ]);
    mockTicketFindAll.mockResolvedValue([{ id: 't-1', status: 'backlog' }]);
    mockAiAgentFindAll.mockResolvedValue([{ agent_name: 'AgentA', status: 'idle', enabled: true, run_count: 1000, error_count: 5 }]);

    const writeFileSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    const result = await runPlan('/tmp/out', 'CC-20260815-test');

    expect(result.totalCandidates).toBe(1);
    expect(result.totalRowsToResolve).toBe(1);
    expect(result.breakdown.healthy_completed).toBe(1);
    expect(writeFileSpy).toHaveBeenCalledTimes(2); // undo log + report
    writeFileSpy.mockRestore();
  });
});

describe('runApply — happy path, both tables', () => {
  it('resolves each row across 2 batches: initiative status+description AND ticket status+activity, both inside the same transaction', async () => {
    const rows = [
      { initiative_id: 'i-1', ticket_id: 't-1', outcome: 'healthy_completed' as const, target_initiative_status: 'completed' as const, target_ticket_status: 'done' as const },
      { initiative_id: 'i-2', ticket_id: 't-2', outcome: 'dept_alert_cancelled' as const, target_initiative_status: 'cancelled' as const, target_ticket_status: 'cancelled' as const },
      { initiative_id: 'i-3', ticket_id: 't-3', outcome: 'retired_completed' as const, target_initiative_status: 'completed' as const, target_ticket_status: 'done' as const },
    ];
    mockUndoLogFile(fakeUndoLog(rows));

    const liveInitiatives = rows.map((r) => fakeInitiative(r.initiative_id, 'proposed', 'Original description', r.ticket_id));
    const liveTickets = rows.map((r) => fakeTicket(r.ticket_id, 'backlog'));
    mockInitiativeFindAll.mockResolvedValue(liveInitiatives);
    mockTicketFindAll.mockResolvedValue(liveTickets);

    const initiativeById: Record<string, any> = Object.fromEntries(liveInitiatives.map((i) => [i.id, i]));
    const ticketById: Record<string, any> = Object.fromEntries(liveTickets.map((t) => [t.id, t]));
    mockInitiativeFindByPk.mockImplementation(async (id: string) => initiativeById[id]);
    mockTicketFindByPk.mockImplementation(async (id: string) => ticketById[id]);

    const result = await runApply('/tmp/undo.json', 2);

    expect(result).toMatchObject({ processed: 3, resolved: 3, skippedAlreadyApplied: 0, batches: 2 });

    // Row 1: healthy -> completed/done
    expect(initiativeById['i-1'].update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'completed', description: expect.stringContaining('AUTO-RESOLVED') }),
      { transaction: TX },
    );
    expect(ticketById['t-1'].update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'done', completed_at: expect.any(Date) }),
      { transaction: TX },
    );

    // Row 2: dept alert -> cancelled/cancelled, no completed_at
    expect(initiativeById['i-2'].update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'cancelled' }),
      { transaction: TX },
    );
    expect(ticketById['t-2'].update).toHaveBeenCalledWith({ status: 'cancelled' }, { transaction: TX });

    // Every resolved row gets exactly one TicketActivity with a real comment, actor 'agent'/'CoryBrain'
    expect(mockTicketActivityCreate).toHaveBeenCalledTimes(3);
    const activityCall = mockTicketActivityCreate.mock.calls.find((c) => c[0].ticket_id === 't-1')![0];
    expect(activityCall.actor_type).toBe('agent');
    expect(activityCall.actor_id).toBe('CoryBrain');
    expect(activityCall.action).toBe('status_changed');
    expect(activityCall.from_value).toBe('backlog');
    expect(activityCall.to_value).toBe('done');
    expect(activityCall.comment).toContain('AUTO-RESOLVED');

    expect(mockLogAiEvent).toHaveBeenCalledTimes(3);
  });
});

describe('runApply — idempotency', () => {
  it('a second --apply against already-resolved live rows makes zero further writes', async () => {
    const rows = [
      { initiative_id: 'i-1', ticket_id: 't-1', outcome: 'healthy_completed' as const, target_initiative_status: 'completed' as const, target_ticket_status: 'done' as const },
    ];
    mockUndoLogFile(fakeUndoLog(rows));
    // Live state already reflects the resolved target on BOTH tables.
    mockInitiativeFindAll.mockResolvedValue([fakeInitiative('i-1', 'completed', 'already resolved', 't-1')]);
    mockTicketFindAll.mockResolvedValue([fakeTicket('t-1', 'done')]);

    const result = await runApply('/tmp/undo.json', 200);

    expect(result).toMatchObject({ resolved: 0, skippedAlreadyApplied: 1 });
    expect(mockInitiativeFindByPk).not.toHaveBeenCalled();
    expect(mockTicketFindByPk).not.toHaveBeenCalled();
    expect(mockTicketActivityCreate).not.toHaveBeenCalled();
    expect(mockLogAiEvent).not.toHaveBeenCalled();
  });
});

describe('runApply — drift detection', () => {
  it('aborts with no writes when a row\'s live state matches neither previous nor target on either table', async () => {
    const rows = [
      { initiative_id: 'i-1', ticket_id: 't-1', outcome: 'healthy_completed' as const, target_initiative_status: 'completed' as const, target_ticket_status: 'done' as const },
    ];
    mockUndoLogFile(fakeUndoLog(rows));
    // Live initiative is 'approved' — neither the undo log's previous ('proposed') nor its target ('completed').
    mockInitiativeFindAll.mockResolvedValue([fakeInitiative('i-1', 'approved', 'changed by someone else', 't-1')]);
    mockTicketFindAll.mockResolvedValue([fakeTicket('t-1', 'backlog')]);

    await expect(runApply('/tmp/undo.json', 200)).rejects.toThrow(/Drift detected/);
    expect(mockInitiativeFindByPk).not.toHaveBeenCalled();
    expect(mockTicketActivityCreate).not.toHaveBeenCalled();
  });

  it('aborts with no writes when the initiative is at target but the ticket is not (partial/unexpected live state)', async () => {
    const rows = [
      { initiative_id: 'i-1', ticket_id: 't-1', outcome: 'healthy_completed' as const, target_initiative_status: 'completed' as const, target_ticket_status: 'done' as const },
    ];
    mockUndoLogFile(fakeUndoLog(rows));
    mockInitiativeFindAll.mockResolvedValue([fakeInitiative('i-1', 'completed', 'resolved', 't-1')]);
    mockTicketFindAll.mockResolvedValue([fakeTicket('t-1', 'in_progress')]); // unexpected — neither backlog nor done
    await expect(runApply('/tmp/undo.json', 200)).rejects.toThrow(/Drift detected/);
  });

  it('aborts with no writes when the initiative row is missing live entirely', async () => {
    const rows = [
      { initiative_id: 'i-gone', ticket_id: 't-1', outcome: 'healthy_completed' as const, target_initiative_status: 'completed' as const, target_ticket_status: 'done' as const },
    ];
    mockUndoLogFile(fakeUndoLog(rows));
    mockInitiativeFindAll.mockResolvedValue([]);
    mockTicketFindAll.mockResolvedValue([fakeTicket('t-1', 'backlog')]);
    await expect(runApply('/tmp/undo.json', 200)).rejects.toThrow(/Drift detected/);
  });
});

describe('runApply — failure mid-batch', () => {
  it('rolls back only the failing batch', async () => {
    const rows = [
      { initiative_id: 'i-1', ticket_id: 't-1', outcome: 'healthy_completed' as const, target_initiative_status: 'completed' as const, target_ticket_status: 'done' as const },
      { initiative_id: 'i-2', ticket_id: 't-2', outcome: 'healthy_completed' as const, target_initiative_status: 'completed' as const, target_ticket_status: 'done' as const },
    ];
    mockUndoLogFile(fakeUndoLog(rows));
    mockInitiativeFindAll.mockResolvedValue([
      fakeInitiative('i-1', 'proposed', 'd1', 't-1'),
      fakeInitiative('i-2', 'proposed', 'd2', 't-2'),
    ]);
    mockTicketFindAll.mockResolvedValue([fakeTicket('t-1', 'backlog'), fakeTicket('t-2', 'backlog')]);

    let batchCount = 0;
    transactionSpy.mockImplementation(async (cb: any) => {
      batchCount++;
      if (batchCount === 2) throw new Error('simulated DB error in batch 2');
      return cb(TX);
    });
    mockInitiativeFindByPk.mockImplementation(async (id: string) => fakeInitiative(id, 'proposed', 'd', 't-x'));
    mockTicketFindByPk.mockImplementation(async (id: string) => fakeTicket(id, 'backlog'));

    await expect(runApply('/tmp/undo.json', 1)).rejects.toThrow('simulated DB error in batch 2');
    expect(batchCount).toBe(2);
  });
});

describe('runRevert — happy path + idempotency (both tables)', () => {
  it('restores initiative status/description AND ticket status, appending a revert activity comment', async () => {
    const rows = [
      { initiative_id: 'i-1', ticket_id: 't-1', outcome: 'healthy_completed' as const, target_initiative_status: 'completed' as const, target_ticket_status: 'done' as const },
    ];
    mockUndoLogFile(fakeUndoLog(rows));
    mockInitiativeFindByPk.mockResolvedValue(fakeInitiative('i-1', 'completed', 'Original description\n\n[AUTO-RESOLVED ...]', 't-1'));
    mockTicketFindByPk.mockResolvedValue(fakeTicket('t-1', 'done'));

    const result = await runRevert('/tmp/undo.json', 200);

    expect(result).toMatchObject({ processed: 1, reverted: 1, skippedAlreadyAtPreviousState: 0 });
    expect(mockTicketActivityCreate).toHaveBeenCalledTimes(1);
    const comment = mockTicketActivityCreate.mock.calls[0][0].comment;
    expect(comment).toContain('Reverted by resolveStaleStrategicInitiatives --revert');
  });

  it('is idempotent: does not stop early and DOES process every row in a batch, not just the first already-reverted one', async () => {
    // Regression test for a real bug caught in review: an early `return` instead of
    // `continue` inside the per-row loop would silently stop processing the REST of
    // the batch the moment it hit the first already-reverted row.
    const rows = [
      { initiative_id: 'i-1', ticket_id: 't-1', outcome: 'healthy_completed' as const, target_initiative_status: 'completed' as const, target_ticket_status: 'done' as const },
      { initiative_id: 'i-2', ticket_id: 't-2', outcome: 'healthy_completed' as const, target_initiative_status: 'completed' as const, target_ticket_status: 'done' as const },
    ];
    mockUndoLogFile(fakeUndoLog(rows));
    // i-1 already reverted (matches previous state exactly); i-2 still needs reverting.
    const initiativeById: Record<string, any> = {
      'i-1': fakeInitiative('i-1', 'proposed', 'Original description', 't-1'),
      'i-2': fakeInitiative('i-2', 'completed', 'Original description\n\n[AUTO-RESOLVED ...]', 't-2'),
    };
    const ticketById: Record<string, any> = {
      't-1': fakeTicket('t-1', 'backlog'),
      't-2': fakeTicket('t-2', 'done'),
    };
    mockInitiativeFindByPk.mockImplementation(async (id: string) => initiativeById[id]);
    mockTicketFindByPk.mockImplementation(async (id: string) => ticketById[id]);

    const result = await runRevert('/tmp/undo.json', 200);

    expect(result).toMatchObject({ reverted: 1, skippedAlreadyAtPreviousState: 1 });
    // Proves i-2 was actually reached and reverted, not skipped due to an early exit.
    expect(initiativeById['i-2'].update).toHaveBeenCalledWith(
      { status: 'proposed', description: 'Original description' },
      { transaction: TX },
    );
    expect(ticketById['t-2'].update).toHaveBeenCalledWith(
      { status: 'backlog', completed_at: null },
      { transaction: TX },
    );
  });
});

describe('CLI arg parsing edge cases', () => {
  it('reads a custom --batch-size and --out-dir', () => {
    expect(parseArgs(['--batch-size', '50', '--out-dir', '/tmp/x'])).toMatchObject({ batchSize: 50, outDir: '/tmp/x' });
  });
  it('falls back to the default batch size on a non-numeric value', () => {
    expect(parseArgs(['--batch-size', 'notanumber'])).toMatchObject({ batchSize: 200 });
  });
});
