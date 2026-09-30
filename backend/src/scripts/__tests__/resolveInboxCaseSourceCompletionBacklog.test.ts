/**
 * plan/apply/revert engine tests for the InboxCaseEngine source-completion historical
 * bulk-clear. Mirrors resolveCoryBrainInitiativeStaleTickets.test.ts's established
 * mocking shape — mocks the resolver's real functions directly, not Postgres.
 * buildPlan()'s own content is covered separately in
 * lib/__tests__/inboxCaseSourceCompletionArtifacts.test.ts.
 */
import fs from 'fs';

const mockPreview = jest.fn();
const mockClassify = jest.fn();
const mockApplyItems = jest.fn();
const mockCloseCases = jest.fn();
const mockGetCaseTicketId = jest.fn();
const mockCaseFindByPk = jest.fn();
const mockItemFindByPk = jest.fn();
const mockReopenCase = jest.fn();

jest.mock('../../config/database', () => ({ sequelize: { authenticate: jest.fn() } }));
jest.mock('../../intelligence/autonomy/inboxCaseSourceCompletionResolver', () => ({
  previewInboxCaseSourceCompletionResolution: (...a: any[]) => mockPreview(...a),
  classifyOpenBasecampTodoItems: (...a: any[]) => mockClassify(...a),
  applyItemDispositions: (...a: any[]) => mockApplyItems(...a),
  closeEligibleCases: (...a: any[]) => mockCloseCases(...a),
}));
jest.mock('../../services/inboxCase/caseTicketService', () => ({
  getCaseTicketId: (...a: any[]) => mockGetCaseTicketId(...a),
}));
jest.mock('../../models/InboxCase', () => ({ __esModule: true, default: { findByPk: (...a: any[]) => mockCaseFindByPk(...a) } }));
jest.mock('../../models/InboxCaseItem', () => ({ __esModule: true, default: { findByPk: (...a: any[]) => mockItemFindByPk(...a) } }));
jest.mock('../../services/inboxCase/caseRepository', () => ({ reopenCase: (...a: any[]) => mockReopenCase(...a) }));

import { runPlan, runApply, runRevert, parseArgs } from '../resolveInboxCaseSourceCompletionBacklog';
import { UndoLog } from '../lib/inboxCaseSourceCompletionArtifacts';

let readFileSpy: jest.SpyInstance;
let logSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  readFileSpy?.mockRestore();
  logSpy.mockRestore();
});

function mockUndoLogFile(undoLog: UndoLog) {
  readFileSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => JSON.stringify(undoLog));
}

function fakeUndoLog(rows: UndoLog['rows']): UndoLog {
  return {
    generated_at: '2026-08-16T00:00:00.000Z',
    session_id: 'CC-test',
    rows,
    items_breakdown: { completed_at_source: rows.length, trashed_at_source: 0, still_active: 0, no_live_signal: 0 },
    items_checked: rows.length,
    cases_checked: rows.length,
  };
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
    expect(parseArgs(['--session-id', 'CC-20260816-rp3x'])).toMatchObject({ sessionId: 'CC-20260816-rp3x' });
  });
});

describe('runPlan — orchestration (read-only)', () => {
  it('runs the real preview, looks up real case state + ticket id for each would-close case, writes undo log + report, zero item/case writes', async () => {
    mockPreview.mockResolvedValue({
      items_checked: 1,
      items_breakdown: { completed_at_source: 1, trashed_at_source: 0, still_active: 0, no_live_signal: 0 },
      items_disposed: 0,
      cases_checked: 1,
      cases_closed: 0,
      duration_ms: 5,
      item_results: [{ item_id: 'i-1', case_id: 'c-1', bc_id: 'bc-1', outcome: 'completed_at_source', disposition: 'RESOLVED', reason: 'x', applied: true }],
      case_results: [{ case_id: 'c-1', closable: true, closed: false, blockers_count: 0 }],
    });
    mockCaseFindByPk.mockResolvedValue({ id: 'c-1', state: 'ASSESSING' });
    mockGetCaseTicketId.mockResolvedValue('ticket-1');
    const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);

    const result = await runPlan('/tmp', 'CC-test');

    expect(result.totalChecked).toBe(1);
    expect(result.totalWouldClose).toBe(1);
    expect(writeSpy).toHaveBeenCalledTimes(2); // undo log + report
    expect(mockApplyItems).not.toHaveBeenCalled(); // read-only — no write path invoked
    expect(mockCloseCases).not.toHaveBeenCalled();
    writeSpy.mockRestore();
  });
});

