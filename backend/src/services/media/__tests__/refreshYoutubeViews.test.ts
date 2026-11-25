jest.mock('../../../models', () => ({ MediaAsset: { findAll: jest.fn() } }));
jest.mock('../youtubeStats', () => {
  const actual = jest.requireActual('../youtubeStats');
  return { ...actual, fetchVideoStats: jest.fn() };
});

import { MediaAsset } from '../../../models';
import { fetchVideoStats } from '../youtubeStats';
import {
  countsChanged,
  mergeYoutubeMetadata,
  refreshYoutubeViews,
} from '../refreshYoutubeViews';

const mockFindAll = MediaAsset.findAll as unknown as jest.Mock;
const mockFetch = fetchVideoStats as unknown as jest.Mock;

/** A stand-in row that records what it was asked to save. */
function row(id: string, sourceUrl: string | null, metadata: Record<string, unknown> | null = null) {
  const r: Record<string, unknown> = { id, source_url: sourceUrl, metadata };
  r.update = jest.fn(async (patch: Record<string, unknown>) => {
    Object.assign(r, patch);
    return r;
  });
  return r;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockResolvedValue(new Map());
});

describe('pure helpers', () => {
  it('keeps other metadata keys when writing the youtube record', () => {
    const merged = mergeYoutubeMetadata(
      { caption: 'keep me', youtube: { viewCount: 1 } },
      { videoId: 'v', viewCount: 2, likeCount: null, checkedAt: 'now' },
    );
    expect(merged.caption).toBe('keep me');
    expect(merged.youtube).toMatchObject({ viewCount: 2 });
  });

  it('survives metadata being null', () => {
    expect(mergeYoutubeMetadata(null, { videoId: 'v', viewCount: 1, likeCount: null, checkedAt: 'n' }))
      .toEqual({ youtube: { videoId: 'v', viewCount: 1, likeCount: null, checkedAt: 'n' } });
  });

  it('notices a changed count and ignores a changed timestamp', () => {
    const base = { videoId: 'v', viewCount: 10, likeCount: 1, checkedAt: 'a' };
    expect(countsChanged(undefined, base)).toBe(true);
    expect(countsChanged({ ...base, viewCount: 11 }, base)).toBe(true);
    expect(countsChanged({ ...base, checkedAt: 'much later' }, base)).toBe(false);
  });
});

describe('refreshYoutubeViews', () => {
  it('stores the counts it was given', async () => {
    const a = row('a', 'https://www.youtube.com/shorts/O5iftogeVHg');
    mockFindAll.mockResolvedValue([a]);
    mockFetch.mockResolvedValue(new Map([['O5iftogeVHg', { videoId: 'O5iftogeVHg', viewCount: 1448, likeCount: 64 }]]));

    const summary = await refreshYoutubeViews(new Date('2026-11-25T18:00:00Z'));

    expect(summary).toMatchObject({ considered: 1, requested: 1, answered: 1, updated: 1, unanswered: 0 });
    expect((a.metadata as Record<string, unknown>).youtube).toEqual({
      videoId: 'O5iftogeVHg', viewCount: 1448, likeCount: 64, checkedAt: '2026-11-25T18:00:00.000Z',
    });
  });

  it('is idempotent: a second run leaves the same counts and reports no change', async () => {
    const a = row('a', 'https://youtu.be/O5iftogeVHg');
    mockFindAll.mockResolvedValue([a]);
    mockFetch.mockResolvedValue(new Map([['O5iftogeVHg', { videoId: 'O5iftogeVHg', viewCount: 1448, likeCount: 64 }]]));

    await refreshYoutubeViews(new Date('2026-11-25T18:00:00Z'));
    const afterFirst = JSON.parse(JSON.stringify((a.metadata as Record<string, unknown>).youtube));

    const second = await refreshYoutubeViews(new Date('2026-11-25T19:00:00Z'));

    const now = (a.metadata as Record<string, Record<string, unknown>>).youtube;
    expect(second.updated).toBe(0);
    expect(now.viewCount).toBe(afterFirst.viewCount);
    expect(now.likeCount).toBe(afterFirst.likeCount);
    // Only the measurement time advances, which is the point of a refresh.
    expect(now.checkedAt).toBe('2026-11-25T19:00:00.000Z');
  });

  it('skips a link that is not YouTube rather than guessing an id', async () => {
    mockFindAll.mockResolvedValue([row('a', 'https://vimeo.com/999')]);
    const summary = await refreshYoutubeViews();
    expect(summary.considered).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('counts a video YouTube would not answer for, and writes nothing for it', async () => {
    const a = row('a', 'https://youtu.be/O5iftogeVHg');
    mockFindAll.mockResolvedValue([a]);
    mockFetch.mockResolvedValue(new Map());

    const summary = await refreshYoutubeViews();

    expect(summary).toMatchObject({ answered: 0, unanswered: 1, updated: 0 });
    expect(a.update).not.toHaveBeenCalled();
    expect(a.metadata).toBeNull();
  });

  it('asks about the same video once even when two assets link to it', async () => {
    const a = row('a', 'https://youtu.be/O5iftogeVHg');
    const b = row('b', 'https://www.youtube.com/watch?v=O5iftogeVHg');
    mockFindAll.mockResolvedValue([a, b]);
    mockFetch.mockResolvedValue(new Map([['O5iftogeVHg', { videoId: 'O5iftogeVHg', viewCount: 5, likeCount: 0 }]]));

    const summary = await refreshYoutubeViews();

    expect(mockFetch.mock.calls[0][0]).toEqual(['O5iftogeVHg']);
    expect(summary).toMatchObject({ considered: 2, requested: 1, updated: 2 });
  });

  it('leaves the previous counts readable when YouTube fails', async () => {
    const existing = { videoId: 'O5iftogeVHg', viewCount: 100, likeCount: 2, checkedAt: 'yesterday' };
    const a = row('a', 'https://youtu.be/O5iftogeVHg', { youtube: existing });
    mockFindAll.mockResolvedValue([a]);
    mockFetch.mockRejectedValue(new Error('upstream down'));

    await expect(refreshYoutubeViews()).rejects.toThrow('upstream down');

    expect((a.metadata as Record<string, unknown>).youtube).toEqual(existing);
    expect(a.update).not.toHaveBeenCalled();
  });

  it('does nothing when the library holds no links', async () => {
    mockFindAll.mockResolvedValue([]);
    const summary = await refreshYoutubeViews();
    expect(summary).toMatchObject({ considered: 0, requested: 0 });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
