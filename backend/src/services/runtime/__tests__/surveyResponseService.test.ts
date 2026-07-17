/** Pure core of the weekly-survey capture service: question extraction + answer
 *  validation/normalization (rating bounds, snapshotting question text by index,
 *  the "answer something before submitting" guard). */
import { questionsFromCard, normalizeAnswers } from '../surveyResponseService';

jest.mock('../../../models/CardSurveyResponse', () => ({ __esModule: true, default: {} }));
jest.mock('../../../models/TimelineCard', () => ({ __esModule: true, default: {} }));
jest.mock('../../../config/database', () => ({ sequelize: {} }));

const QS = ['This week was clear.', 'The pace worked for me.', 'I made real progress.'];

describe('questionsFromCard', () => {
  it('pulls questions[] + reflection from card metadata.content', () => {
    expect(questionsFromCard({ content: { questions: QS, reflection: 'What would help?' } }))
      .toEqual({ questions: QS, open_prompt: 'What would help?' });
  });
  it('is empty/null-safe for cards with no content', () => {
    expect(questionsFromCard(null)).toEqual({ questions: [], open_prompt: null });
    expect(questionsFromCard({ content: {} })).toEqual({ questions: [], open_prompt: null });
    expect(questionsFromCard({ content: { questions: ['ok', 42, '  '] } }).questions).toEqual(['ok']);
  });
});

describe('normalizeAnswers', () => {
  it('snapshots the question text by index (client label cannot override it)', () => {
    const out = normalizeAnswers({ items: [{ index: 0, rating: 4, question: 'FORGED' }] }, QS);
    expect(out.items[0]).toEqual({ question: 'This week was clear.', rating: 4, comment: null });
  });
  it('keeps ratings + trimmed comments + open text', () => {
    const out = normalizeAnswers({ items: [{ index: 1, rating: 5, comment: '  loved it  ' }], open: '  more labs  ' }, QS);
    expect(out.items[0]).toEqual({ question: 'The pace worked for me.', rating: 5, comment: 'loved it' });
    expect(out.open).toBe('more labs');
  });
  it('rejects out-of-range ratings with a 400', () => {
    for (const bad of [0, 6, 2.5, -1]) {
      expect(() => normalizeAnswers({ items: [{ index: 0, rating: bad }] }, QS)).toThrow(/1.5/);
    }
  });
  it('allows a null rating (skipped question)', () => {
    const out = normalizeAnswers({ items: [{ index: 0, rating: null }], open: 'note' }, QS);
    expect(out.items[0].rating).toBeNull();
  });
  it('rejects an empty submission (no ratings, no open text)', () => {
    expect(() => normalizeAnswers({ items: [{ index: 0, rating: null }] }, QS)).toThrow(/at least one/i);
    expect(() => normalizeAnswers({ items: [] }, QS)).toThrow(/at least one/i);
  });
});
