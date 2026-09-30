import fs from 'fs';
import { buildPlan, writeUndoLog, writeReport, readUndoLog } from '../coryEngineTicketResolutionArtifacts';
import type { CoryEngineTicketRecheckResult } from '../../../intelligence/autonomy/coryEngineTicketAutoResolver';

function result(overrides: Partial<CoryEngineTicketRecheckResult>): CoryEngineTicketRecheckResult {
  return {
    ticket_id: 't-1',
    ticket_number: 1,
    condition_type: 'agent_failure',
    outcome: 'agent_recovered',
    should_close: true,
    evidence_note: 'evidence text',
    ...overrides,
  };
}

describe('buildPlan', () => {
  it('groups the undo-log rows to should_close:true results only, carrying previous_status from the supplied map', () => {
    const results = [
      result({ ticket_id: 'closes-1', should_close: true, outcome: 'agent_recovered' }),
      result({ ticket_id: 'stays-open-1', should_close: false, outcome: 'agent_still_failing' }),
    ];
    const statusByTicketId = new Map([['closes-1', 'todo'], ['stays-open-1', 'todo']]);

    const { undoLog } = buildPlan(results, statusByTicketId, 'CC-test-0001');

    expect(undoLog.rows).toHaveLength(1);
    expect(undoLog.rows[0]).toMatchObject({ ticket_id: 'closes-1', previous_status: 'todo', condition_type: 'agent_failure' });
    expect(undoLog.session_id).toBe('CC-test-0001');
  });

  it('breakdown covers EVERY checked ticket (not just would-close ones), per condition-type', () => {
    const results = [
      result({ ticket_id: 'a1', condition_type: 'agent_failure', should_close: true }),
      result({ ticket_id: 'a2', condition_type: 'agent_failure', should_close: false, outcome: 'agent_still_failing' }),
      result({ ticket_id: 'c1', condition_type: 'conversion_drop', should_close: true, outcome: 'conversion_drop_cleared' }),
      result({ ticket_id: 'e1', condition_type: 'error_spike', should_close: false, outcome: 'error_spike_no_reliable_check' }),
      result({ ticket_id: 'u1', condition_type: 'unclassified', should_close: false, outcome: 'unclassified' }),
    ];
    const statusByTicketId = new Map(results.map((r) => [r.ticket_id, 'todo']));

    const { undoLog } = buildPlan(results, statusByTicketId, 'sess');

    expect(undoLog.breakdown.agent_failure).toEqual({ checked: 2, would_close: 1 });
    expect(undoLog.breakdown.conversion_drop).toEqual({ checked: 1, would_close: 1 });
    expect(undoLog.breakdown.error_spike).toEqual({ checked: 1, would_close: 0 });
    expect(undoLog.breakdown.unclassified).toEqual({ checked: 1, would_close: 0 });
  });

  it('report markdown is grouped by condition-type and states nothing has been written', () => {
    const results = [result({ ticket_id: 'a1', condition_type: 'agent_failure' })];
    const { reportMarkdown } = buildPlan(results, new Map([['a1', 'todo']]), 'sess');

    expect(reportMarkdown).toContain('## agent_failure');
    expect(reportMarkdown).toContain('No writes have occurred');
  });

  it('defaults previous_status to "todo" when the caller\'s status map is missing an entry (defensive, never throws)', () => {
    const results = [result({ ticket_id: 'no-status-known' })];
    const { undoLog } = buildPlan(results, new Map(), 'sess');
    expect(undoLog.rows[0].previous_status).toBe('todo');
  });
});

describe('writeUndoLog / writeReport / readUndoLog', () => {
  it('writeUndoLog writes valid JSON that readUndoLog can read back byte-faithfully', () => {
    const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    const readSpy = jest.spyOn(fs, 'readFileSync');

    const results = [result({ ticket_id: 'a1' })];
    const { undoLog } = buildPlan(results, new Map([['a1', 'todo']]), 'sess');
    const path = writeUndoLog(undoLog, '/tmp', 12345);

    expect(path).toContain('cory-engine-undo-log-12345.json');
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
    expect(path).toContain('cory-engine-dry-run-999.md');
    expect(writeSpy).toHaveBeenCalledWith(path, '# hello', 'utf8');
    writeSpy.mockRestore();
  });

  it('readUndoLog throws on a malformed file (missing rows[] or breakdown{})', () => {
    const readSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => JSON.stringify({ generated_at: 'x' }));
    expect(() => readUndoLog('/tmp/bad.json')).toThrow(/Malformed undo log/);
    readSpy.mockRestore();
  });
});
