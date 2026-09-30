import { previewIntake } from '../intakePreview';
import { itemsFromIntake } from '../intakeTruth';
import { buildIntakeReview } from '../intakeReview';

/**
 * The confirmation gate before the build exists. The one property that
 * matters: what the student sees is EXACTLY what will be stored.
 */

const IDEA = 'A tool that checks incoming invoices against the purchase orders in our spreadsheet.';
const input = {
  idea: IDEA,
  answers: [{
    id: 'guardrail',
    question: 'What would you check before it went out?',
    answer: 'Priya signs off anything over 5k.',
    angle: 'THE GUARDRAIL',
  }],
  covered: [{ angle: 'THE TOOLS', evidence: 'our spreadsheet' }],
};

describe('the preview is the store, without the storing', () => {
  it('shows the same review the stored items would produce', () => {
    // Same functions, same input: the review a student confirms is the one
    // saveIntakeTruth will write. No second implementation to drift.
    const preview = previewIntake(input);
    const stored = buildIntakeReview(itemsFromIntake(input).items);
    expect(preview.review).toEqual(stored);
  });

  it('touches nothing: it is a pure function of its input', () => {
    expect(previewIntake(input)).toEqual(previewIntake(input));
  });
});

describe('what the student is shown', () => {
  it('groups what was heard as needing confirmation, not as confirmed', () => {
    const { review } = previewIntake(input);
    expect(review.counts.needsConfirmation).toBeGreaterThan(0);
    expect(review.counts.confirmed).toBe(0);
  });

  it('lists what is still unanswered, in plain words', () => {
    const { unanswered } = previewIntake(input);
    expect(unanswered).toContain('there is no baseline, so nothing can be measured against it later');
    // The guardrail was answered and tools were covered; neither is a gap.
    expect(unanswered.join(' ')).not.toContain('what a person should check');
    expect(unanswered.join(' ')).not.toContain('read from and write to');
  });

  it('returns the covered receipt so a short interview reads as deliberate', () => {
    expect(previewIntake(input).covered).toEqual([{ angle: 'THE TOOLS', evidence: 'our spreadsheet' }]);
  });

  it('drops a covered entry with no quote', () => {
    const { covered } = previewIntake({ ...input, covered: [{ angle: 'THE JOB', evidence: '  ' }] });
    expect(covered).toEqual([]);
  });

  it('reports an answer it could not file rather than hiding it', () => {
    // A question with no angle, from a bundle cached before angles existed.
    const { unmapped } = previewIntake({
      ...input, answers: [{ id: 'q', question: 'Q?', answer: 'An answer.' }],
    });
    expect(unmapped).toBe(1);
  });

  it('blocks nothing on its own', () => {
    // Heard-but-unconfirmed is the normal state at this step, and a gate that
    // blocked on it would be blocking every student every time.
    expect(previewIntake(input).review.blocksPlanning).toBe(false);
  });
});
