import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  buildPlan,
  writeUndoLog,
  writeReport,
  readUndoLog,
  buildInitiativeDescriptionUpdate,
  buildTicketComment,
  ResolvableRow,
  StaleInitiativeUndoRow,
} from '../staleInitiativeResolutionArtifacts';
import { ClassificationResult } from '../staleInitiativeResolutionRules';

function healthyRow(overrides: Partial<ResolvableRow> = {}): ResolvableRow {
  const classification: ClassificationResult = {
    outcome: 'healthy_completed',
    target_initiative_status: 'completed',
    target_ticket_status: 'done',
    agent_name: 'SomeAgent',
    evidence_note: 'Agent SomeAgent healthy: run_count=1000, error_count=5, error_rate=0.50%.',
  };
  return {
    initiative_id: 'init-1',
    title: 'SomeAgent is in error state',
    description: 'Original description text.',
    ticket_id: 'ticket-1',
    ticket_status: 'backlog',
    classification,
    ...overrides,
  };
}

function retiredRow(overrides: Partial<ResolvableRow> = {}): ResolvableRow {
  const classification: ClassificationResult = {
    outcome: 'retired_completed',
    target_initiative_status: 'completed',
    target_ticket_status: 'done',
    agent_name: 'CompanyStrategicCycle',
    evidence_note: "Agent 'CompanyStrategicCycle' was retired.",
  };
  return {
    initiative_id: 'init-2',
    title: 'CompanyStrategicCycle is in error state',
    description: 'Original description.',
    ticket_id: 'ticket-2',
    ticket_status: 'backlog',
    classification,
    ...overrides,
  };
}

function deptAlertRow(overrides: Partial<ResolvableRow> = {}): ResolvableRow {
  const classification: ClassificationResult = {
    outcome: 'dept_alert_cancelled',
    target_initiative_status: 'cancelled',
    target_ticket_status: 'cancelled',
    agent_name: null,
    evidence_note: '24-hour observation window expired, no longer actionable.',
  };
  return {
    initiative_id: 'init-3',
    title: 'Finance department triggered 6 alerts in 24h',
    description: 'Original description.',
    ticket_id: 'ticket-3',
    ticket_status: 'backlog',
    classification,
    ...overrides,
  };
}

function untouchedRow(outcome: 'still_unhealthy' | 'explicitly_excluded' | 'ambiguous_skipped', overrides: Partial<ResolvableRow> = {}): ResolvableRow {
  const classification: ClassificationResult = {
    outcome,
    target_initiative_status: null,
    target_ticket_status: null,
    agent_name: outcome === 'ambiguous_skipped' ? null : 'OpenclawLearningOptimizationAgent',
    evidence_note: `left untouched: ${outcome}`,
  };
  return {
    initiative_id: `init-untouched-${outcome}`,
    title: `Untouched row for ${outcome}`,
    description: 'Original description.',
    ticket_id: 'ticket-untouched',
    ticket_status: 'backlog',
    classification,
    ...overrides,
  };
}

describe('buildPlan', () => {
  it('resolvable rows land in undoLog.rows with correct before/after targets, both tables', () => {
    const { undoLog } = buildPlan([healthyRow(), retiredRow(), deptAlertRow()], 'sess-1');
    expect(undoLog.rows).toHaveLength(3);

    const healthy = undoLog.rows.find((r) => r.initiative_id === 'init-1')!;
    expect(healthy.target_initiative_status).toBe('completed');
    expect(healthy.target_ticket_status).toBe('done');
    expect(healthy.previous_initiative_status).toBe('proposed');
    expect(healthy.previous_ticket_status).toBe('backlog');
    expect(healthy.previous_initiative_description).toBe('Original description text.');

    const dept = undoLog.rows.find((r) => r.initiative_id === 'init-3')!;
    expect(dept.target_initiative_status).toBe('cancelled');
    expect(dept.target_ticket_status).toBe('cancelled');
  });

  it('untouched outcomes never appear in rows[], only in skipped[]', () => {
    const rows = [
      healthyRow(),
      untouchedRow('still_unhealthy'),
      untouchedRow('explicitly_excluded'),
      untouchedRow('ambiguous_skipped'),
    ];
    const { undoLog } = buildPlan(rows, 'sess-2');
    expect(undoLog.rows).toHaveLength(1);
    expect(undoLog.rows[0].initiative_id).toBe('init-1');
    expect(undoLog.skipped).toHaveLength(3);
    expect(undoLog.skipped.map((s) => s.outcome).sort()).toEqual(
      ['ambiguous_skipped', 'explicitly_excluded', 'still_unhealthy'].sort(),
    );
  });

  it('defensively skips a resolvable-classified row that has no ticket_id/ticket_status, rather than writing a partial row', () => {
    const orphan = healthyRow({ initiative_id: 'init-orphan', ticket_id: null, ticket_status: null });
    const { undoLog } = buildPlan([orphan, healthyRow()], 'sess-3');
    expect(undoLog.rows).toHaveLength(1);
    expect(undoLog.rows[0].initiative_id).toBe('init-1');
    const skippedOrphan = undoLog.skipped.find((s) => s.initiative_id === 'init-orphan');
    expect(skippedOrphan).toBeDefined();
    expect(skippedOrphan!.reason).toMatch(/no linked ticket_id/);
  });

  it('empty input produces a valid, non-crashing empty report/undo-log', () => {
    const { undoLog, reportMarkdown } = buildPlan([], 'sess-empty');
    expect(undoLog.rows).toHaveLength(0);
    expect(undoLog.skipped).toHaveLength(0);
    expect(reportMarkdown).toContain('Total candidate rows examined: 0');
    expect(reportMarkdown).toContain('Rows that WOULD be resolved: 0');
  });

  it('report content includes every category count and per-row detail', () => {
    const { reportMarkdown } = buildPlan(
      [healthyRow(), retiredRow(), deptAlertRow(), untouchedRow('still_unhealthy'), untouchedRow('explicitly_excluded'), untouchedRow('ambiguous_skipped')],
      'sess-4',
    );
    expect(reportMarkdown).toContain('healthy_completed | 1');
    expect(reportMarkdown).toContain('retired_completed | 1');
    expect(reportMarkdown).toContain('dept_alert_cancelled | 1');
    expect(reportMarkdown).toContain('still_unhealthy | 1');
    expect(reportMarkdown).toContain('explicitly_excluded | 1');
    expect(reportMarkdown).toContain('ambiguous_skipped | 1');
    expect(reportMarkdown).toContain('init-1');
    expect(reportMarkdown).toContain('init-2');
    expect(reportMarkdown).toContain('init-3');
  });

  it('note-text builders produce evidence text distinguishable per category (no copy-paste bug across categories)', () => {
    const { undoLog } = buildPlan([healthyRow(), retiredRow(), deptAlertRow()], 'sess-5');
    const notes = undoLog.rows.map((r) => r.evidence_note);
    expect(new Set(notes).size).toBe(3); // all three distinct
    expect(notes.find((n) => n.includes('healthy'))).toBeDefined();
    expect(notes.find((n) => n.includes('retired'))).toBeDefined();
    expect(notes.find((n) => n.includes('24-hour observation window'))).toBeDefined();
  });
});

