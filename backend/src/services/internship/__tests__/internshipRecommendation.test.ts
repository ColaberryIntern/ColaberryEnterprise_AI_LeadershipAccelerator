/**
 * The recommendation is a reading for a human, never a decision.
 *
 * These tests pin three contract requirements: "the AI produces a recommendation,
 * not the final admission decision", "do not show a hidden personality score or
 * infer protected traits", and "unreliable attendance or metrics are marked
 * unknown and excluded from recommendations".
 */
import { buildRecommendation, type AnswerView } from '../internshipRecommendation';
import { activeQuestions, findQuestion } from '../internshipQuestionBank';

/** A complete, unproblematic set of answers. */
function fullAnswers(overrides: Record<string, Partial<AnswerView>> = {}): AnswerView[] {
  return activeQuestions().map((q) => {
    const base: AnswerView = {
      question_key: q.question_key,
      state: 'answered',
      answer_text: q.answer_type === 'yes_no' || q.answer_type === 'choice'
        ? null
        : 'A considered answer that is comfortably long enough to not be flagged as brief.',
      answer_value: q.answer_type === 'yes_no'
        ? true
        : q.answer_type === 'choice'
          ? 'not_employed'
          : null,
    };
    return { ...base, ...(overrides[q.question_key] ?? {}) };
  });
}

const complete = (overrides: Record<string, Partial<AnswerView>> = {}) => buildRecommendation({
  answers: fullAnswers(overrides),
  attests_not_employed_fulltime: true,
  commitment_acknowledged: true,
});

describe('it is never a decision', () => {
  it('always declares that a human must decide', () => {
    expect(complete().requires_human_decision).toBe(true);
  });

  it('suggests an action, never a verdict', () => {
    const allowed = ['ready_for_review', 'needs_more_information', 'human_follow_up_suggested'];
    expect(allowed).toContain(complete().suggested_action);
    // The words a decision would use appear nowhere in the output vocabulary.
    expect(allowed).not.toContain('approve');
    expect(allowed).not.toContain('reject');
  });

  it('emits no score, rank, rating or probability anywhere', () => {
    // Following ScholarshipInterview's precedent: a reviewer handed a score starts
    // ranking people against criteria nobody agreed.
    const json = JSON.stringify(complete());
    for (const banned of ['score', 'rank', 'rating', 'probability', 'percentile', 'confidence', 'personality']) {
      expect(json.toLowerCase()).not.toContain(banned);
    }
  });

  it('is pure — same input, same output', () => {
    expect(complete()).toEqual(complete());
  });
});

describe('completeness', () => {
  it('reports a clean application as ready for review', () => {
    const rec = complete();
    expect(rec.suggested_action).toBe('ready_for_review');
    expect(rec.completeness.unresolved_keys).toEqual([]);
    expect(rec.factors.filter((f) => f.severity === 'blocking')).toEqual([]);
  });

  it('names a missing answer as blocking, and asks for more information', () => {
    const rec = buildRecommendation({
      answers: fullAnswers().filter((a) => a.question_key !== 'why_join'),
      attests_not_employed_fulltime: true,
      commitment_acknowledged: true,
    });
    expect(rec.suggested_action).toBe('needs_more_information');
    expect(rec.completeness.unresolved_keys).toContain('why_join');
    expect(rec.factors.some((f) => f.code === 'answer_missing' && f.question_key === 'why_join')).toBe(true);
  });

  it('treats an unconfirmed extracted answer as unresolved, not as answered', () => {
    // The transcript-extraction safety rule, seen from the reviewer's side: a
    // call answer nobody confirmed must not count as given.
    const rec = complete({ built_something: { state: 'needs_followup' } });
    expect(rec.completeness.unresolved_keys).toContain('built_something');
    expect(rec.factors.some((f) => f.code === 'answer_needs_confirmation')).toBe(true);
  });

  it('counts confirmed answers as resolved', () => {
    const rec = complete({ built_something: { state: 'confirmed' } });
    expect(rec.completeness.unresolved_keys).not.toContain('built_something');
  });
});