describe('runApply — happy path', () => {
  it('re-derives live classification scoped to the undo log item set and closes cases whose live guard passes', async () => {
    const rows: UndoLog['rows'] = [
      { case_id: 'c-1', ticket_id: 't-1', item_ids_disposed: [{ item_id: 'i-1', disposition: 'RESOLVED' }], case_would_close: true, case_previous_state: 'ASSESSING' },
    ];
    mockUndoLogFile(fakeUndoLog(rows));
    mockClassify.mockResolvedValue([
      { item_id: 'i-1', case_id: 'c-1', bc_id: 'bc-1', outcome: 'completed_at_source', disposition: 'RESOLVED', reason: 'fresh' },
      { item_id: 'i-unreviewed', case_id: 'c-2', bc_id: 'bc-2', outcome: 'completed_at_source', disposition: 'RESOLVED', reason: 'fresh' },
    ]);
    mockApplyItems.mockImplementation(async (classifications: any[]) =>
      classifications.map((c) => ({ ...c, applied: true })),
    );
    mockCloseCases.mockResolvedValue([{ case_id: 'c-1', closable: true, closed: true, blockers_count: 0 }]);

    const result = await runApply('/tmp/undo.json', 200);

    expect(result).toMatchObject({ itemsReviewed: 1, itemsDisposed: 1, casesReviewed: 1, casesClosed: 1, casesSkippedNotClosable: 0 });
    // Only the reviewed item (i-1) was passed to applyItemDispositions, never i-unreviewed.
    const passedToApply = mockApplyItems.mock.calls[0][0];
    expect(passedToApply).toHaveLength(1);
    expect(passedToApply[0].item_id).toBe('i-1');
    // Only the reviewed case was passed to closeEligibleCases.
    expect(mockCloseCases).toHaveBeenCalledWith(['c-1']);
  });
});

describe('runApply — condition re-emerged since --plan', () => {
  it('a case whose live guard no longer passes is reported skipped, not force-closed, without aborting the batch', async () => {
    const rows: UndoLog['rows'] = [
      { case_id: 'c-1', ticket_id: 't-1', item_ids_disposed: [], case_would_close: true, case_previous_state: 'ASSESSING' },
      { case_id: 'c-2', ticket_id: 't-2', item_ids_disposed: [], case_would_close: true, case_previous_state: 'ASSESSING' },
    ];
    mockUndoLogFile(fakeUndoLog(rows));
    mockClassify.mockResolvedValue([]);
    mockApplyItems.mockResolvedValue([]);
    mockCloseCases.mockResolvedValue([
      { case_id: 'c-1', closable: true, closed: true, blockers_count: 0 },
      { case_id: 'c-2', closable: false, closed: false, blockers_count: 1 }, // new blocker appeared since --plan
    ]);

    const result = await runApply('/tmp/undo.json', 200);

    expect(result).toMatchObject({ casesClosed: 1, casesSkippedNotClosable: 1 });
  });
});

describe('runApply — never writes outside the undo log\'s own reviewed set', () => {
  it('a NEW live-resolvable item not present in the undo log is never passed to applyItemDispositions', async () => {
    const rows: UndoLog['rows'] = [
      { case_id: 'c-1', ticket_id: 't-1', item_ids_disposed: [{ item_id: 'i-known', disposition: 'RESOLVED' }], case_would_close: true, case_previous_state: 'ASSESSING' },
    ];
    mockUndoLogFile(fakeUndoLog(rows));
    mockClassify.mockResolvedValue([
      { item_id: 'i-known', case_id: 'c-1', bc_id: 'bc-1', outcome: 'completed_at_source', disposition: 'RESOLVED', reason: 'x' },
      { item_id: 'i-new-unreviewed', case_id: 'c-9', bc_id: 'bc-9', outcome: 'completed_at_source', disposition: 'RESOLVED', reason: 'x' },
    ]);
    mockApplyItems.mockImplementation(async (c: any[]) => c.map((x) => ({ ...x, applied: true })));
    mockCloseCases.mockResolvedValue([]);

    await runApply('/tmp/undo.json', 200);

    const passed = mockApplyItems.mock.calls[0][0];
    expect(passed.map((c: any) => c.item_id)).toEqual(['i-known']);
  });
});

