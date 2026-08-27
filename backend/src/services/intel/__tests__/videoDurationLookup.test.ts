/**
 * videoDurationLookup — the pure helpers and the fail-soft lookup contract.
 *
 * The behaviour under test is the denominator of the 75%-watched completion
 * gate, so the cases that matter most are the ones where we CANNOT read a
 * length: every one of them must yield null (fall back), never 0 (which
 * watchProgressMath reads as "unmeasurable, pass the student") and never a
 * guess (which is what gated 11 production cards at an unreachable bar).
 */
import { parseIso8601Duration, ApiVideo, VideoApiClient } from '../../curriculumHealth/videoLinkApiClient';
import {
  youtubeIdFromUrl,
  estimatedMinutesFor,
  resolveVideoDurationSeconds,
  resolveCardTiming,
  FALLBACK_ESTIMATED_MINUTES,
} from '../videoDurationLookup';

const apiVideo = (id: string, durationSeconds: number | null): ApiVideo => ({
  id,
  privacyStatus: 'public',
  uploadStatus: 'processed',
  embeddable: true,
  channelTitle: 'Test',
  channelId: 'UC0',
  regionAllowed: null,
  regionBlocked: null,
  ytRating: null,
  durationSeconds,
});

const okClient = (found: Map<string, ApiVideo>): VideoApiClient => ({
  lookup: async (ids) => ({ ok: true, found, requested: ids, complete: true, quotaUnits: 1 }),
  quotaUnits: () => 1,
});

describe('parseIso8601Duration', () => {
  it('reads the shapes YouTube actually returns', () => {
    expect(parseIso8601Duration('PT7M58S')).toBe(478);   // Swati's video, 7:58
    expect(parseIso8601Duration('PT6S')).toBe(6);
    expect(parseIso8601Duration('PT1H2M3S')).toBe(3723);
    expect(parseIso8601Duration('PT3H11M78S')).toBe(11538);
    expect(parseIso8601Duration('PT34M')).toBe(2040);
    expect(parseIso8601Duration('P1DT2H')).toBe(93600);
  });

  it('returns null, never 0, for anything unreadable', () => {
    // 0 would be read by watchProgressMath as "unmeasurable" and fail the gate
    // OPEN, silently completing the card. Absent must stay absent.
    for (const bad of ['', '   ', 'P0D', 'PT0S', 'garbage', 'P', 'PT', null, undefined, 478, {}, []]) {
      expect(parseIso8601Duration(bad as unknown)).toBeNull();
    }
  });

  it('treats a live stream as unknown rather than zero-length', () => {
    expect(parseIso8601Duration('P0D')).toBeNull();
  });
});

describe('youtubeIdFromUrl', () => {
  it('extracts the id from every form we store', () => {
    expect(youtubeIdFromUrl('https://www.youtube.com/watch?v=AqGFDPVsG1A')).toBe('AqGFDPVsG1A');
    expect(youtubeIdFromUrl('https://youtu.be/LPZh9BOjkQs')).toBe('LPZh9BOjkQs');
    expect(youtubeIdFromUrl('https://www.youtube.com/embed/6ipM3b0V3Ss')).toBe('6ipM3b0V3Ss');
    expect(youtubeIdFromUrl('https://www.youtube.com/shorts/x0CkKCyY8TI')).toBe('x0CkKCyY8TI');
    expect(youtubeIdFromUrl('  https://www.youtube.com/watch?a=1&v=KcnIG5i0JPg  ')).toBe('KcnIG5i0JPg');
  });

  it('returns null for non-YouTube and non-video links', () => {
    expect(youtubeIdFromUrl('https://vimeo.com/123456789')).toBeNull();
    expect(youtubeIdFromUrl('https://arxiv.org/abs/2401.12345')).toBeNull();
    expect(youtubeIdFromUrl(null)).toBeNull();
  });
});

describe('estimatedMinutesFor', () => {
  it('never labels a real video as 0 min', () => {
    expect(estimatedMinutesFor(6)).toBe(1);
    expect(estimatedMinutesFor(21)).toBe(1);
    expect(estimatedMinutesFor(478)).toBe(8);
    expect(estimatedMinutesFor(11438)).toBe(191);
  });
});

