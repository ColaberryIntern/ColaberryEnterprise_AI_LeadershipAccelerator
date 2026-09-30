import fs from 'fs';
import { buildPlan, writeUndoLog, writeReport, readUndoLog } from '../inboxCaseSourceCompletionArtifacts';
import type { SourceCompletionReport } from '../../../intelligence/autonomy/inboxCaseSourceCompletionResolver';

function report(overrides: Partial<SourceCompletionReport> = {}): SourceCompletionReport {
  return {
    items_checked: 1,
    items_breakdown: { completed_at_source: 1, trashed_at_source: 0, still_active: 0, no_live_signal: 0 },
    items_disposed: 1,
    cases_checked: 1,
    cases_closed: 1,
    duration_ms: 10,
    item_results: [{ item_id: 'i-1', case_id: 'c-1', bc_id: 'bc-1', outcome: 'completed_at_source', disposition: 'RESOLVED', reason: 'it is done', applied: true }],
    case_results: [{ case_id: 'c-1', closable: true, closed: true, blockers_count: 0 }],
    ...overrides,
  };
}

describe('buildPlan', () => {
  it('produces one undo-log row per closable case, carrying its disposed items and previous state', () => {
    const r = report();
    const prevState = new Map([['c-1', 'ASSESSING']]);
    const ticketId = new Map<string, string | null>([['c-1', 'ticket-1']]);

    const { undoLog } = buildPlan(r, prevState, ticketId, 'CC-test-0001');

    expect(undoLog.rows).toHaveLength(1);
    expect(undoLog.rows[0]).toMatchObject({
      case_id: 'c-1',
      ticket_id: 'ticket-1',
      case_previous_state: 'ASSESSING',
      case_would_close: true,
    });
    expect(undoLog.rows[0].item_ids_disposed).toEqual([{ item_id: 'i-1', disposition: 'RESOLVED' }]);
    expect(undoLog.session_id).toBe('CC-test-0001');
  });

  it('a non-closable case is not added as an undo-log row', () => {
    const r = report({
      case_results: [{ case_id: 'c-2', closable: false, closed: false, blockers_count: 2 }],
    });
    const { undoLog } = buildPlan(r, new Map(), new Map(), 'sess');
    expect(undoLog.rows).toHaveLength(0);
  });

  it('a case that closes purely via the general guard sweep (no item changes) gets an empty item_ids_disposed array', () => {
    const r = report({
      item_results: [], // no basecamp_todo item touched at all
      case_results: [{ case_id: 'c-3', closable: true, closed: false, blockers_count: 0 }],
    });
    const prevState = new Map([['c-3', 'ASSESSING']]);
    const { undoLog } = buildPlan(r, prevState, new Map(), 'sess');

    expect(undoLog.rows).toHaveLength(1);
    expect(undoLog.rows[0].item_ids_disposed).toEqual([]);
  });

  it('items_breakdown covers every checked item, not just disposed ones', () => {
    const r = report({
      items_breakdown: { completed_at_source: 3, trashed_at_source: 1, still_active: 5, no_live_signal: 0 },
    });
    const { undoLog } = buildPlan(r, new Map(), new Map(), 'sess');
    expect(undoLog.items_breakdown).toEqual({ completed_at_source: 3, trashed_at_source: 1, still_active: 5, no_live_signal: 0 });
  });

  it('report markdown states nothing has been written and distinguishes signal-driven vs. general-sweep closes', () => {
    const r = report();
    const prevState = new Map([['c-1', 'ASSESSING']]);
    const { reportMarkdown } = buildPlan(r, prevState, new Map([['c-1', 't-1']]), 'sess');

    expect(reportMarkdown).toMatch(/No writes have occurred/);
    expect(reportMarkdown).toMatch(/Basecamp-completion signal/);
    expect(reportMarkdown).toContain('c-1');
  });
});

describe('writeUndoLog / writeReport / readUndoLog', () => {
  it('round-trips an undo log through disk', () => {
    const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    const undoLog = {
      generated_at: '2026-08-16T00:00:00.000Z',
      session_id: 'sess',
      rows: [{ case_id: 'c-1', ticket_id: 't-1', item_ids_disposed: [], case_would_close: true, case_previous_state: 'ASSESSING' }],
      items_breakdown: { completed_at_source: 0, trashed_at_source: 0, still_active: 0, no_live_signal: 0 },
      items_checked: 0,
      cases_checked: 1,
    };

    const path1 = writeUndoLog(undoLog, '/tmp', 12345);
    expect(path1).toContain('inboxcase-source-completion-undo-log-12345.json');
    expect(writeSpy).toHaveBeenCalledWith(path1, JSON.stringify(undoLog, null, 2), 'utf8');
    writeSpy.mockRestore();

    const readSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => JSON.stringify(undoLog));
    const readBack = readUndoLog(path1);
    expect(readBack).toEqual(undoLog);
    readSpy.mockRestore();
  });

  it('writeReport writes markdown to a predictable filename', () => {
    const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    const path1 = writeReport('# hello', '/tmp', 99999);
    expect(path1).toContain('inboxcase-source-completion-dry-run-99999.md');
    expect(writeSpy).toHaveBeenCalledWith(path1, '# hello', 'utf8');
    writeSpy.mockRestore();
  });

  it('readUndoLog throws on a malformed file (missing rows[])', () => {
    const readSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => JSON.stringify({ not_rows: true }));
    expect(() => readUndoLog('/tmp/bad.json')).toThrow(/Malformed undo log/);
    readSpy.mockRestore();
  });
});
