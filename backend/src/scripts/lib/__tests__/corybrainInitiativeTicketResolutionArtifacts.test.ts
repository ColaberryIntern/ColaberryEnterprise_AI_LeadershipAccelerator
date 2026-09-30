import fs from 'fs';
import { buildPlan, writeUndoLog, writeReport, readUndoLog } from '../corybrainInitiativeTicketResolutionArtifacts';
import type { CoryBrainInitiativeTicketRecheckResult } from '../../../intelligence/autonomy/corybrainInitiativeTicketAutoResolver';

function result(overrides: Partial<CoryBrainInitiativeTicketRecheckResult>): CoryBrainInitiativeTicketRecheckResult {
  return {
    ticket_id: 't-1',
    ticket_number: 1,
    is_subtask: false,
    linked_initiative_id: 'init-1',
    linked_initiative_status: 'cancelled',
    outcome: 'initiative_cancelled',
    should_close: true,
    target_status: 'cancelled',
    evidence_note: 'evidence text',
    ...overrides,
  };
}

describe('buildPlan', () => {
  it('groups the undo-log rows to should_close:true results only, carrying previous_status from the supplied map and target_status from the result', () => {
    const results = [
      result({ ticket_id: 'closes-1', should_close: true, outcome: 'initiative_cancelled', target_status: 'cancelled' }),
      result({ ticket_id: 'stays-open-1', should_close: false, outcome: 'initiative_still_active', target_status: null }),
    ];
    const statusByTicketId = new Map([['closes-1', 'backlog'], ['stays-open-1', 'backlog']]);

    const { undoLog } = buildPlan(results, statusByTicketId, 'CC-test-0001');

    expect(undoLog.rows).toHaveLength(1);
    expect(undoLog.rows[0]).toMatchObject({ ticket_id: 'closes-1', previous_status: 'backlog', target_status: 'cancelled', outcome: 'initiative_cancelled' });
    expect(undoLog.session_id).toBe('CC-test-0001');
  });

  it('a should_close:true result with target_status null (defensive, should not occur) is not added as an undo-log row', () => {
    const results = [result({ ticket_id: 'weird', should_close: true, target_status: null as any })];
    const { undoLog } = buildPlan(results, new Map([['weird', 'backlog']]), 'sess');
    expect(undoLog.rows).toHaveLength(0);
  });

  it('breakdown covers EVERY checked ticket (not just would-close ones), per outcome', () => {
    const results = [
      result({ ticket_id: 'c1', outcome: 'initiative_cancelled', should_close: true, target_status: 'cancelled' }),
      result({ ticket_id: 'd1', outcome: 'initiative_completed', should_close: true, target_status: 'done' }),
      result({ ticket_id: 'a1', outcome: 'initiative_still_active', should_close: false, target_status: null }),
      result({ ticket_id: 'u1', outcome: 'initiative_not_found', should_close: false, target_status: null }),
    ];
    const statusByTicketId = new Map(results.map((r) => [r.ticket_id, 'backlog']));

    const { undoLog } = buildPlan(results, statusByTicketId, 'sess');

    expect(undoLog.breakdown.initiative_cancelled).toEqual({ checked: 1, would_close: 1 });
    expect(undoLog.breakdown.initiative_completed).toEqual({ checked: 1, would_close: 1 });
    expect(undoLog.breakdown.initiative_still_active).toEqual({ checked: 1, would_close: 0 });
    expect(undoLog.breakdown.initiative_not_found).toEqual({ checked: 1, would_close: 0 });
  });

  it('report markdown is grouped by outcome and states nothing has been written', () => {
    const results = [result({ ticket_id: 'c1', outcome: 'initiative_cancelled' })];
    const { reportMarkdown } = buildPlan(results, new Map([['c1', 'backlog']]), 'sess');

    expect(reportMarkdown).toContain('## initiative_cancelled');
    expect(reportMarkdown).toContain('No writes have occurred');
  });

  it('defaults previous_status to "backlog" when the caller\'s status map is missing an entry (defensive, never throws)', () => {
    const results = [result({ ticket_id: 'no-status-known' })];
    const { undoLog } = buildPlan(results, new Map(), 'sess');
    expect(undoLog.rows[0].previous_status).toBe('backlog');
  });
});

describe('writeUndoLog / writeReport / readUndoLog', () => {
  it('writeUndoLog writes valid JSON that readUndoLog can read back byte-faithfully', () => {
    const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    const readSpy = jest.spyOn(fs, 'readFileSync');

    const results = [result({ ticket_id: 'c1' })];
    const { undoLog } = buildPlan(results, new Map([['c1', 'backlog']]), 'sess');
    const path = writeUndoLog(undoLog, '/tmp', 12345);

    expect(path).toContain('corybrain-initiative-ticket-undo-log-12345.json');
    const written = writeSpy.mock.calls[0][1] as string;
    readSpy.mockImplementation(() => written);
    const readBack = readUndoLog(path);

    expect(readBack).toEqual(undoLog);
    writeSpy.mockRestore();
    readSpy.mockRestore();
  });

  it('writeReport writes the markdown content to a .md path', () => {
    const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    const path = writeReport('# hello', '/tmp', 999);
    expect(path).toContain('corybrain-initiative-ticket-dry-run-999.md');
    expect(writeSpy).toHaveBeenCalledWith(path, '# hello', 'utf8');
    writeSpy.mockRestore();
  });

  it('readUndoLog throws on a malformed file (missing rows[] or breakdown{})', () => {
    const readSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => JSON.stringify({ generated_at: 'x' }));
    expect(() => readUndoLog('/tmp/bad.json')).toThrow(/Malformed undo log/);
    readSpy.mockRestore();
  });
});
