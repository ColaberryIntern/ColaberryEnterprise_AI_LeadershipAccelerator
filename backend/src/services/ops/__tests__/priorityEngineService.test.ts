/**
 * Tests for scoreChanged — the urgency_score-only dedup gate that bounds
 * ops_ai_assessments growth (the unconditional audit insert filled the prod disk
 * on 2026-06-15). Category is intentionally NOT part of the dedup because
 * automationRulesService overwrites it every cron cycle; see scoreChanged docs.
 *
 * Coverage:
 *   - never-scored todo (null prev) always counts as changed
 *   - identical score => unchanged (no audit row), regardless of category churn
 *   - score change => changed
 *   - pg driver string score normalizes numerically
 *   - non-numeric / malformed prev score => treated as changed (fail-safe)
 */
import { scoreChanged } from '../priorityEngineService';

describe('scoreChanged', () => {
  it('treats a never-scored todo (null prev) as changed', () => {
    expect(scoreChanged(null, 50)).toBe(true);
  });

  it('returns false when the score is identical (category is irrelevant)', () => {
    expect(scoreChanged(50, 50)).toBe(false);
    expect(scoreChanged(0, 0)).toBe(false);
  });

  it('returns true when the score changed', () => {
    expect(scoreChanged(50, 51)).toBe(true);
    expect(scoreChanged(80, 0)).toBe(true);
  });

  it('normalizes a string prev score from the pg driver', () => {
    expect(scoreChanged('50', 50)).toBe(false);
    expect(scoreChanged('50', 51)).toBe(true);
  });

  it('treats a non-numeric prev score as changed (fail-safe)', () => {
    expect(scoreChanged('abc', 50)).toBe(true);
    expect(scoreChanged(NaN, 50)).toBe(true);
  });
});
