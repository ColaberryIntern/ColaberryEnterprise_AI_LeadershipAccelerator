/**
 * Direct coverage for buildPlan() — the function backend/src/scripts/
 * consolidateDuplicateStrategicInitiatives.ts's --plan mode calls to turn live
 * candidates into the undo log + dry-run report. Flagged during T003's task
 * verification as the most operationally load-bearing function in this run with no
 * dedicated test (only exercised indirectly through the CLI test's fixed fixtures) —
 * this closes that gap before the production `--plan` step (T006) ever runs against
 * live data. Pure logic, no DB/Sequelize mocking needed.
 */
import { buildPlan, readUndoLog, writeUndoLog, writeReport } from '../strategicInitiativeConsolidationArtifacts';
import type { InitiativeLike } from '../strategicInitiativeDedupGroups';
import fs from 'fs';
import os from 'os';
import path from 'path';

function row(id: string, title: string, created_at: string, description = `desc-${id}`): InitiativeLike {
  return { id, title, description, status: 'proposed', created_at };
}

describe('buildPlan', () => {
  it('excludes survivors from rows[], includes only non-survivor rows, and records correct group metadata', () => {
    const candidates: InitiativeLike[] = [
      row('slow-1', 'CampaignQAAgent is slow (120.3s avg)', '2026-05-07T00:20:01.000Z'),
      row('slow-2', 'CampaignQAAgent is slow (125.0s avg)', '2026-06-01T00:20:01.000Z'),
      row('slow-3-newest', 'CampaignQAAgent is slow (130.9s avg)', '2026-08-07T17:20:00.837Z'),
      row('single-1', 'GovernanceStrategyArchitect is in error state', '2026-04-16T12:20:01.487Z'),
    ];

    const { undoLog } = buildPlan(candidates, 'CC-20260815-test');

    // Only 1 duplicate group (the 2 CampaignQAAgent-slow non-survivors); the single is
    // absent entirely — it must never appear in groups{} or rows[].
    expect(Object.keys(undoLog.groups)).toEqual(['CampaignQAAgent is slow (Ns avg)']);
    expect(undoLog.rows.map((r) => r.initiative_id).sort()).toEqual(['slow-1', 'slow-2']);
    expect(undoLog.rows.some((r) => r.initiative_id === 'slow-3-newest')).toBe(false);
    expect(undoLog.rows.some((r) => r.initiative_id === 'single-1')).toBe(false);

    const group = undoLog.groups['CampaignQAAgent is slow (Ns avg)'];
    expect(group.survivor_id).toBe('slow-3-newest');
    expect(group.group_count).toBe(3); // full cluster size, survivor included
    expect(group.earliest_seen_at).toBe('2026-05-07T00:20:01.000Z');
    expect(group.latest_seen_at).toBe('2026-08-07T17:20:00.837Z');
  });

  it('preserves each cancelled row\'s previous_status and previous_description verbatim (needed for a faithful revert)', () => {
    const candidates: InitiativeLike[] = [
      row('a', 'X is slow (1.0s avg)', '2026-05-01T00:00:00Z', 'Original description A'),
      row('b', 'X is slow (2.0s avg)', '2026-08-01T00:00:00Z', 'Original description B (survivor)'),
    ];

    const { undoLog } = buildPlan(candidates, 'CC-20260815-test');

    expect(undoLog.rows).toEqual([
      { initiative_id: 'a', group_key: 'X is slow (Ns avg)', previous_status: 'proposed', previous_description: 'Original description A' },
    ]);
  });

  it('reproduces the real production scale: 201 + 54 row clusters both correctly split into survivor + non-survivors', () => {
    const slowRows = Array.from({ length: 201 }, (_, i) =>
      row(`slow-${i}`, `CampaignQAAgent is slow (${(120 + i * 0.1).toFixed(1)}s avg)`, new Date(2026, 4, 7, i).toISOString()),
    );
    const errRows = Array.from({ length: 54 }, (_, i) =>
      row(`err-${i}`, `OpenclawLearningOptimizationAgent has ${30 + i}% error rate`, new Date(2026, 3, 16, i).toISOString()),
    );

    const { undoLog } = buildPlan([...slowRows, ...errRows], 'CC-20260815-test');

    expect(Object.keys(undoLog.groups).length).toBe(2);
    expect(undoLog.rows.length).toBe(200 + 53); // 282 total minus the department-alert groups this fixture omits
    const slowGroup = undoLog.groups['CampaignQAAgent is slow (Ns avg)'];
    const errGroup = undoLog.groups['OpenclawLearningOptimizationAgent has N% error rate'];
    expect(slowGroup.group_count).toBe(201);
    expect(errGroup.group_count).toBe(54);
    // Highest-index row (i=200 / i=53) has the latest synthetic timestamp -> survivor.
    expect(slowGroup.survivor_id).toBe('slow-200');
    expect(errGroup.survivor_id).toBe('err-53');
  });

  it('an all-singles candidate set produces an empty undo log and a report saying so', () => {
    const candidates: InitiativeLike[] = [
      row('s1', 'AgentX is in error state', '2026-04-01T00:00:00Z'),
      row('s2', 'AgentY is in error state', '2026-04-02T00:00:00Z'),
    ];

    const { undoLog, reportMarkdown } = buildPlan(candidates, 'CC-20260815-test');

    expect(undoLog.rows).toEqual([]);
    expect(Object.keys(undoLog.groups)).toEqual([]);
    expect(reportMarkdown).toContain('Total rows that WOULD be marked cancelled: 0');
    expect(reportMarkdown).toContain('Duplicate groups: 0');
  });

  it('the dry-run report markdown names the survivor and every non-survivor row with its role', () => {
    const candidates: InitiativeLike[] = [
      row('old', 'X is slow (1.0s avg)', '2026-05-01T00:00:00Z'),
      row('newest', 'X is slow (2.0s avg)', '2026-08-07T00:00:00Z'),
    ];

    const { reportMarkdown } = buildPlan(candidates, 'CC-20260815-test');

    expect(reportMarkdown).toContain('Total rows that WOULD be marked cancelled: 1');
    expect(reportMarkdown).toContain('Duplicate groups: 1');
    expect(reportMarkdown).toContain('**newest**'); // survivor called out
    expect(reportMarkdown).toContain('| old |');
    expect(reportMarkdown).toContain('cancelled');
    expect(reportMarkdown).toContain('Ticket rows are never read or written by this script');
  });
});

