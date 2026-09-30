/** Pure core of the weekly-survey capture service: question extraction + answer
 *  validation/normalization (rating bounds, snapshotting question text by index,
 *  the "answer something before submitting" guard). */
import { questionsFromCard, normalizeAnswers, saveSurvey } from '../surveyResponseService';
import CardSurveyResponse from '../../../models/CardSurveyResponse';
import TimelineCard from '../../../models/TimelineCard';
import { awardCardCompletionPoints } from '../../progression/cardPointsService';

jest.mock('../../../models/CardSurveyResponse', () => ({ __esModule: true, default: { findOne: jest.fn(), create: jest.fn(), update: jest.fn() } }));
jest.mock('../../../models/TimelineCard', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
jest.mock('../../progression/cardPointsService', () => ({ awardCardCompletionPoints: jest.fn() }));
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

describe('saveSurvey (points wiring)', () => {
  const mockCard = (TimelineCard as any).findByPk as jest.Mock;
  const mockFindResp = (CardSurveyResponse as any).findOne as jest.Mock;
  const mockCreateResp = (CardSurveyResponse as any).create as jest.Mock;
  const mockAwardCard = awardCardCompletionPoints as jest.Mock;
  const CARD = { id: 'card-1', type: 'warmup', program_id: 'prog-1', week: 0, points: { learning: 10 }, metadata: { content: { questions: QS, reflection: 'What would help?' } } };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCard.mockResolvedValue(CARD);
    mockFindResp.mockResolvedValue(null);
    mockCreateResp.mockResolvedValue({});
    mockAwardCard.mockResolvedValue(10);
  });

  it('saves answers and awards engagement points, returning the delta', async () => {
    const res = await saveSurvey('enr-1', 'card-1', { items: [{ index: 0, rating: 4 }], open: null });
    expect(res.saved).toBe(true);
    expect(res.points_awarded).toBe(10);
    expect(mockCreateResp).toHaveBeenCalledTimes(1);
    // Award is keyed on the survey card (with its points → the badge value); idempotency is inside cardPointsService.
    expect(mockAwardCard).toHaveBeenCalledWith('enr-1', { id: 'card-1', type: 'warmup', points: { learning: 10 } });
  });

  it('returns points_awarded=0 when the ledger already credited this card (idempotent)', async () => {
    mockFindResp.mockResolvedValue({ update: jest.fn().mockResolvedValue({}) }); // existing response → update path
    mockAwardCard.mockResolvedValue(0);                                          // already awarded on first submit
    const res = await saveSurvey('enr-1', 'card-1', { items: [{ index: 0, rating: 5 }], open: null });
    expect(res.points_awarded).toBe(0);
  });

  it('404s when the card does not exist', async () => {
    mockCard.mockResolvedValue(null);
    await expect(saveSurvey('enr-1', 'missing', { items: [{ index: 0, rating: 3 }] })).rejects.toMatchObject({ status: 404 });
  });
});
