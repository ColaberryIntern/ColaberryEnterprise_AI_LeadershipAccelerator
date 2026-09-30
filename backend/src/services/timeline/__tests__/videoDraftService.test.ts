/**
 * videoDraftService — duration-accuracy tests. Only `resolveVideo` (real duration
 * lookup) and `deriveEstimatedTime` (pure decision logic) are exercised here: the
 * rest of generateVideoDraft's pipeline (Sequelize CurriculumTypeDefinition lookup,
 * OpenAI text generation, blueprint context) is unrelated to the duration fix and
 * already outside this run's scope.
 */
jest.mock('../../composer/youtubeClient', () => ({
  getVideoDurationSeconds: jest.fn(),
}));

import { resolveVideo, deriveEstimatedTime, youtubeId } from '../videoDraftService';
import { getVideoDurationSeconds } from '../../composer/youtubeClient';

const mockGetDuration = getVideoDurationSeconds as jest.Mock;

function jsonResponse(payload: unknown, ok = true): Response {
  return { ok, json: async () => payload } as unknown as Response;
}

describe('deriveEstimatedTime', () => {
  it('prefers the real duration, rounded to whole minutes', () => {
    expect(deriveEstimatedTime(402, 12)).toBe(7);   // 6:42 -> 7 min, not the LLM's 12
    expect(deriveEstimatedTime(600, 3)).toBe(10);
  });
  it('never rounds down to zero for a very short real video', () => {
    expect(deriveEstimatedTime(20, 12)).toBe(1);    // 20s rounds to 0 min -> floored to 1
  });
  it('falls back to the LLM guess when no real duration is known', () => {
    expect(deriveEstimatedTime(null, 12)).toBe(12);
  });
});

describe('resolveVideo', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    mockGetDuration.mockReset();
  });

  it('happy path: a provided YouTube URL gets its real duration attached', async () => {
    mockGetDuration.mockResolvedValue(402);
    jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ title: 'Agentic Loops Explained', author_name: 'Anthropic', thumbnail_url: 'https://img/thumb.jpg' }),
    );
    const rv = await resolveVideo('ignored', 'https://youtu.be/abc12345678', 'gpt');
    expect(rv.duration_seconds).toBe(402);
    expect(rv.verified).toBe(true);
    expect(mockGetDuration).toHaveBeenCalledWith('abc12345678');
  });

  it('failure path: oEmbed resolves but the duration API is unavailable — verified stays true, duration null', async () => {
    mockGetDuration.mockResolvedValue(null);
    jest.spyOn(global, 'fetch').mockResolvedValue(
      jsonResponse({ title: 'A Video', author_name: 'Someone', thumbnail_url: 'https://img/thumb.jpg' }),
    );
    const rv = await resolveVideo('ignored', 'https://youtu.be/abc12345678', 'gpt');
    expect(rv.duration_seconds).toBeNull();
    expect(rv.verified).toBe(true); // oEmbed still verified the video exists
  });

  it('non-YouTube provided URL: no duration lookup is attempted', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(null, false));
    const rv = await resolveVideo('ignored', 'https://vimeo.com/123456', 'gpt');
    expect(rv.duration_seconds).toBeNull();
    expect(mockGetDuration).not.toHaveBeenCalled();
  });

  it('dead/unresolvable provided URL: oEmbed AND the duration API both agree it is gone', async () => {
    mockGetDuration.mockResolvedValue(null); // same underlying video, same "not found" outcome
    jest.spyOn(global, 'fetch').mockResolvedValue(jsonResponse(null, false));
    const rv = await resolveVideo('ignored', 'https://youtu.be/deaddeaddea', 'gpt');
    expect(rv.verified).toBe(false);
    expect(rv.duration_seconds).toBeNull();
  });
});

describe('youtubeId (regression guard for the duration lookup)', () => {
  it('extracts the 11-char id from common URL shapes', () => {
    expect(youtubeId('https://youtu.be/abc12345678')).toBe('abc12345678');
    expect(youtubeId('https://www.youtube.com/watch?v=abc12345678')).toBe('abc12345678');
    expect(youtubeId('https://vimeo.com/123456')).toBeNull();
  });
});