describe('runApply — idempotency', () => {
  it('an already-applied item (no longer undispositioned) simply does not appear in the live classification pass, zero re-writes', async () => {
    const rows: UndoLog['rows'] = [
      { case_id: 'c-1', ticket_id: 't-1', item_ids_disposed: [{ item_id: 'i-1', disposition: 'RESOLVED' }], case_would_close: true, case_previous_state: 'ASSESSING' },
    ];
    mockUndoLogFile(fakeUndoLog(rows));
    mockClassify.mockResolvedValue([]); // already dispositioned — classifyOpenBasecampTodoItems only returns disposition:null items
    mockApplyItems.mockResolvedValue([]);
    mockCloseCases.mockResolvedValue([{ case_id: 'c-1', closable: false, closed: false, blockers_count: 0 }]); // already RESOLVED, or already closed

    const result = await runApply('/tmp/undo.json', 200);

    expect(result.itemsDisposed).toBe(0);
    expect(mockApplyItems).toHaveBeenCalledWith([]);
  });
});

describe('runRevert — happy path', () => {
  it('nulls out exactly the recorded item dispositions and reopens each currently-RESOLVED case', async () => {
    const rows: UndoLog['rows'] = [
      { case_id: 'c-1', ticket_id: 't-1', item_ids_disposed: [{ item_id: 'i-1', disposition: 'RESOLVED' }], case_would_close: true, case_previous_state: 'ASSESSING' },
    ];
    mockUndoLogFile(fakeUndoLog(rows));
    const item = { id: 'i-1', disposition: 'RESOLVED', update: jest.fn(async function (this: any, patch: any) { Object.assign(this, patch); }) };
    mockItemFindByPk.mockResolvedValue(item);
    mockCaseFindByPk.mockResolvedValue({ id: 'c-1', state: 'RESOLVED' });
    mockReopenCase.mockResolvedValue({});

    const result = await runRevert('/tmp/undo.json');

    expect(result).toMatchObject({ itemsReverted: 1, itemsSkippedAlreadyChanged: 0, casesReopened: 1, casesSkippedNotResolved: 0 });
    expect(item.update).toHaveBeenCalledWith(expect.objectContaining({ disposition: null, disposition_reason: null }));
    expect(mockReopenCase).toHaveBeenCalledWith('c-1', expect.objectContaining({ actor_type: 'system' }));
  });

  it('never stomps an item whose disposition was changed by something else since this run', async () => {
    const rows: UndoLog['rows'] = [
      { case_id: 'c-1', ticket_id: 't-1', item_ids_disposed: [{ item_id: 'i-1', disposition: 'RESOLVED' }], case_would_close: true, case_previous_state: 'ASSESSING' },
    ];
    mockUndoLogFile(fakeUndoLog(rows));
    const item = { id: 'i-1', disposition: 'WAITING', update: jest.fn() }; // someone else changed it
    mockItemFindByPk.mockResolvedValue(item);
    mockCaseFindByPk.mockResolvedValue({ id: 'c-1', state: 'ASSESSING' }); // not RESOLVED, nothing to reopen either

    const result = await runRevert('/tmp/undo.json');

    expect(item.update).not.toHaveBeenCalled();
    expect(result.itemsSkippedAlreadyChanged).toBe(1);
    expect(mockReopenCase).not.toHaveBeenCalled();
  });

  it('is idempotent: a case that is no longer RESOLVED (already reverted) is skipped, not double-reopened', async () => {
    const rows: UndoLog['rows'] = [
      { case_id: 'c-1', ticket_id: 't-1', item_ids_disposed: [], case_would_close: true, case_previous_state: 'ASSESSING' },
    ];
    mockUndoLogFile(fakeUndoLog(rows));
    mockCaseFindByPk.mockResolvedValue({ id: 'c-1', state: 'ASSESSING' }); // already reverted

    const result = await runRevert('/tmp/undo.json');

    expect(result).toMatchObject({ casesReopened: 0, casesSkippedNotResolved: 1 });
    expect(mockReopenCase).not.toHaveBeenCalled();
  });
});
