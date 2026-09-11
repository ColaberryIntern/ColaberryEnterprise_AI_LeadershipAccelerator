/**
 * Attendance must not gate the build ladder.
 *
 * The ladder shipped requiring one present-marked class per rank, rising to
 * eight for architect. In production that was a gate on a signal that barely
 * existed: 178 present rows across 32 people against 469 active enrollments.
 * Eight people sat at rank 0 with every other requirement cleared, one of them
 * holding 29 pieces of validated evidence against a threshold of 3.
 *
 * This test exists because the ladder is a table of nine near-identical rows,
 * and a tenth row added later, or a "restore the old thresholds" edit, would
 * reintroduce the wall silently. It asserts the rule, not one row.
 */
import { BUILDER_LEVELS } from '../seeders';
import { evaluatePromotion, LevelGate, PromotionInput } from '../scoring';

describe('the ladder does not ask for attendance', () => {
  it('holds min_attendance at 0 for every rank, including any added later', () => {
    const offenders = BUILDER_LEVELS
      .filter((l) => l.min_attendance !== 0)
      .map((l) => `${l.slug} (rank ${l.rank}) = ${l.min_attendance}`);
    expect(offenders).toEqual([]);
  });

  it('still defines the ladder it is meant to, so a passing test means something', () => {
    // Guards the assertion above against trivially passing on an empty array.
    expect(BUILDER_LEVELS.length).toBeGreaterThanOrEqual(9);
    expect(BUILDER_LEVELS.map((l) => l.slug)).toContain('junior_builder');
    expect(BUILDER_LEVELS.map((l) => l.slug)).toContain('architect');
  });
});

describe('the gate as the evaluator actually applies it', () => {
  const gateFor = (slug: string): LevelGate => {
    const l = BUILDER_LEVELS.find((x) => x.slug === slug)!;
    return {
      slug: l.slug,
      required_competencies: l.required_competencies as LevelGate['required_competencies'],
      min_evidence: l.min_evidence,
      min_artifacts: l.min_artifacts,
      min_github: l.min_github,
      min_evaluations: l.min_evaluations,
      min_implementation: l.min_implementation,
      min_attendance: l.min_attendance,
      requires_ai_approval: l.requires_ai_approval,
    };
  };

  /** Swati's real production counts on the day this was found. */
  const shipper: PromotionInput = {
    competencies: [],
    evidence_count: 29,
    artifact_count: 0,
    github_count: 16,
    evaluation_count: 2,
    implementation_count: 8,
    attendance_count: 0,
    ai_approved: true,
  };

  it('promotes someone who has shipped but never attended a class', () => {
    const verdict = evaluatePromotion(shipper, gateFor('junior_builder'));
    expect(verdict.gaps).toEqual([]);
    expect(verdict.eligible).toBe(true);
  });

  it('no rank reports an attendance gap for a zero-attendance learner', () => {
    // Reaching architect requires far more evidence than this input carries, so
    // higher ranks legitimately report OTHER gaps. None of them may be attendance.
    for (const level of BUILDER_LEVELS) {
      const gaps = evaluatePromotion(shipper, gateFor(level.slug)).gaps;
      expect(gaps.filter((g) => g.startsWith('attendance'))).toEqual([]);
    }
  });
});
