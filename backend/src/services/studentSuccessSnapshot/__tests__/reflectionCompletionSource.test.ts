const mockFindAll = jest.fn();
jest.mock('../../../models/ReflectionEntry', () => ({ __esModule: true, default: { findAll: (...a: any[]) => mockFindAll(...a) } }));

import { getReflectionCompletionField } from '../reflectionCompletionSource';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getReflectionCompletionField', () => {
  it('happy path: real count and the most recent real entry\'s readiness self-rating', async () => {
    mockFindAll.mockResolvedValue([
      { id: 'r1', updated_at: new Date('2026-09-03'), readiness: 4 },
      { id: 'r2', updated_at: new Date('2026-08-27'), readiness: 2 },
    ]);

    const field = await getReflectionCompletionField('enrollment-1');

    expect(field.status).toBe('known');
    expect(field.value).toEqual({ count: 2, lastSubmittedAt: new Date('2026-09-03').toISOString(), lastReadiness: 4 });
  });

  it('honesty boundary: zero reflections is a real known zero, not unknown', async () => {
    mockFindAll.mockResolvedValue([]);

    const field = await getReflectionCompletionField('enrollment-1');

    expect(field.status).toBe('known');
    expect(field.value).toEqual({ count: 0, lastSubmittedAt: null, lastReadiness: null });
  });
});
