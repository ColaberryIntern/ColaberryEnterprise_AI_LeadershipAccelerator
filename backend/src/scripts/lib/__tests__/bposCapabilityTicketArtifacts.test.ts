import fs from 'fs';
import { buildPlan, writeUndoLog, writeReport, readUndoLog } from '../bposCapabilityTicketArtifacts';
import type { BposCapabilityTicketCandidate } from '../../../services/company/bposCapabilityTicketAutoResolver';

function candidate(overrides: Partial<BposCapabilityTicketCandidate>): BposCapabilityTicketCandidate {
  return {
    ticket_id: 't-1',
    entity_id: 'cap-1',
    capability_name: 'Some Capability',
    outcome: 'capability_verified',
    should_close: true,
    close_to_status: 'done',
    evidence_note: 'evidence text',
    ...overrides,
  };
}

describe('buildPlan', () => {
  it('includes should_close:true results only in the undo-log rows, carrying previous_status and close_to_status', () => {
    const results = [
      candidate({ ticket_id: 'closes-1', should_close: true, close_to_status: 'done', outcome: 'capability_verified' }),
      candidate({ ticket_id: 'stays-open-1', should_close: false, close_to_status: null, outcome: 'no_signal' }),
    ];
    const statusByTicketId = new Map([['closes-1', 'in_progress'], ['stays-open-1', 'in_progress']]);

    const { undoLog } = buildPlan(results, statusByTicketId, 'CC-test-0001');

    expect(undoLog.rows).toHaveLength(1);
    expect(undoLog.rows[0]).toMatchObject({
      ticket_id: 'closes-1',
      previous_status: 'in_progress',
      close_to_status: 'done',
      outcome: 'capability_verified',
    });
    expect(undoLog.session_id).toBe('CC-test-0001');
  });

  it('carries close_to_status:"cancelled" for a capability_deleted row (two distinct close targets, not always done)', () => {
    const results = [
      candidate({ ticket_id: 'cancel-1', should_close: true, close_to_status: 'cancelled', outcome: 'capability_deleted' }),
    ];
    const statusByTicketId = new Map([['cancel-1', 'in_progress']]);

    const { undoLog } = buildPlan(results, statusByTicketId, 'sess');

    expect(undoLog.rows[0].close_to_status).toBe('cancelled');
  });

  it('breakdown covers EVERY checked ticket (not just would-close ones), per outcome', () => {
    const results = [
      candidate({ ticket_id: 'v1', outcome: 'capability_verified', should_close: true, close_to_status: 'done' }),
      candidate({ ticket_id: 'd1', outcome: 'capability_deleted', should_close: true, close_to_status: 'cancelled' }),
      candidate({ ticket_id: 'n1', outcome: 'no_signal', should_close: false, close_to_status: null }),
      candidate({ ticket_id: 't1', outcome: 'already_terminal', should_close: false, close_to_status: null }),
    ];
    const statusByTicketId = new Map(results.map((r) => [r.ticket_id, 'in_progress']));

    const { undoLog } = buildPlan(results, statusByTicketId, 'sess');

    expect(undoLog.breakdown.capability_verified).toEqual({ checked: 1, would_close: 1 });
    expect(undoLog.breakdown.capability_deleted).toEqual({ checked: 1, would_close: 1 });
    expect(undoLog.breakdown.no_signal).toEqual({ checked: 1, would_close: 0 });
    expect(undoLog.breakdown.already_terminal).toEqual({ checked: 1, would_close: 0 });
  });

  it('report markdown is grouped by outcome, names the capability, and states nothing has been written', () => {
    const results = [candidate({ ticket_id: 'c1', outcome: 'capability_verified', capability_name: 'Agents Page' })];
    const { reportMarkdown } = buildPlan(results, new Map([['c1', 'in_progress']]), 'sess');

    expect(reportMarkdown).toContain('## capability_verified');
    expect(reportMarkdown).toContain('Agents Page');
    expect(reportMarkdown).toContain('No writes have occurred');
  });

  it('defaults previous_status to "in_progress" when the caller\'s status map is missing an entry (defensive, never throws)', () => {
    const results = [candidate({ ticket_id: 'no-status-known' })];
    const { undoLog } = buildPlan(results, new Map(), 'sess');
    expect(undoLog.rows[0].previous_status).toBe('in_progress');
  });
});

describe('writeUndoLog / writeReport / readUndoLog', () => {
  it('writeUndoLog writes valid JSON that readUndoLog can read back byte-faithfully', () => {
    const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    const readSpy = jest.spyOn(fs, 'readFileSync');

    const results = [candidate({ ticket_id: 'c1' })];
    const { undoLog } = buildPlan(results, new Map([['c1', 'in_progress']]), 'sess');
    const path = writeUndoLog(undoLog, '/tmp', 12345);

    expect(path).toContain('bpos-capability-ticket-undo-log-12345.json');
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
    expect(path).toContain('bpos-capability-ticket-dry-run-999.md');
    expect(writeSpy).toHaveBeenCalledWith(path, '# hello', 'utf8');
    writeSpy.mockRestore();
  });

  it('readUndoLog throws on a malformed file (missing rows[] or breakdown{})', () => {
    const readSpy = jest.spyOn(fs, 'readFileSync').mockImplementation(() => JSON.stringify({ generated_at: 'x' }));
    expect(() => readUndoLog('/tmp/bad.json')).toThrow(/Malformed undo log/);
    readSpy.mockRestore();
  });
});
