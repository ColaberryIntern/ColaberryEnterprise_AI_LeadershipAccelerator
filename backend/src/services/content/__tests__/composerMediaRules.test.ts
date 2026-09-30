/**
 * Per-attachment rules in composerValidation - the numbers the upload recorded, held against
 * each network's table entry. Every case pins a real number from providerCapabilities so an
 * edit to the table fails a test here rather than silently changing what publishes.
 */

import { validateVariant, matchesAspect, type MediaFacts, type VariantContext } from '../composerValidation';
import type { Variant } from '../composerVariants';

const NOW = new Date('2026-09-15T20:00:00Z').getTime();

function v(provider: Variant['provider']): Variant {
  return { provider, text: 'A clip from class.', source: 'generated', canonicalFingerprint: 'x', stale: false };
}
function ctx(media: MediaFacts[], contentType: VariantContext['contentType'] = 'video'): VariantContext {
  return { contentType, mediaCount: media.length, media, links: [] };
}
const media = (p: Variant['provider'], m: MediaFacts[]) => validateVariant(v(p), ctx(m), NOW).problems.filter((x) => x.field === 'media');

const goodClip: MediaFacts = { mimeType: 'video/mp4', byteSize: 40 * 1024 * 1024, width: 1080, height: 1920, durationMs: 45_000, codecFamily: 'h264' };

describe('video against a network', () => {
  it('a 45 s 1080x1920 H.264 clip passes LinkedIn, Instagram, TikTok and X', () => {
    for (const p of ['linkedin_member', 'meta_instagram', 'tiktok', 'x'] as const) {
      expect(media(p, [goodClip])).toEqual([]);
    }
  });

  it('too long: X allows 140 s', () => {
    const [p] = media('x', [{ ...goodClip, durationMs: 150_000 }]);
    expect(p).toMatchObject({ severity: 'block' });
    expect(p.message).toBe('X: video is 2m 30s, limit 2m 20s.');
  });

  it('too long: LinkedIn allows 10 min, a 12-minute clip is blocked', () => {
    const [p] = media('linkedin_member', [{ ...goodClip, durationMs: 12 * 60_000 }]);
    expect(p.message).toMatch(/12m 0s, limit 10m 0s/);
  });

  it('too big: LinkedIn allows 200 MB', () => {
    const [p] = media('linkedin_member', [{ ...goodClip, byteSize: 201 * 1024 * 1024 }]);
    expect(p.message).toBe('LinkedIn (personal profile): video is 201.0 MB, limit 200 MB.');
  });

  it('wrong codec: an iPhone HEVC clip is blocked on LinkedIn with the fix, and accepted on TikTok', () => {
    const [p] = media('linkedin_member', [{ ...goodClip, codecFamily: 'h265' }]);
    expect(p).toMatchObject({ severity: 'block' });
    expect(p.message).toMatch(/video is H265; accepted: H264\. Re-export as H\.264 MP4\./);
    expect(media('tiktok', [{ ...goodClip, codecFamily: 'h265' }])).toEqual([]);
  });

  it('wrong aspect is a WARNING, not a block: TikTok wants 9:16, a landscape clip will be letterboxed', () => {
    const [p] = media('tiktok', [{ ...goodClip, width: 1920, height: 1080 }]);
    expect(p).toMatchObject({ severity: 'warn' });
    expect(p.message).toMatch(/1920x1080; expected 9:16/);
  });

  it('a network with no rule for that KIND blocks: YouTube takes no images', () => {
    // Every provider in the table takes video, so the branch is exercised through the kind the
    // table actually lacks. An earlier draft of this test searched for a video-less provider and
    // returned early when none existed - a green tick that asserted nothing. Never again.
    const image: MediaFacts = { mimeType: 'image/png', byteSize: 1000, width: 1200, height: 628, durationMs: null, codecFamily: null };
    const problems = validateVariant(v('youtube'), ctx([image], 'image'), NOW).problems.filter((x) => x.field === 'media');
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ severity: 'block', message: 'YouTube does not accept images.' });
  });

  it('unknown facts are skipped, not failed: an older row with no duration raises nothing', () => {
    expect(media('x', [{ ...goodClip, durationMs: null, codecFamily: null, byteSize: null, width: null, height: null }])).toEqual([]);
  });
});

describe('image against a network', () => {
  const goodImage: MediaFacts = { mimeType: 'image/png', byteSize: 2 * 1024 * 1024, width: 1200, height: 628, durationMs: null, codecFamily: null };

  it('passes LinkedIn', () => {
    expect(validateVariant(v('linkedin_member'), ctx([goodImage], 'image'), NOW).problems.filter((x) => x.field === 'media')).toEqual([]);
  });

  it('too narrow: LinkedIn wants 552px, a 400px image is blocked', () => {
    const [p] = validateVariant(v('linkedin_member'), ctx([{ ...goodImage, width: 400 }], 'image'), NOW).problems.filter((x) => x.field === 'media');
    expect(p.message).toBe('LinkedIn (personal profile): image is 400px wide, minimum 552px.');
  });

  it('too big: Facebook allows 4 MB', () => {
    const [p] = validateVariant(v('meta_facebook_page'), ctx([{ ...goodImage, byteSize: 5 * 1024 * 1024 }], 'image'), NOW).problems.filter((x) => x.field === 'media');
    expect(p.message).toMatch(/image is 5\.0 MB, limit 4 MB/);
  });
});

describe('matchesAspect', () => {
  it('accepts exact and near ratios, refuses the rest', () => {
    expect(matchesAspect(1080, 1920, ['9:16'])).toBe(true);
    expect(matchesAspect(1080, 1349, ['4:5'])).toBe(true);     // encoder rounding
    expect(matchesAspect(1200, 628, ['1.91:1'])).toBe(true);
    expect(matchesAspect(1920, 1080, ['9:16', '1:1'])).toBe(false);
    expect(matchesAspect(1000, 1000, ['garbage'])).toBe(false);
  });
});
