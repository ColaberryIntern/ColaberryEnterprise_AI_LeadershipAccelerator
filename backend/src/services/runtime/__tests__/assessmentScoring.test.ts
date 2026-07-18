import { scoreResponses, AssessmentQuestion, EVAL_PASS_THRESHOLD } from '../assessmentService';

const Q = (correct: number, competency: string): AssessmentQuestion => ({
  question: 'q', options: ['a', 'b', 'c', 'd'], correct_index: correct, explanation: 'e', competency,
});

describe('scoreResponses', () => {
  const questions = [Q(0, 'prompt_engineering'), Q(1, 'prompt_engineering'), Q(2, 'architecture'), Q(3, 'architecture')];

  it('scores all-correct as 1.0 and all-wrong as 0', () => {
    const all = scoreResponses(questions, questions.map((q, i) => ({ index: i, selected_index: q.correct_index })));
    expect(all.correct).toBe(4);
    expect(all.total).toBe(4);
    expect(all.score).toBe(1);
    const none = scoreResponses(questions, questions.map((_, i) => ({ index: i, selected_index: 0 })));
    // index 0 is correct only for q0 -> 1/4
    expect(none.correct).toBe(1);
    expect(none.score).toBeCloseTo(0.25);
  });

  it('counts a skipped answer (null / missing) as incorrect', () => {
    const r = scoreResponses(questions, [{ index: 0, selected_index: 0 }]); // only q0 answered
    expect(r.correct).toBe(1);
    expect(r.total).toBe(4);
    expect(r.items[1].selected_index).toBeNull();
    expect(r.items[1].is_correct).toBe(false);
  });

  it('rolls up per-competency correct/total/pct', () => {
    // get q0 right, q1 wrong (prompt_engineering 1/2); q2 right, q3 right (architecture 2/2)
    const r = scoreResponses(questions, [
      { index: 0, selected_index: 0 }, { index: 1, selected_index: 0 },
      { index: 2, selected_index: 2 }, { index: 3, selected_index: 3 },
    ]);
    expect(r.competency_scores.prompt_engineering).toEqual({ correct: 1, total: 2, pct: 0.5 });
    expect(r.competency_scores.architecture).toEqual({ correct: 2, total: 2, pct: 1 });
  });

  it('the 70% evaluation gate: 7/10 passes, 6/10 fails (threshold 0.70)', () => {
    expect(EVAL_PASS_THRESHOLD).toBe(0.7);
    // A 10-question evaluation; the correct answer for each is index 0.
    const ten: AssessmentQuestion[] = Array.from({ length: 10 }, () => Q(0, 'architecture'));
    const answer = (rightCount: number) => ten.map((_, i) => ({ index: i, selected_index: i < rightCount ? 0 : 1 }));
    const seven = scoreResponses(ten, answer(7));   // 7/10 = 0.70 — now passes (would have failed at 0.75)
    expect(seven.score).toBeCloseTo(0.7);
    expect(seven.score >= EVAL_PASS_THRESHOLD).toBe(true);
    const six = scoreResponses(ten, answer(6));      // 6/10 = 0.60 — still fails
    expect(six.score).toBeCloseTo(0.6);
    expect(six.score >= EVAL_PASS_THRESHOLD).toBe(false);
  });

  it('empty question set scores 0 without dividing by zero', () => {
    const r = scoreResponses([], []);
    expect(r.total).toBe(0);
    expect(r.score).toBe(0);
  });
});
