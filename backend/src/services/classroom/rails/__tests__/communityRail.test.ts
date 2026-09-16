/**
 * "From the community" — the tile is somebody's WORDS, not a picture.
 *
 * Ali, 2026-09-13, looking at the rail in the Classroom: *"I don't like the
 * pictures/images. What can we replace this with"*. The measurement that
 * answered it: `image_url` was the member's avatar, and **0 of 268 community
 * members on production have one**, so the slot could only ever render the
 * grey speech-bubble glyph — on every tile, every time, by construction.
 *
 * He chose words over the three picture options (ritual banner art, a big
 * initials avatar, the poster's own photo), because every picture option
 * repeats across tiles — 19 of 58 ritual posts on production are Roll Call, so
 * a six-tile row would have shown the same banner three times — while the words
 * are different on every tile.
 *
 * These tests pin that: no picture is offered, the ritual heading becomes a
 * pill instead of being printed inside the quote, and the person is named.
 */
const mockListPosts = jest.fn();
jest.mock('../../../communityService', () => ({ listPosts: (...a: any[]) => mockListPosts(...a) }));

import { resolveCommunityRail } from '../communityRail';
import type { RailContext } from '../types';

const CTX: RailContext = { enrollmentId: 'enr-1', cohortId: 'coh-1', week: 7, isStaff: false };

const post = (over: Partial<any> = {}) => ({
  id: 'p1',
  body: '👋 Roll Call · Week 7\n\nWho I am: Farhat, eight years in supply chain\n\nWhat I want to build: the agent I wish I had had',
  comment_count: 4, like_count: 6, pinned: false, locked: false,
  member: { id: 'm1', display_name: 'Farhat Beig', avatar_url: null, level: 1 },
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockListPosts.mockResolvedValue({ posts: [post()] });
});

describe('no picture is offered at all', () => {
  it('sends no image and no glyph — the slot that could only ever be grey is gone', async () => {
    const rail = (await resolveCommunityRail(CTX))!;
    expect(rail.tiles[0].image_url).toBeNull();
    expect(rail.tiles[0].glyph).toBeNull();
  });

  it('does not fall back to an avatar even when the member somehow has one', async () => {
    mockListPosts.mockResolvedValue({ posts: [post({ member: { id: 'm1', display_name: 'Farhat Beig', avatar_url: 'https://x/a.png', level: 1 } })] });
    const rail = (await resolveCommunityRail(CTX))!;
    // The picture is not what the tile is FOR. The avatar still travels on
    // `person`, where the byline can use it.
    expect(rail.tiles[0].image_url).toBeNull();
    expect(rail.tiles[0].person?.avatar_url).toBe('https://x/a.png');
  });
});

describe('the words are the tile', () => {
  it('quotes what the student wrote, with the ritual heading lifted into a pill', async () => {
    const rail = (await resolveCommunityRail(CTX))!;
    const t = rail.tiles[0];
    expect(t.eyebrow).toBe('👋 Roll Call · Week 7');
    expect(t.title).toContain('Who I am: Farhat, eight years in supply chain');
    // The heading must not be printed twice — the duplication Ali flagged on the
    // drawer header (#2426) and the Today tile (#2502).
    expect(t.title).not.toContain('Roll Call');
    expect(t.detail).toBeNull();   // one field for the words, not a headline + body
  });

  it('handles a free-text post: no pill, the body itself is the quote', async () => {
    mockListPosts.mockResolvedValue({ posts: [post({ body: 'Shoutout to everyone grinding through this cohort right now.' })] });
    const rail = (await resolveCommunityRail(CTX))!;
    expect(rail.tiles[0].eyebrow).toBeNull();
    expect(rail.tiles[0].title).toBe('Shoutout to everyone grinding through this cohort right now.');
  });

  it('gives the words room now that the picture is gone — long posts truncate at the new length', async () => {
    const long = `👋 Roll Call · Week 7\n\n${'word '.repeat(120)}`;
    mockListPosts.mockResolvedValue({ posts: [post({ body: long })] });
    const t = (await resolveCommunityRail(CTX))!.tiles[0];
    expect(t.title.length).toBeGreaterThan(200);   // was capped at 120 when a picture took the space
    expect(t.title.endsWith('…')).toBe(true);
  });

  it('never renders an empty tile when a post is only a heading', async () => {
    mockListPosts.mockResolvedValue({ posts: [post({ body: '👋 Roll Call · Week 7' })] });
    const t = (await resolveCommunityRail(CTX))!.tiles[0];
    expect(t.title).toBe('A post from your cohort');
  });
});

describe('who said it, and what replying pays', () => {
  it('names the person and their level', async () => {
    const t = (await resolveCommunityRail(CTX))!.tiles[0];
    expect(t.person).toEqual({ name: 'Farhat Beig', level: 1, avatar_url: null });
  });

  it('falls back to a neutral name rather than a blank byline', async () => {
    mockListPosts.mockResolvedValue({ posts: [post({ member: undefined })] });
    expect((await resolveCommunityRail(CTX))!.tiles[0].person?.name).toBe('Someone in your cohort');
  });

  it('says what a reply earns, the way the Today tile does', async () => {
    const t = (await resolveCommunityRail(CTX))!.tiles[0];
    expect(t.action?.label).toBe('Reply · +2 pts');
    expect(t.action?.href).toBe('/portal/community?post=p1#reply');
  });
});

describe('the rules this rail already had still hold', () => {
  it('drops locked posts rather than teasing them', async () => {
    mockListPosts.mockResolvedValue({ posts: [post({ id: 'locked', locked: true }), post({ id: 'open' })] });
    const rail = (await resolveCommunityRail(CTX))!;
    expect(rail.tiles.map((t) => t.id)).toEqual(['open']);
  });

  it('keeps the PINNED stamp, and caps the rail at six tiles', async () => {
    mockListPosts.mockResolvedValue({ posts: Array.from({ length: 9 }, (_, i) => post({ id: `p${i}`, pinned: i === 0 })) });
    const rail = (await resolveCommunityRail(CTX))!;
    expect(rail.tiles).toHaveLength(6);
    expect(rail.tiles[0].stamp).toBe('PINNED');
    expect(rail.count_label).toBe('6 recent');
  });

  it('is omitted entirely when there is nothing to show', async () => {
    mockListPosts.mockResolvedValue({ posts: [] });
    expect(await resolveCommunityRail(CTX)).toBeNull();
  });
});