describe('note-text builders (buildInitiativeDescriptionUpdate / buildTicketComment)', () => {
  const sampleRow: StaleInitiativeUndoRow = {
    initiative_id: 'init-1',
    ticket_id: 'ticket-1',
    outcome: 'healthy_completed',
    agent_name: 'SomeAgent',
    previous_initiative_status: 'proposed',
    previous_initiative_description: 'Original finding text.',
    previous_ticket_status: 'backlog',
    target_initiative_status: 'completed',
    target_ticket_status: 'done',
    evidence_note: "Agent 'SomeAgent' healthy: run_count=1000, error_count=5, error_rate=0.50%.",
  };

  it('buildInitiativeDescriptionUpdate appends (does not replace) the prior description, matching the strategicInitiativeConsolidationArtifacts.ts noteForRow() convention', () => {
    const result = buildInitiativeDescriptionUpdate(sampleRow, '2026-08-15');
    expect(result).toContain('Original finding text.');
    expect(result).toContain('[AUTO-RESOLVED 2026-08-15]');
    expect(result).toContain(sampleRow.evidence_note);
    expect(result.indexOf('Original finding text.')).toBeLessThan(result.indexOf('[AUTO-RESOLVED'));
  });

  it('buildInitiativeDescriptionUpdate handles a null previous description without crashing or emitting "null"', () => {
    const result = buildInitiativeDescriptionUpdate({ ...sampleRow, previous_initiative_description: null }, '2026-08-15');
    expect(result).not.toContain('null');
    expect(result).toContain('[AUTO-RESOLVED 2026-08-15]');
  });

  it('buildTicketComment is a fresh string, never prepending the initiative\'s prior description', () => {
    const result = buildTicketComment(sampleRow, '2026-08-15');
    expect(result).not.toContain('Original finding text.');
    expect(result).toContain('[AUTO-RESOLVED 2026-08-15]');
    expect(result).toContain(sampleRow.evidence_note);
  });

  it('the two builders produce genuinely different output for the same row (not the same text twice)', () => {
    const description = buildInitiativeDescriptionUpdate(sampleRow, '2026-08-15');
    const comment = buildTicketComment(sampleRow, '2026-08-15');
    expect(description).not.toBe(comment);
    expect(description.length).toBeGreaterThan(comment.length); // description also carries the prior text
  });
});

describe('undo-log file I/O round trip', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stale-initiative-artifacts-test-'));

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('write then read reproduces identical data', () => {
    const { undoLog, reportMarkdown } = buildPlan([healthyRow(), deptAlertRow()], 'sess-roundtrip');
    const undoLogPath = writeUndoLog(undoLog, tmpDir, 12345);
    const reportPath = writeReport(reportMarkdown, tmpDir, 12345);

    expect(fs.existsSync(undoLogPath)).toBe(true);
    expect(fs.existsSync(reportPath)).toBe(true);

    const reread = readUndoLog(undoLogPath);
    expect(reread).toEqual(undoLog);
  });

  it('readUndoLog rejects a malformed file rather than silently returning partial data', () => {
    const badPath = path.join(tmpDir, 'malformed.json');
    fs.writeFileSync(badPath, JSON.stringify({ generated_at: 'x', session_id: 'y' }), 'utf8');
    expect(() => readUndoLog(badPath)).toThrow(/Malformed undo log/);
  });
});