describe('contradictions are surfaced, never acted on', () => {
  it('flags a requirement the applicant says they cannot meet', () => {
    const rec = complete({ weekly_hours_commitment: { answer_value: false } });
    const factor = rec.factors.find((f) => f.code === 'requirement_not_met');
    expect(factor).toBeTruthy();
    expect(factor!.severity).toBe('blocking');
    expect(factor!.question_key).toBe('weekly_hours_commitment');
    // Still not a rejection.
    expect(rec.suggested_action).toBe('human_follow_up_suggested');
    expect(rec.requires_human_decision).toBe(true);
  });

  it('flags full-time employment against the eligibility gate', () => {
    const rec = complete({ employment_status: { answer_value: 'full_time' } });
    expect(rec.factors.some((f) => f.code === 'employed_full_time')).toBe(true);
    expect(rec.suggested_action).toBe('human_follow_up_suggested');
  });

  it('flags an attestation that contradicts the interview answer', () => {
    // The form says "not employed full time", the interview says otherwise. A human
    // has to look at that; nothing should resolve it automatically.
    const rec = buildRecommendation({
      answers: fullAnswers({ employment_status: { answer_value: 'full_time' } }),
      attests_not_employed_fulltime: true,
      commitment_acknowledged: true,
    });
    expect(rec.factors.some((f) => f.code === 'attestation_conflicts_with_interview')).toBe(true);
  });

  it('flags a missing attestation', () => {
    const rec = buildRecommendation({
      answers: fullAnswers(),
      attests_not_employed_fulltime: false,
      commitment_acknowledged: true,
    });
    expect(rec.factors.some((f) => f.code === 'attestation_missing')).toBe(true);
  });

  it('quotes the applicant\'s own words as evidence rather than paraphrasing', () => {
    const said = 'I can only manage about ten hours a week honestly.';
    const rec = complete({ weekly_hours_commitment: { answer_value: false, answer_text: said } });
    const factor = rec.factors.find((f) => f.code === 'requirement_not_met')!;
    expect(factor.evidence).toBe(said);
  });

  it('flags every confirmation the applicant declined', () => {
    const declined = ['weekly_hours_commitment', 'can_attend_meetings', 'tools_secrets_ack'];
    const overrides = Object.fromEntries(declined.map((k) => [k, { answer_value: false }]));
    const rec = complete(overrides);
    const flagged = rec.factors.filter((f) => f.code === 'requirement_not_met').map((f) => f.question_key);
    for (const k of declined) expect(flagged).toContain(k);
  });
});

describe('brevity is a note, not a fault', () => {
  it('notes a very short open answer without blocking on it', () => {
    const rec = complete({ why_join: { answer_text: 'AI is cool.' } });
    const factor = rec.factors.find((f) => f.code === 'brief_answer');
    expect(factor?.severity).toBe('note');
    // A short answer must not stop the application reaching a reviewer.
    expect(rec.suggested_action).toBe('ready_for_review');
  });

  it('does not flag brevity on yes/no or choice questions', () => {
    const rec = complete();
    const flagged = rec.factors.filter((f) => f.code === 'brief_answer').map((f) => f.question_key);
    for (const key of flagged) {
      expect(findQuestion(key)!.answer_type).toBe('long_text');
    }
  });
});

describe('unreliable data is excluded, not counted as zero', () => {
  it('carries excluded signals through untouched', () => {
    const rec = buildRecommendation({
      answers: fullAnswers(),
      attests_not_employed_fulltime: true,
      commitment_acknowledged: true,
      unreliable_signals: [{ signal: 'attendance_rate', reason: 'no attendance rows for this cohort' }],
    });
    expect(rec.excluded_signals).toEqual([
      { signal: 'attendance_rate', reason: 'no attendance rows for this cohort' },
    ]);
    // Crucially: the exclusion produced no factor, so it did not count against them.
    expect(rec.factors.some((f) => /attendance/i.test(f.detail))).toBe(false);
  });

  it('defaults to no excluded signals rather than inventing them', () => {
    expect(complete().excluded_signals).toEqual([]);
  });
});
