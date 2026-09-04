const mockFindAll = jest.fn();
jest.mock('../../../models/TimelineCardProgress', () => ({ __esModule: true, default: { findAll: (...a: any[]) => mockFindAll(...a) } }));

import { getTimelineProgressField } from '../timelineProgressSource';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getTimelineProgressField', () => {
  it('happy path: real completed-card count and the most recent real activity timestamp', async () => {
    mockFindAll.mockResolvedValue([
      { id: 'p1', status: 'completed', completed_at: new Date('2026-09-01'), started_at: new Date('2026-08-30') },
      { id: 'p2', status: 'completed', completed_at: new Date('2026-09-03'), started_at: new Date('2026-09-02') },
      { id: 'p3', status: 'in_progress', completed_at: null, started_at: new Date('2026-09-04') },
    ]);

    const field = await getTimelineProgressField('enrollment-1');

    expect(field.status).toBe('known');
    expect(field.value?.cardsCompleted).toBe(2);
    expect(field.value?.totalCardsSeen).toBe(3);
    expect(field.value?.lastActivityAt).toBe(new Date('2026-09-04').toISOString()); // in_progress card's started_at is the most recent real activity
  });

  it('honesty boundary: zero real rows returns real zeros and a null timestamp, not fabricated activity', async () => {
    mockFindAll.mockResolvedValue([]);

    const field = await getTimelineProgressField('enrollment-1');

    expect(field.status).toBe('known');
    expect(field.value).toEqual({ cardsCompleted: 0, totalCardsSeen: 0, lastActivityAt: null });
  });
});