describe('writeUndoLog / writeReport / readUndoLog — round-trip through real disk I/O', () => {
  it('writes both files and reads the undo log back byte-for-byte equivalent', () => {
    const candidates: InitiativeLike[] = [
      row('a', 'X is slow (1.0s avg)', '2026-05-01T00:00:00Z'),
      row('b', 'X is slow (2.0s avg)', '2026-08-01T00:00:00Z'),
    ];
    const { undoLog, reportMarkdown } = buildPlan(candidates, 'CC-20260815-roundtrip');
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'consolidation-plan-test-'));

    const undoLogPath = writeUndoLog(undoLog, outDir, 12345);
    const reportPath = writeReport(reportMarkdown, outDir, 12345);

    expect(fs.existsSync(undoLogPath)).toBe(true);
    expect(fs.existsSync(reportPath)).toBe(true);
    const readBack = readUndoLog(undoLogPath);
    expect(readBack).toEqual(undoLog);

    fs.rmSync(outDir, { recursive: true, force: true });
  });

  it('readUndoLog throws on a malformed file (missing rows[])', () => {
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'consolidation-plan-test-'));
    const badPath = path.join(outDir, 'bad.json');
    fs.writeFileSync(badPath, JSON.stringify({ generated_at: 'x' }), 'utf8');

    expect(() => readUndoLog(badPath)).toThrow(/Malformed undo log/);

    fs.rmSync(outDir, { recursive: true, force: true });
  });
});
