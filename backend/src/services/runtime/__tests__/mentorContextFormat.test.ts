/**
 * mentorContextFormat — unit tests for the pure mentor-context renderers.
 *
 * The safety-critical property: the mentor now holds the answer key, so a graded
 * Evaluation the student has NOT passed must NEVER surface its correct option
 * (they can retake it). A Knowledge Check (already revealed on submit) and a
 * passed Evaluation may reveal, to help the student close the gap.
 */
import { renderAttempt, renderSavedWork, AttemptLike } from '../mentorContextFormat';
import type { AssessmentResponseItem } from '../../../models/AssessmentAttempt';

function item(over: Partial<AssessmentResponseItem>): AssessmentResponseItem {
  return {
    question: 'What is a token?',
    competency: 'ai_foundations',
    options: ['A word piece', 'A password', 'A file', 'A GPU'],
    selected_index: 1,
    correct_index: 0,
    is_correct: false,
    explanation: 'Models process text as tokens, roughly word pieces.',
    time_ms: 4200,
    ...over,
  };
}

const CORRECT = item({ question: 'Right one', selected_index: 0, correct_index: 0, is_correct: true });
const MISSED = item({ question: 'Missed one', selected_index: 1, correct_index: 0, is_correct: false });

describe('renderAttempt', () => {
  it('quiz: reports score, tags competencies, and reveals the missed answer', () => {
    const a: AttemptLike = { kind: 'quiz', score: 0.6, correct_count: 3, total_count: 5, passed: null, responses: [CORRECT, MISSED] };
    const { text, graded_lock } = renderAttempt(a);
    expect(graded_lock).toBe(false);
    expect(text).toContain('Knowledge Check: 3/5 correct (60%)');
    expect(text).toContain('[ai_foundations]');
    // quiz already revealed to the student → mentor may reference the answer
    expect(text).toContain('Correct answer: "A word piece"');
    expect(text).toContain('they chose "A password"');
  });

  it('LEAK GUARD — unpassed evaluation withholds the correct option and locks', () => {
    const a: AttemptLike = { kind: 'evaluation', score: 0.6, correct_count: 6, total_count: 10, passed: false, pass_threshold: 0.7, responses: [CORRECT, MISSED] };
    const { text, graded_lock } = renderAttempt(a);
    expect(graded_lock).toBe(true);
    // threshold copy is read from the attempt, not hardcoded (main moved it 75% -> 70%)
    expect(text).toContain('not yet passed, needs 70%');
    // the whole point: the answer key must NOT appear for a retryable graded eval
    expect(text).not.toContain('Correct answer:');
    expect(text).not.toContain('A word piece');
    // it still tells the coach WHICH question was missed + the competency
    expect(text).toContain('Missed [ai_foundations]: Missed one');
  });

  it('passed evaluation may reveal (student is done with it)', () => {
    const a: AttemptLike = { kind: 'evaluation', score: 0.8, correct_count: 8, total_count: 10, passed: true, responses: [CORRECT, MISSED] };
    const { text, graded_lock } = renderAttempt(a);
    expect(graded_lock).toBe(false);
    expect(text).toContain('passed');
    expect(text).toContain('Correct answer: "A word piece"');
  });

  it('marks a skipped question as left blank', () => {
    const a: AttemptLike = { kind: 'quiz', score: 0, correct_count: 0, total_count: 1, passed: null, responses: [item({ selected_index: null, is_correct: false })] };
    expect(renderAttempt(a).text).toContain('left blank');
  });
});

describe('renderSavedWork', () => {
  it('summarizes a prompt-lab / reflection blob', () => {
    const out = renderSavedWork({ prompt: 'Draft a system prompt', reflection: 'I learned about tokens' });
    expect(out).toContain('Prompt they wrote: "Draft a system prompt"');
    expect(out).toContain('Reflection: "I learned about tokens"');
  });
  it('handles a raw string, an array of responses, and empty input', () => {
    expect(renderSavedWork('just text')).toBe('just text');
    expect(renderSavedWork({ responses: ['a', 'b'] })).toContain('Responses: a | b');
    expect(renderSavedWork(null)).toBe('');
    expect(renderSavedWork({})).toBe('');
  });
});