describe('resolveVideoDurationSeconds — fail-soft in every direction', () => {
  it('returns the true length when the API answers', async () => {
    const found = new Map([['AqGFDPVsG1A', apiVideo('AqGFDPVsG1A', 2571)]]);
    await expect(resolveVideoDurationSeconds('https://www.youtube.com/watch?v=AqGFDPVsG1A', okClient(found)))
      .resolves.toBe(2571);
  });

  it('returns null when the id was NOT returned (private/deleted)', async () => {
    // The absence rule: a missing item is missing, not zero-length.
    await expect(resolveVideoDurationSeconds('https://www.youtube.com/watch?v=AqGFDPVsG1A', okClient(new Map())))
      .resolves.toBeNull();
  });

  it('returns null on quota exhaustion, auth failure and upstream errors', async () => {
    for (const errorClass of ['QuotaExceeded', 'AuthError', 'NotConfigured', 'UpstreamUnavailable'] as const) {
      const client: VideoApiClient = {
        lookup: async () => ({ ok: false, errorClass, detail: 'x', quotaUnits: 0 }),
        quotaUnits: () => 0,
      };
      await expect(resolveVideoDurationSeconds('https://youtu.be/LPZh9BOjkQs', client)).resolves.toBeNull();
    }
  });

  it('never throws when the client throws', async () => {
    const client: VideoApiClient = {
      lookup: async () => { throw new Error('socket hang up'); },
      quotaUnits: () => 0,
    };
    await expect(resolveVideoDurationSeconds('https://youtu.be/LPZh9BOjkQs', client)).resolves.toBeNull();
  });

  it('does not call the API for a non-YouTube URL', async () => {
    const lookup = jest.fn();
    const client = { lookup, quotaUnits: () => 0 } as unknown as VideoApiClient;
    await expect(resolveVideoDurationSeconds('https://vimeo.com/123456789', client)).resolves.toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe('resolveCardTiming — what the ingestion sites actually consume', () => {
  it('stamps duration_seconds so the watch gate has ground truth', async () => {
    const found = new Map([['LPZh9BOjkQs', apiVideo('LPZh9BOjkQs', 478)]]);
    const out = await resolveCardTiming(
      { url: 'https://www.youtube.com/watch?v=LPZh9BOjkQs', title: 'LLMs explained briefly' },
      okClient(found),
    );
    expect(out.estimatedMinutes).toBe(8);
    expect(out.video).toEqual({
      url: 'https://www.youtube.com/watch?v=LPZh9BOjkQs',
      title: 'LLMs explained briefly',
      duration_seconds: 478,
    });
  });

  it('makes a 6-second video completable instead of impossible', async () => {
    // The regression this whole change exists to prevent. Under the old literal
    // `estimated_time: 6`, the gate demanded 270s of a 6s video and the highest
    // reachable score was 2%.
    const found = new Map([['KcnIG5i0JPg', apiVideo('KcnIG5i0JPg', 6)]]);
    const out = await resolveCardTiming(
      { url: 'https://www.youtube.com/watch?v=KcnIG5i0JPg', title: 'Modular AI Agent Skills' },
      okClient(found),
    );
    expect(out.video?.duration_seconds).toBe(6);
    expect(0.75 * (out.video?.duration_seconds ?? 0)).toBeLessThan(6);   // reachable
  });

  it('falls back without a video block at all (article cards)', async () => {
    const out = await resolveCardTiming(null);
    expect(out).toEqual({ estimatedMinutes: FALLBACK_ESTIMATED_MINUTES, video: null });
  });

  it('keeps the video playable but unstamped when the length is unknown', async () => {
    // A card must still be creatable when YouTube is unreachable; it just does
    // not claim a duration it never measured.
    const out = await resolveCardTiming(
      { url: 'https://www.youtube.com/watch?v=LPZh9BOjkQs', title: 'x' },
      okClient(new Map()),
    );
    expect(out.estimatedMinutes).toBe(FALLBACK_ESTIMATED_MINUTES);
    expect(out.video).toEqual({ url: 'https://www.youtube.com/watch?v=LPZh9BOjkQs', title: 'x' });
    expect(out.video).not.toHaveProperty('duration_seconds');
  });

  it('is idempotent — same input, same output', async () => {
    const found = new Map([['LPZh9BOjkQs', apiVideo('LPZh9BOjkQs', 478)]]);
    const block = { url: 'https://youtu.be/LPZh9BOjkQs', title: 't' };
    const a = await resolveCardTiming(block, okClient(found));
    const b = await resolveCardTiming(block, okClient(found));
    expect(a).toEqual(b);
  });
});
