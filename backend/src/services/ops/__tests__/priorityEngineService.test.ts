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
import { scoreChanged, scoreTodo, applyProjectWeight } from '../priorityEngineService';

const DAY = 86400000;

// Minimal Scored-like object exercising only the fields applyProjectWeight reads.
const scoredLike = (
  urgency_score: number,
  opts: { has_assignees?: boolean; days_stale?: number; days_until_due?: number | null } = {},
): any => ({
  urgency_score,
  category: 'unscored',
  breakdown: { due_date: 0, staleness: 0, keywords: 0, assignee: 0, project: 0 },
  signals: {
    days_until_due: opts.days_until_due ?? 0,
    days_stale: opts.days_stale ?? 0,
    matched_keywords: [],
    has_assignees: opts.has_assignees ?? true,
  },
});

describe('applyProjectWeight', () => {
  it('down-weighting demotes a todo out of human_required (2026-06-15 fix)', () => {
    // Raw 70 + assignees => human_required. Weight 0.5 => 35, which must NOT
    // stay human_required (the old code fell back to the raw-score category).
    const scored = scoredLike(70, { has_assignees: true, days_until_due: -1 });
    const { weightedScore, weightedCategory } = applyProjectWeight(scored, 0.5);
    expect(weightedScore).toBe(35);
    expect(weightedCategory).not.toBe('human_required');
  });

  it('up-weighting promotes a todo into human_required', () => {
    const scored = scoredLike(45, { has_assignees: true, days_until_due: 1 });
    const { weightedScore, weightedCategory } = applyProjectWeight(scored, 1.5);
    expect(weightedScore).toBeGreaterThanOrEqual(60);
    expect(weightedCategory).toBe('human_required');
  });

  it('weight 1.0 leaves the score unchanged', () => {
    expect(applyProjectWeight(scoredLike(50), 1.0).weightedScore).toBe(50);
  });

  it('human_required still requires assignees even at a high weighted score', () => {
    const scored = scoredLike(80, { has_assignees: false, days_until_due: -1 });
    expect(applyProjectWeight(scored, 1.0).weightedCategory).not.toBe('human_required');
  });

  it('caps the weighted score at 100 and floors at 0', () => {
    expect(applyProjectWeight(scoredLike(80), 2.0).weightedScore).toBe(100);
    expect(applyProjectWeight(scoredLike(50), 0).weightedScore).toBe(0);
  });

  it('treats a non-finite weight as 1.0', () => {
    expect(applyProjectWeight(scoredLike(50), NaN).weightedScore).toBe(50);
  });
});

describe('scoreTodo', () => {
  it('scores an overdue, owned, urgent todo high + human_required', () => {
    const s = scoreTodo({
      title: 'URGENT fix the thing', description: null,
      due_on: new Date(Date.now() - DAY), bc_updated_at: new Date(),
      assignee_ids: ['17454835'], project_id: 'p',
    });
    expect(s.urgency_score).toBeGreaterThanOrEqual(60);
    expect(s.category).toBe('human_required');
    expect(s.signals.has_assignees).toBe(true);
  });

  it('scores a far-future, unowned, plain todo low + unscored', () => {
    const s = scoreTodo({
      title: 'someday maybe', description: null,
      due_on: new Date(Date.now() + DAY * 30), bc_updated_at: new Date(),
      assignee_ids: [], project_id: 'p',
    });
    expect(s.urgency_score).toBeLessThan(60);
    expect(s.category).toBe('unscored');
  });

  it('an undue, stale, unowned todo is waiting_dependency', () => {
    const s = scoreTodo({
      title: 'orphaned', description: null,
      due_on: null, bc_updated_at: new Date(Date.now() - DAY * 10),
      assignee_ids: [], project_id: 'p',
    });
    expect(s.category).toBe('waiting_dependency');
  });

  it('picks the highest-value keyword match and never exceeds 100', () => {
    const s = scoreTodo({
      title: 'URGENT review', description: 'P1 ASAP', // urgent_high (15) wins over review (5)
      due_on: new Date(Date.now() - DAY * 5), bc_updated_at: new Date(Date.now() - DAY * 30),
      assignee_ids: ['1'], project_id: 'p',
    });
    expect(s.breakdown.keywords).toBe(15);
    expect(s.urgency_score).toBeLessThanOrEqual(100);
  });
});

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
