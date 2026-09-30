const mockFindAll = jest.fn();
jest.mock('../../../models/MentorReviewItem', () => ({ __esModule: true, default: { findAll: (...a: any[]) => mockFindAll(...a) } }));

import { getInstructorFeedbackField } from '../instructorFeedbackSource';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getInstructorFeedbackField', () => {
  it('happy path: real released count and average confidence, scoped to only RELEASED items', async () => {
    mockFindAll.mockResolvedValue([
      { id: 'r1', confidence_score: 0.9, created_at: new Date('2026-09-02') },
      { id: 'r2', confidence_score: 0.7, created_at: new Date('2026-08-20') },
    ]);

    const field = await getInstructorFeedbackField('enrollment-1');

    expect(field.status).toBe('known');
    expect(field.value).toEqual({ releasedCount: 2, lastReleasedAt: new Date('2026-09-02').toISOString(), avgConfidence: 0.8 });
    const call = mockFindAll.mock.calls[0][0];
    expect(call.where.status).toEqual(['auto_approved', 'approved']);
  });

  it('honesty boundary: zero released items is a real known zero, never fabricated feedback', async () => {
    mockFindAll.mockResolvedValue([]);

    const field = await getInstructorFeedbackField('enrollment-1');

    expect(field.status).toBe('known');
    expect(field.value).toEqual({ releasedCount: 0, lastReleasedAt: null, avgConfidence: null });
  });
});
