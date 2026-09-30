const mockFindAll = jest.fn();
jest.mock('../../../models/AssessmentAttempt', () => ({ __esModule: true, default: { findAll: (...a: any[]) => mockFindAll(...a) } }));

import { getAssessmentTrendField } from '../assessmentTrendSource';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getAssessmentTrendField', () => {
  it('happy path: real rollup counts, reusing rollupAssessments() and computeTrendDirection() verbatim', async () => {
    mockFindAll.mockResolvedValue([
      { id: 'a1', kind: 'evaluation', score: 0.5, passed: false, competency_scores: {}, submitted_at: new Date('2026-08-01') },
      { id: 'a2', kind: 'evaluation', score: 0.6, passed: true, competency_scores: {}, submitted_at: new Date('2026-08-08') },
      { id: 'a3', kind: 'evaluation', score: 0.9, passed: true, competency_scores: {}, submitted_at: new Date('2026-08-15') },
    ]);

    const field = await getAssessmentTrendField('enrollment-1');

    expect(field.status).toBe('known');
    expect(field.value?.evalsTaken).toBe(3);
    expect(field.value?.evalsPassed).toBe(2);
    expect(field.value?.trend).toBe('up'); // 50 -> 60,90 is a real upward move past the 3-point threshold
    expect(field.sourceRecordIds).toEqual(['a1', 'a2', 'a3']);
  });

  it('honesty boundary: zero attempts is a real known zero state, not unknown', async () => {
    mockFindAll.mockResolvedValue([]);

    const field = await getAssessmentTrendField('enrollment-1');

    expect(field.status).toBe('known');
    expect(field.value).toEqual({ evalsTaken: 0, evalsPassed: 0, avgEvalPct: null, weakCompetencies: [], trend: 'flat' });
  });
});
