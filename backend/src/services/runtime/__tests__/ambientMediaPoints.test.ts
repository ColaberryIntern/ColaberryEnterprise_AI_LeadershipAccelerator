/**
 * Listen-to-earn: the reward table and the serve-time stamp.
 *
 * On production, 5,628 podcast and 2,988 testimonial placements across 201
 * students earned nothing (Ali, 2026-09-11) — they are ambient items with no
 * card row, invisible to the card watch gate. These pin the numbers Ali set
 * and the stamp that puts them on every served item, including the thousands
 * already frozen with `points: {}`.
 */
import {
  AMBIENT_MEDIA_POINTS, AMBIENT_MEDIA_REQUIRED_PCT, isAmbientMediaKind, mediaRef, stampAmbientMediaPoints,
} from '../ambientMediaPoints';

describe('the reward table', () => {
  it('pays what Ali set: 35 for a podcast, 10 for a testimonial', () => {
    expect(AMBIENT_MEDIA_POINTS.podcast).toBe(35);
    expect(AMBIENT_MEDIA_POINTS.testimonial).toBe(10);
  });

  it('uses the same 75% bar as a video', () => {
    expect(AMBIENT_MEDIA_REQUIRED_PCT).toBe(0.75);
  });

  it('recognises exactly the two ambient media kinds', () => {
    expect(isAmbientMediaKind('podcast')).toBe(true);
    expect(isAmbientMediaKind('testimonial')).toBe(true);
    expect(isAmbientMediaKind('blog')).toBe(false);
    expect(isAmbientMediaKind('card')).toBe(false);
    expect(isAmbientMediaKind('')).toBe(false);
  });

  it('builds the ref the feed uses, which is also the award idempotency key', () => {
    expect(mediaRef('podcast', 'ep-42')).toBe('podcast:ep-42');
  });
});

describe('stampAmbientMediaPoints', () => {
  it('gives a FROZEN podcast item its reward — the snapshot trap, closed', () => {
    const items: any[] = [{ ref: 'podcast:ep-1', type: 'podcast', points: {} }];
    stampAmbientMediaPoints(items);
    expect(items[0].points).toEqual({ learning: 35 });
  });

  it('gives a testimonial its own, smaller reward', () => {
    const items: any[] = [{ ref: 'testimonial:t-9', type: 'testimonial' }];
    stampAmbientMediaPoints(items);
    expect(items[0].points).toEqual({ learning: 10 });
  });

  it('leaves every other item exactly as it was', () => {
    const card = { ref: 'card:c1', type: 'warmup', points: { learning: 5 } };
    const blog = { ref: 'blog:b1', type: 'blog', points: { learning: 10 } };
    const post = { ref: 'community:p1', type: 'community_discussion', points: {} };
    const items = [card, blog, post];
    stampAmbientMediaPoints(items);
    expect(items).toEqual([
      { ref: 'card:c1', type: 'warmup', points: { learning: 5 } },
      { ref: 'blog:b1', type: 'blog', points: { learning: 10 } },
      { ref: 'community:p1', type: 'community_discussion', points: {} },
    ]);
  });

  it('is idempotent and never accumulates', () => {
    const items: any[] = [{ ref: 'podcast:ep-1', type: 'podcast' }];
    stampAmbientMediaPoints(items);
    stampAmbientMediaPoints(items);
    expect(items[0].points).toEqual({ learning: 35 });
  });

  it('tolerates junk without throwing', () => {
    expect(() => stampAmbientMediaPoints([{}, { ref: null } as any, { ref: 'podcast:x', points: 'bad' } as any])).not.toThrow();
  });
});
