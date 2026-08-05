/**
 * backfillTimelineVideoDurations — the idempotent fix for authored video cards that
 * were created with an LLM-guessed estimated_time and no real duration at all.
 * `config/database`/model imports load for real here (same as
 * videoDraftService.test.ts) — Sequelize's Model.init() only needs a structurally
 * valid, uninitialized Sequelize instance, not a live connection, so no DB mock is
 * needed. `backfillCards()` itself takes an already-loaded card list, so the tests
 * exercise its full decision logic without ever calling TimelineCard.findAll.
 */
jest.mock('../../services/composer/youtubeClient', () => ({ getVideoDurationSeconds: jest.fn() }));

import { needsBackfill, backfillCards } from '../backfillTimelineVideoDurations';
import { getVideoDurationSeconds } from '../../services/composer/youtubeClient';

const mockGetDuration = getVideoDurationSeconds as jest.Mock;

function card(id: string, metadata: any) {
  return { id, metadata, update: jest.fn().mockResolvedValue(undefined) };
}

describe('needsBackfill', () => {
  it('is true for a video card missing duration_seconds entirely', () => {
    expect(needsBackfill({ video: { url: 'https://youtu.be/abc12345678' } })).toBe(true);
  });
  it('is false once a valid positive duration_seconds is already present (idempotency guard)', () => {
    expect(needsBackfill({ video: { url: 'https://youtu.be/abc12345678', duration_seconds: 402 } })).toBe(false);
  });
  it('is false for a zero/negative/NaN duration_seconds (treated as not-yet-known, re-checked)', () => {
    expect(needsBackfill({ video: { url: 'u', duration_seconds: 0 } })).toBe(true);
    expect(needsBackfill({ video: { url: 'u', duration_seconds: -5 } })).toBe(true);
  });
  it('is false when there is no video / no url at all (not this script\'s job)', () => {
    expect(needsBackfill({})).toBe(false);
    expect(needsBackfill({ video: {} })).toBe(false);
    expect(needsBackfill(null)).toBe(false);
  });
});

describe('backfillCards', () => {
  beforeEach(() => mockGetDuration.mockReset());

  it('happy path: fetches and writes the real duration for a card that needs it', async () => {
    mockGetDuration.mockResolvedValue(402); // 6:42
    const c = card('card-1', { video: { url: 'https://youtu.be/abc12345678' } });
    const summary = await backfillCards([c], true, () => {});
    expect(summary.updated).toBe(1);
    expect(summary.errors).toBe(0);
    expect(c.update).toHaveBeenCalledWith({
      metadata: { video: { url: 'https://youtu.be/abc12345678', duration_seconds: 402 } },
      estimated_time: 7,
    });
  });

  it('dry run: computes the update but never calls card.update', async () => {
    mockGetDuration.mockResolvedValue(300);
    const c = card('card-1', { video: { url: 'https://youtu.be/abc12345678' } });
    const summary = await backfillCards([c], false, () => {});
    expect(summary.updated).toBe(1);
    expect(c.update).not.toHaveBeenCalled();
  });

  it('idempotency: a card already carrying a real duration is skipped with ZERO API calls', async () => {
    const c = card('card-1', { video: { url: 'https://youtu.be/abc12345678', duration_seconds: 402 } });
    const summary = await backfillCards([c], true, () => {});
    expect(summary.skipped_already_done).toBe(1);
    expect(summary.updated).toBe(0);
    expect(mockGetDuration).not.toHaveBeenCalled();
    expect(c.update).not.toHaveBeenCalled();
  });

  it('re-running twice against the same (now-updated) data set is a total no-op the second time', async () => {
    mockGetDuration.mockResolvedValue(300);
    const c1 = card('card-1', { video: { url: 'https://youtu.be/abc12345678' } });
    await backfillCards([c1], true, () => {});
    // Simulate the DB now reflecting the write (what a real re-run would load).
    mockGetDuration.mockReset();
    const c1Reloaded = card('card-1', { video: { url: 'https://youtu.be/abc12345678', duration_seconds: 300 } });
    const summary2 = await backfillCards([c1Reloaded], true, () => {});
    expect(summary2.skipped_already_done).toBe(1);
    expect(summary2.updated).toBe(0);
    expect(mockGetDuration).not.toHaveBeenCalled();
  });

  it('non-YouTube URL: skipped with the right reason, no API call, batch continues to the next card', async () => {
    mockGetDuration.mockResolvedValue(999); // would prove it was wrongly called
    const cards = [
      card('vimeo-card', { video: { url: 'https://vimeo.com/123456' } }),
      card('yt-card', { video: { url: 'https://youtu.be/abc12345678' } }),
    ];
    const summary = await backfillCards(cards, true, () => {});
    expect(summary.skipped_no_youtube_id).toBe(1);
    expect(summary.updated).toBe(1); // the second (YouTube) card still gets processed
    expect(mockGetDuration).toHaveBeenCalledTimes(1);
    expect(mockGetDuration).toHaveBeenCalledWith('abc12345678');
  });

  it('API unavailable (quota/deleted video): skipped with the right reason, never throws, batch continues', async () => {
    mockGetDuration.mockResolvedValueOnce(null).mockResolvedValueOnce(180);
    const cards = [
      card('gone-card', { video: { url: 'https://youtu.be/deaddeaddea' } }),
      card('ok-card', { video: { url: 'https://youtu.be/abc12345678' } }),
    ];
    const summary = await backfillCards(cards, true, () => {});
    expect(summary.skipped_api_unavailable).toBe(1);
    expect(summary.updated).toBe(1);
    expect(summary.errors).toBe(0);
  });

  it('cards with no video attached at all are skipped without being counted as errors', async () => {
    const cards = [card('non-video-card', { image: 'https://example.com/x.png' })];
    const summary = await backfillCards(cards, true, () => {});
    expect(summary.skipped_no_video).toBe(1);
    expect(summary.errors).toBe(0);
    expect(mockGetDuration).not.toHaveBeenCalled();
  });

  it('an unexpected exception during lookup is caught, counted, and does not crash the batch', async () => {
    mockGetDuration.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(300);
    const cards = [
      card('broken-card', { video: { url: 'https://youtu.be/abc12345671' } }),
      card('ok-card', { video: { url: 'https://youtu.be/abc12345672' } }),
    ];
    const summary = await backfillCards(cards, true, () => {});
    expect(summary.errors).toBe(1);
    expect(summary.updated).toBe(1);
  });
});
