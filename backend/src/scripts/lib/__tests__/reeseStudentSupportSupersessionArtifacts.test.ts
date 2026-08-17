import fs from 'fs';
import { buildPlan, writeUndoLog, writeReport, readUndoLog } from '../reeseStudentSupportSupersessionArtifacts';
import type { StudentSupportSupersessionCandidate } from '../../../intelligence/autonomy/reeseStudentSupportSupersessionResolver';

function candidate(overrides: Partial<StudentSupportSupersessionCandidate>): StudentSupportSupersessionCandidate {
  return {
    ticket_id: 't-1',
    entity_id: 'room-1',
    outcome: 'superseded',
    should_close: true,
    superseded_by_ticket_id: 'newer-ticket',
    evidence_note: 'evidence text',
    ...overrides,
  };
}

describe('buildPlan', () => {
  it('includes should_close:true results only in the undo-log rows, carrying previous_status from the supplied map', () => {
    const results = [
      candidate({ ticket_id: 'closes-1', should_close: true, outcome: 'superseded' }),
      candidate({ ticket_id: 'stays-open-1', should_close: false, outcome: 'current', superseded_by_ticket_id: null }),
    ];
    const statusByTicketId = new Map([['closes-1', 'backlog'], ['stays-open-1', 'backlog']]);

    const { undoLog } = buildPlan(results, statusByTicketId, 'CC-test-0001');

    expect(undoLog.rows).toHaveLength(1);
    expect(undoLog.rows[0]).toMatchObject({ ticket_id: 'closes-1', previous_status: 'backlog', outcome: 'superseded' });
    expect(undoLog.session_id).toBe('CC-test-0001');
  });

  it('breakdown covers EVERY checked ticket (not just would-close ones), per outcome', () => {
    const results = [
      candidate({ ticket_id: 's1', outcome: 'superseded', should_close: true }),
      candidate({ ticket_id: 'c1', outcome: 'current', should_close: false, superseded_by_ticket_id: null }),
      candidate({ ticket_id: 'o1', outcome: 'sole_ticket', should_close: false, superseded_by_ticket_id: null }),
      candidate({ ticket_id: 't1', outcome: 'already_terminal', should_close: false, superseded_by_ticket_id: null }),
    ];
    const statusByTicketId = new Map(results.map((r) => [r.ticket_id, 'backlog']));

    const { undoLog } = buildPlan(results, statusByTicketId, 'sess');

    expect(undoLog.breakdown.superseded).toEqual({ checked: 1, would_close: 1 });
    expect(undoLog.breakdown.current).toEqual({ checked: 1, would_close: 0 });
    expect(undoLog.breakdown.sole_ticket).toEqual({ checked: 1, would_close: 0 });
    expect(undoLog.breakdown.already_terminal).toEqual({ checked: 1, would_close: 0 });
  });

  it('report markdown is grouped by outcome, names the superseding ticket, and states nothing has been written', () => {
    const results = [candidate({ ticket_id: 'c1', outcome: 'superseded', superseded_by_ticket_id: 'the-newer-one' })];
    const { reportMarkdown } = buildPlan(results, new Map([['c1', 'backlog']]), 'sess');

    expect(reportMarkdown).toContain('## superseded');
    expect(reportMarkdown).toContain('the-newer-one');
    expect(reportMarkdown).toContain('No writes have occurred');
  });

  it('defaults previous_status to "backlog" when the caller\'s status map is missing an entry (defensive, never throws)', () => {
    const results = [candidate({ ticket_id: 'no-status-known' })];
    const { undoLog } = buildPlan(results, new Map(), 'sess');
    expect(undoLog.rows[0].previous_status).toBe('backlog');
  });
});

describe('writeUndoLog / writeReport / readUndoLog', () => {
  it('writeUndoLog writes valid JSON that readUndoLog can read back byte-faithfully', () => {
    const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    const readSpy = jest.spyOn(fs, 'readFileSync');

    const results = [candidate({ ticket_id: 'c1' })];
    const { undoLog } = buildPlan(results, new Map([['c1', 'backlog']]), 'sess');
    const path = writeUndoLog(undoLog, '/tmp', 12345);

    expect(path).toContain('reese-student-support-supersession-undo-log-12345.json');
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
    expect(path).toContain('reese-student-support-supersession-dry-run-999.md');
    expect(writeSpy).toHaveBeenCalledWith(path, '# hello', 'utf8');
    writeSpy.mockRestore();
  });

  it('readUndoLog throws on a malformed file (missing rows[] or breakdown{})', () => {
    const readSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => JSON.stringify({ generated_at: 'x' }));
    expect(() => readUndoLog('/tmp/bad.json')).toThrow(/Malformed undo log/);
    readSpy.mockRestore();
  });
});
