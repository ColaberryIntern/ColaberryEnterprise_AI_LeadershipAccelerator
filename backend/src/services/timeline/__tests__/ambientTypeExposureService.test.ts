import { getAmbientDistinctSeenCounts } from '../ambientTypeExposureService';
import { sequelize } from '../../../config/database';

const mockQuery = jest.spyOn(sequelize, 'query');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getAmbientDistinctSeenCounts', () => {
  it('happy path: returns the real per-provider count, correctly attributed to each provider', async () => {
    mockQuery
      .mockImplementationOnce((async (sql: any) => {
        expect(String(sql)).toMatch(/blog_post_views/);
        return [{ n: 12 }] as any;
      }) as any)
      .mockImplementationOnce((async (sql: any) => {
        expect(String(sql)).toMatch(/podcast_views/);
        return [{ n: 5 }] as any;
      }) as any)
      .mockImplementationOnce((async (sql: any) => {
        expect(String(sql)).toMatch(/network_video_views/);
        return [{ n: 40 }] as any;
      }) as any);

    const counts = await getAmbientDistinctSeenCounts('enr-1');

    expect(counts).toEqual({ blog: 12, podcast: 5, testimonial: 40 });
  });

  it('boundary: zero rows for a provider returns 0, not an error', async () => {
    mockQuery.mockResolvedValue([{ n: 0 }] as any);
    const counts = await getAmbientDistinctSeenCounts('enr-1');
    expect(counts).toEqual({ blog: 0, podcast: 0, testimonial: 0 });
  });

  it('failure path: a DB error for ONE provider degrades only that provider to 0, isolated from the other two', async () => {
    mockQuery
      .mockRejectedValueOnce(new Error('connection reset'))     // blog fails
      .mockResolvedValueOnce([{ n: 7 }] as any)                  // podcast succeeds
      .mockResolvedValueOnce([{ n: 3 }] as any);                 // testimonial succeeds

    const counts = await getAmbientDistinctSeenCounts('enr-1');

    expect(counts).toEqual({ blog: 0, podcast: 7, testimonial: 3 });
  });

  it('scopes each query to the given enrollment', async () => {
    mockQuery.mockResolvedValue([{ n: 1 }] as any);
    await getAmbientDistinctSeenCounts('enr-42');
    for (const call of mockQuery.mock.calls) {
      expect((call[1] as any).replacements).toEqual({ eid: 'enr-42' });
    }
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });
});
