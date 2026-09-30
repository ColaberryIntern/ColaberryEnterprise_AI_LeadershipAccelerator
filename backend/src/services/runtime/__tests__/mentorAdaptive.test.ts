/**
 * mentorAdaptive — unit tests for the pure adaptive-register logic. Hermetic.
 */
import { adaptiveInstruction } from '../mentorAdaptive';

describe('adaptiveInstruction', () => {
  it('scaffolds for an early learner (low maturity or low proficiency)', () => {
    expect(adaptiveInstruction({ aiMaturity: 1, proficiencyPct: 20, struggling: false })).toMatch(/early in their AI journey/);
    expect(adaptiveInstruction({ aiMaturity: null, proficiencyPct: 30, struggling: false })).toMatch(/keep it simple/);
  });

  it('challenges an advanced learner (high maturity AND high/unknown proficiency)', () => {
    expect(adaptiveInstruction({ aiMaturity: 5, proficiencyPct: 80, struggling: false })).toMatch(/go a level deeper/);
    expect(adaptiveInstruction({ aiMaturity: 4, proficiencyPct: null, struggling: false })).toMatch(/challenge them/);
  });

  it('stays neutral for a mid-level, non-struggling learner', () => {
    expect(adaptiveInstruction({ aiMaturity: 3, proficiencyPct: 55, struggling: false })).toBe('');
  });

  it('adds proactive support when struggling, at any level', () => {
    const mid = adaptiveInstruction({ aiMaturity: 3, proficiencyPct: 55, struggling: true });
    expect(mid).toMatch(/may be stuck/);
    expect(mid).toMatch(/walk through it together/);
  });

  it('combines register + struggle for an early, stuck learner', () => {
    const out = adaptiveInstruction({ aiMaturity: 2, proficiencyPct: 25, struggling: true });
    expect(out).toMatch(/early in their AI journey/);
    expect(out).toMatch(/may be stuck/);
  });

  it('advanced beats early when maturity is high but proficiency is borderline', () => {
    // maturity 4 + prof 70 → advanced (>=65), not early
    expect(adaptiveInstruction({ aiMaturity: 4, proficiencyPct: 70, struggling: false })).toMatch(/go a level deeper/);
  });

  it('unknown signals + not struggling → empty', () => {
    expect(adaptiveInstruction({ aiMaturity: null, proficiencyPct: null, struggling: false })).toBe('');
  });
});
