/**
 * groupOpenQuestions + the question-key round-trip (B.3). Pure: group raw open-gap rows into deduplicated questions
 * (one per distinct question text), union the affected docs + suggestions, and encode a URL-safe key the answer route
 * decodes back to the question text (gap resolution matches on that text).
 */
import { groupOpenQuestions, encodeQuestionKey, decodeQuestionKey } from '../govProposalGaps';

describe('groupOpenQuestions', () => {
  it('dedups by question text, unions documents + suggestions, keeps the first why', () => {
    const rows = [
      { question: 'What is the company DUNS number?', why: 'Needed for the Execution of Offer.', suggestions: ['look it up on SAM.gov'], doc_key: 'execution_offer' },
      { question: 'What is the company DUNS number?', why: null, suggestions: ['check the W-9'], doc_key: 'reps_certs' },
      { question: 'How many similar projects have we delivered?', why: 'Past performance needs 3.', suggestions: [], doc_key: 'past_performance' },
      { question: '   ', why: 'blank', suggestions: [], doc_key: 'x' }, // dropped (empty question)
    ];
    const qs = groupOpenQuestions(rows);
    expect(qs).toHaveLength(2);
    const duns = qs.find((q) => q.question.includes('DUNS'))!;
    expect(duns.documentKeys.sort()).toEqual(['execution_offer', 'reps_certs']);
    expect(duns.suggestions.sort()).toEqual(['check the W-9', 'look it up on SAM.gov']);
    expect(duns.why).toBe('Needed for the Execution of Offer.'); // first non-null why wins
  });

  it('is total on garbage', () => {
    expect(groupOpenQuestions(undefined as any)).toEqual([]);
  });
});

describe('question key round-trip', () => {
  it('encodes URL-safe and decodes back to the exact question text', () => {
    const q = 'What is the company’s DUNS number? (A/B & C)';
    const key = encodeQuestionKey(q);
    expect(key).not.toMatch(/[^A-Za-z0-9_-]/); // base64url: no +, /, =
    expect(decodeQuestionKey(key)).toBe(q);
  });
  it('decode is total on garbage', () => {
    expect(decodeQuestionKey('')).toBeNull();
  });
});
