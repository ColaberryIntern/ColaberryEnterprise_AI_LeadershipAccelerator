/**
 * checklistGate — Reese Agentic AI Employee mission, Capability 6. Pins the
 * completion/bypass decision logic, modeled on capacityOverride.ts's own
 * shape and test coverage style.
 */
import { evaluateChecklistCompletion, decideChecklistBypass, isChecklistSatisfied } from '../checklistGate';
import { ChecklistItemDefinition } from '../checklistDefinitions';

const DEFS: ChecklistItemDefinition[] = [
  { key: 'a', label: 'A', required: true },
  { key: 'b', label: 'B', required: true },
  { key: 'c', label: 'C', required: false },
];

describe('evaluateChecklistCompletion', () => {
  it('happy path: every item true is complete, with empty incomplete lists', () => {
    const result = evaluateChecklistCompletion({ a: true, b: true, c: true }, DEFS);
    expect(result).toEqual({ complete: true, incompleteItems: [], incompleteRequiredItems: [] });
  });

  it('a false required item is incomplete', () => {
    const result = evaluateChecklistCompletion({ a: true, b: false, c: true }, DEFS);
    expect(result.complete).toBe(false);
    expect(result.incompleteRequiredItems).toEqual(['b']);
    expect(result.incompleteItems).toEqual(['b']);
  });

  it('a false NON-required item never blocks complete, but still shows in incompleteItems for honest display', () => {
    const result = evaluateChecklistCompletion({ a: true, b: true, c: false }, DEFS);
    expect(result.complete).toBe(true);
    expect(result.incompleteRequiredItems).toEqual([]);
    expect(result.incompleteItems).toEqual(['c']);
  });

  it('boundary: an item key missing from the record is treated as false (falsy), not skipped', () => {
    const result = evaluateChecklistCompletion({ a: true }, DEFS);
    expect(result.complete).toBe(false);
    expect(result.incompleteRequiredItems).toEqual(['b']);
    expect(result.incompleteItems).toEqual(['b', 'c']);
  });
});

describe('decideChecklistBypass', () => {
  const now = new Date('2026-09-07T00:00:00Z');

  it('happy path: a named actor with a real, evaluable reason is granted with auditRequired true', () => {
    const decision = decideChecklistBypass({
      authorizedByEmail: 'ali@colaberry.com',
      reason: 'Identity confirmed manually via a direct call with the student.',
      now,
    });
    expect(decision).toEqual({
      granted: true,
      reason: 'Identity confirmed manually via a direct call with the student.',
      authorizedByEmail: 'ali@colaberry.com',
      bypassedAt: now,
      auditRequired: true,
    });
  });

  it('refuses a missing authorizer', () => {
    const decision = decideChecklistBypass({ authorizedByEmail: '', reason: 'A real, sufficiently long reason here.', now });
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.refusals.map((r) => r.rule)).toContain('authorizer_unknown');
  });

  it('refuses a reason shorter than the minimum quality bar', () => {
    const decision = decideChecklistBypass({ authorizedByEmail: 'ali@colaberry.com', reason: 'too short', now });
    expect(decision.granted).toBe(false);
    if (!decision.granted) expect(decision.refusals.map((r) => r.rule)).toContain('reason_insufficient');
  });

  it('refuses a whitespace-only reason, not just an empty one', () => {
    const decision = decideChecklistBypass({ authorizedByEmail: 'ali@colaberry.com', reason: '                         ', now });
    expect(decision.granted).toBe(false);
  });

  it('boundary: refuses both missing actor AND insufficient reason at once, reporting both rules', () => {
    const decision = decideChecklistBypass({ authorizedByEmail: '', reason: '', now });
    expect(decision.granted).toBe(false);
    if (!decision.granted) {
      expect(decision.refusals.map((r) => r.rule)).toEqual(
        expect.arrayContaining(['authorizer_unknown', 'reason_insufficient']),
      );
    }
  });

  it('trims the reason before storing it', () => {
    const decision = decideChecklistBypass({
      authorizedByEmail: 'ali@colaberry.com',
      reason: '   Identity confirmed manually via a direct call.   ',
      now,
    });
    expect(decision.granted).toBe(true);
    if (decision.granted) expect(decision.reason).toBe('Identity confirmed manually via a direct call.');
  });
});

describe('isChecklistSatisfied', () => {
  it('a genuinely complete checklist is satisfied even with no bypass', () => {
    expect(isChecklistSatisfied({ complete: true, bypassedAt: null })).toBe(true);
  });

  it('an incomplete checklist with a real bypass is satisfied', () => {
    expect(isChecklistSatisfied({ complete: false, bypassedAt: new Date() })).toBe(true);
  });

  it('an incomplete checklist with no bypass is NOT satisfied', () => {
    expect(isChecklistSatisfied({ complete: false, bypassedAt: null })).toBe(false);
  });
});
