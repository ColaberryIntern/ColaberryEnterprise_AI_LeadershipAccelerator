/**
 * Pure-logic tests for the strategic_initiatives historical-duplicate grouping used
 * by consolidateDuplicateStrategicInitiatives.ts. No DB/Sequelize involved.
 */
import {
  groupByNormalizedTitle,
  duplicateGroups,
  pickSurvivor,
  buildConsolidationNote,
  type InitiativeLike,
} from '../strategicInitiativeDedupGroups';

function row(id: string, title: string, created_at: string, overrides: Partial<InitiativeLike> = {}): InitiativeLike {
  return { id, title, description: `desc for ${id}`, status: 'proposed', created_at, ...overrides };
}

describe('groupByNormalizedTitle', () => {
  it('collapses same-normalized-key rows into one group regardless of embedded number', () => {
    const rows = [
      row('a', 'CampaignQAAgent is slow (120.3s avg)', '2026-05-07T00:00:00Z'),
      row('b', 'CampaignQAAgent is slow (139.9s avg)', '2026-08-07T00:00:00Z'),
      row('c', 'CampaignQAAgent is slow (125.0s avg)', '2026-06-01T00:00:00Z'),
    ];

    const groups = groupByNormalizedTitle(rows);

    expect(groups.size).toBe(1);
    expect([...groups.values()][0]).toHaveLength(3);
  });

  it('keeps genuinely different titles in separate groups', () => {
    const rows = [
      row('a', 'CampaignQAAgent is slow (120.3s avg)', '2026-05-07T00:00:00Z'),
      row('b', 'OtherAgent is slow (50.0s avg)', '2026-05-08T00:00:00Z'),
      row('c', 'AgentBehaviorMonitorAgent is in error state', '2026-04-07T00:00:00Z'),
    ];

    const groups = groupByNormalizedTitle(rows);

    expect(groups.size).toBe(3);
  });
});

describe('duplicateGroups', () => {
  it('excludes single-row groups — the 58 genuinely-distinct findings stay untouched', () => {
    const rows = [
      row('a', 'CampaignQAAgent is slow (120.3s avg)', '2026-05-07T00:00:00Z'),
      row('b', 'CampaignQAAgent is slow (139.9s avg)', '2026-08-07T00:00:00Z'),
      row('single-1', 'GovernanceStrategyArchitect is in error state', '2026-04-16T00:00:00Z'),
    ];

    const dupes = duplicateGroups(rows);

    expect(dupes.size).toBe(1);
    const [members] = [...dupes.values()];
    expect(members.map((m) => m.id).sort()).toEqual(['a', 'b']);
  });

  it('a full field of all-singles produces zero duplicate groups', () => {
    const rows = [
      row('s1', 'AgentX is in error state', '2026-04-01T00:00:00Z'),
      row('s2', 'AgentY is in error state', '2026-04-02T00:00:00Z'),
    ];

    expect(duplicateGroups(rows).size).toBe(0);
  });

  it('reproduces the real production breakdown shape: 201-row and 54-row clusters both detected independently', () => {
    const slowRows = Array.from({ length: 201 }, (_, i) =>
      row(`slow-${i}`, `CampaignQAAgent is slow (${(120 + i * 0.1).toFixed(1)}s avg)`, `2026-05-07T${String(i % 24).padStart(2, '0')}:00:00Z`),
    );
    const errorRateRows = Array.from({ length: 54 }, (_, i) =>
      row(`err-${i}`, `OpenclawLearningOptimizationAgent has ${30 + i}% error rate`, `2026-04-16T${String(i % 24).padStart(2, '0')}:00:00Z`),
    );

    const dupes = duplicateGroups([...slowRows, ...errorRateRows]);

    expect(dupes.size).toBe(2);
    const sizes = [...dupes.values()].map((g) => g.length).sort((a, b) => a - b);
    expect(sizes).toEqual([54, 201]);
  });
});

describe('pickSurvivor', () => {
  it('picks the most recently created row', () => {
    const rows = [
      row('old', 'X is slow (1.0s avg)', '2026-05-01T00:00:00Z'),
      row('newest', 'X is slow (2.0s avg)', '2026-08-07T00:00:00Z'),
      row('mid', 'X is slow (1.5s avg)', '2026-06-15T00:00:00Z'),
    ];

    expect(pickSurvivor(rows).id).toBe('newest');
  });

  it('is order-independent — same result regardless of input array order', () => {
    const a = row('old', 'X', '2026-05-01T00:00:00Z');
    const b = row('newest', 'X', '2026-08-07T00:00:00Z');

    expect(pickSurvivor([a, b]).id).toBe('newest');
    expect(pickSurvivor([b, a]).id).toBe('newest');
  });
});

describe('buildConsolidationNote', () => {
  it('includes the survivor id, survivor created date, consolidated date, and session id', () => {
    const note = buildConsolidationNote({
      survivorId: 'survivor-123',
      survivorCreatedAt: '2026-08-07T17:20:00.837Z',
      consolidatedAt: '2026-08-15',
      sessionId: 'CC-20260815-7wtc',
    });

    expect(note).toContain('survivor-123');
    expect(note).toContain('2026-08-07');
    expect(note).toContain('2026-08-15');
    expect(note).toContain('CC-20260815-7wtc');
    expect(note).toContain("linked ticket was NOT modified");
    expect(note.startsWith('\n\n---\n')).toBe(true); // appended, not prepended over original description
  });
});
