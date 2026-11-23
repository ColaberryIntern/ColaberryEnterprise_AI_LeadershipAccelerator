import {
  emptySectionsLabel,
  selectionAfterCollapse,
  splitOutline,
  type OutlineSection,
} from '../outlineSections';

/**
 * AF12.19. The fixture is the real shape of an agent-domain board, because the shape IS the bug:
 * thirteen sections, one of which can hold anything. Measured on the ten published v3 plans on
 * 2026-11-22, all 598 stories sit on `autonomy:R0`.
 */
const section = (id: string, name: string, tasks: number): OutlineSection =>
  ({ id, name, tasks: Array.from({ length: tasks }, (_, i) => ({ i })) });

/** Ten rungs plus the three superseded releases, as `agentDomainReleaseLadder.ts` creates them. */
const agentDomainBoard = (): OutlineSection[] => [
  section('autonomy:R0', 'R0 · Define the workflow, requirements, risks and human decisions (every capability starts here)', 79),
  ...Array.from({ length: 9 }, (_, i) => section(`autonomy:R${i + 1}`, `R${i + 1} · a rung nobody is on yet`, 0)),
  section('r0', 'Discovery and validation (superseded by the ladder)', 0),
  section('r1', 'Legacy migration plan (superseded by the ladder)', 0),
  section('r2', 'Capability development (superseded by the ladder)', 0),
];

describe('splitOutline', () => {
  it("keeps the one section that holds work and sets aside the twelve that cannot", () => {
    const { filled, empty } = splitOutline(agentDomainBoard());
    expect(filled.map((l) => l.id)).toEqual(['autonomy:R0']);
    expect(empty).toHaveLength(12);
    // The nine rungs above R0 and the three superseded releases, and nothing else.
    expect(empty.map((l) => l.id)).toEqual([
      'autonomy:R1', 'autonomy:R2', 'autonomy:R3', 'autonomy:R4', 'autonomy:R5',
      'autonomy:R6', 'autonomy:R7', 'autonomy:R8', 'autonomy:R9', 'r0', 'r1', 'r2',
    ]);
  });

  it('accounts for every section exactly once, so nothing is dropped on the floor', () => {
    const lists = agentDomainBoard();
    const { filled, empty } = splitOutline(lists);
    expect(filled.length + empty.length).toBe(lists.length);
    expect([...filled, ...empty].map((l) => l.id).sort()).toEqual(lists.map((l) => l.id).sort());
  });

  it('preserves the original order within each group', () => {
    const { filled, empty } = splitOutline([
      section('a', 'A', 1), section('b', 'B', 0), section('c', 'C', 2), section('d', 'D', 0),
    ]);
    expect(filled.map((l) => l.id)).toEqual(['a', 'c']);
    expect(empty.map((l) => l.id)).toEqual(['b', 'd']);
  });

  it('leaves an ordinary build untouched: every section has work, so nothing is hidden', () => {
    // A client build (Alveara Dental, read from production) uses r0..r4 and fills all five.
    const lists = [
      section('r0', 'R0', 4), section('r1', 'R1', 4), section('r2', 'R2', 3),
      section('r3', 'R3', 4), section('r4', 'R4', 5),
    ];
    const { filled, empty } = splitOutline(lists);
    expect(filled).toHaveLength(5);
    expect(empty).toEqual([]);
  });

  it('handles a board with no sections at all', () => {
    expect(splitOutline([])).toEqual({ filled: [], empty: [] });
  });

  it('counts a section by its tasks, not by its name', () => {
    // A rung named R4 that somehow holds work is shown; the name is never consulted.
    const { filled } = splitOutline([section('autonomy:R4', 'R4 · promoted', 2)]);
    expect(filled.map((l) => l.id)).toEqual(['autonomy:R4']);
  });
});

describe('emptySectionsLabel', () => {
  it('says what the control will do, and counts what it is hiding', () => {
    expect(emptySectionsLabel(12, false)).toBe('Show 12 empty sections');
    expect(emptySectionsLabel(12, true)).toBe('Hide 12 empty sections');
  });

  it('is singular for one', () => {
    expect(emptySectionsLabel(1, false)).toBe('Show 1 empty section');
  });

  it('says "empty" rather than "not started", because three of them never will be', () => {
    // The superseded releases are the rollback path and are documented as holding nothing, so a
    // word implying "yet" would be false for a quarter of them.
    expect(emptySectionsLabel(12, false)).not.toContain('yet');
    expect(emptySectionsLabel(12, false)).not.toContain('not started');
  });
});

describe('selectionAfterCollapse', () => {
  it('releases a selection that is about to be hidden, so the feed is never filtered to nothing', () => {
    const { empty } = splitOutline(agentDomainBoard());
    expect(selectionAfterCollapse('autonomy:R4', empty)).toBe('all');
  });

  it('leaves a selection that stays visible alone', () => {
    const { empty } = splitOutline(agentDomainBoard());
    expect(selectionAfterCollapse('autonomy:R0', empty)).toBe('autonomy:R0');
    expect(selectionAfterCollapse('all', empty)).toBe('all');
  });
});
