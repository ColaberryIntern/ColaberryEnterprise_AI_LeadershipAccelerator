/**
 * `EvidenceState` must carry `'unassessed'` — the honest "we don't know yet" value the Phase 6
 * migration stores for legacy work whose evidence has not been established (distinct from `missing`,
 * which is assessed-and-absent, and `planned`, which is intended-but-not-done). The union (the type)
 * and `EVIDENCE_STATES` (its runtime list) must stay in lockstep.
 */
import { EVIDENCE_STATES, EvidenceState } from '../factoryContract';

describe('EvidenceState / EVIDENCE_STATES', () => {
  it("includes 'unassessed' as a first-class evidence value", () => {
    expect(EVIDENCE_STATES).toContain('unassessed');
    // Compile-time: 'unassessed' is a valid member of the union.
    const value: EvidenceState = 'unassessed';
    expect(value).toBe('unassessed');
  });

  it('union and constant are in lockstep (every union member is listed exactly once)', () => {
    // This Record makes forgetting a union member a COMPILE error, so the test must be updated in
    // lockstep with the union — that is what keeps the runtime constant honest against the type.
    const everyMember: Record<EvidenceState, true> = {
      demonstrated: true,
      tested: true,
      planned: true,
      assumption: true,
      missing: true,
      unassessed: true,
    };
    expect([...EVIDENCE_STATES].sort()).toEqual(Object.keys(everyMember).sort());
    expect(new Set(EVIDENCE_STATES).size).toBe(EVIDENCE_STATES.length); // no duplicates
  });
});
