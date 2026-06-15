/**
 * Tests for assessmentChanged — the dedup gate that bounds ops_ai_assessments
 * growth (the unconditional audit insert filled the prod disk on 2026-06-15).
 *
 * Coverage:
 *   - never-scored todo (null prev) always counts as changed
 *   - identical score + category => unchanged (no audit row)
 *   - score change => changed
 *   - category change => changed
 *   - pg driver string score normalizes numerically
 *   - non-numeric / malformed prev score => treated as changed (fail-safe)
 */
import { assessmentChanged } from '../priorityEngineService';

describe('assessmentChanged', () => {
  it('treats a never-scored todo (null prev) as changed', () => {
    expect(assessmentChanged(null, null, 50, 'human_required')).toBe(true);
    expect(assessmentChanged(null, 'unscored', 50, 'human_required')).toBe(true);
    expect(assessmentChanged(40, null, 50, 'human_required')).toBe(true);
  });

  it('returns false when score and category are identical', () => {
    expect(assessmentChanged(50, 'human_required', 50, 'human_required')).toBe(false);
    expect(assessmentChanged(0, 'unscored', 0, 'unscored')).toBe(false);
  });

  it('returns true when the score changed', () => {
    expect(assessmentChanged(50, 'human_required', 51, 'human_required')).toBe(true);
  });

  it('returns true when the category changed', () => {
    expect(assessmentChanged(50, 'unscored', 50, 'human_required')).toBe(true);
  });

  it('normalizes a string prev score from the pg driver', () => {
    expect(assessmentChanged('50', 'human_required', 50, 'human_required')).toBe(false);
    expect(assessmentChanged('50', 'human_required', 51, 'human_required')).toBe(true);
  });

  it('treats a non-numeric prev score as changed (fail-safe)', () => {
    expect(assessmentChanged('abc', 'unscored', 50, 'unscored')).toBe(true);
    expect(assessmentChanged(NaN, 'unscored', 50, 'unscored')).toBe(true);
  });
});
