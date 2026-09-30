/**
 * How the rails compose — which appear, which are hidden, and what happens when
 * one of them falls over.
 *
 * The individual resolvers are tested against their own data sources elsewhere.
 * What this file guards is the set of rules that make the classroom safe to add
 * seven live surfaces to: a rail that cannot answer is absent rather than empty,
 * a rail that throws takes only itself down, and no failure anywhere empties the
 * week. Those are the properties that decide whether this feature can ship into
 * a page every student sees every day.
 */
jest.mock('../eventsRail', () => ({ resolveEventsRail: jest.fn() }));
jest.mock('../projectRail', () => ({ resolveProjectRail: jest.fn() }));
jest.mock('../communityRail', () => ({ resolveCommunityRail: jest.fn() }));
jest.mock('../roomsRail', () => ({ resolveRoomsRail: jest.fn() }));
jest.mock('../certPrepRail', () => ({ resolveCertPrepRail: jest.fn() }));
jest.mock('../portfolioRail', () => ({ resolvePortfolioRail: jest.fn() }));
jest.mock('../timelineRail', () => ({ resolveTimelineRail: jest.fn() }));

import { getClassroomRails } from '../index';
import { omitIfEmpty, Rail, RailContext } from '../types';
import { resolveEventsRail } from '../eventsRail';
import { resolveProjectRail } from '../projectRail';
import { resolveCommunityRail } from '../communityRail';
import { resolveRoomsRail } from '../roomsRail';
import { resolveCertPrepRail } from '../certPrepRail';
import { resolvePortfolioRail } from '../portfolioRail';
import { resolveTimelineRail } from '../timelineRail';

const mEvents = resolveEventsRail as unknown as jest.Mock;
const mProject = resolveProjectRail as unknown as jest.Mock;
const mCommunity = resolveCommunityRail as unknown as jest.Mock;
const mRooms = resolveRoomsRail as unknown as jest.Mock;
const mCert = resolveCertPrepRail as unknown as jest.Mock;
const mPortfolio = resolvePortfolioRail as unknown as jest.Mock;
const mTimeline = resolveTimelineRail as unknown as jest.Mock;

const ALL = [mEvents, mProject, mCommunity, mRooms, mCert, mPortfolio, mTimeline];

const ctx: RailContext = { enrollmentId: 'e1', cohortId: 'c1', week: 7, isStaff: false };

const railOf = (surface: string, tiles = 1): Rail => ({
  surface: surface as Rail['surface'],
  label: surface,
  count_label: null,
  href: `/portal/${surface}`,
  tiles: Array.from({ length: tiles }, (_, i) => ({
    id: `${surface}-${i}`, title: 't', detail: null, meta: null,
    image_url: null, glyph: null, stamp: null, action: null,
  })),
});

beforeEach(() => {
  jest.clearAllMocks();
  ALL.forEach((m) => m.mockResolvedValue(null));
  // Silence the deliberate console.error in the degrade path.
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => { (console.error as unknown as jest.Mock).mockRestore?.(); });

describe('what appears', () => {
  it('returns only the rails that resolved to something', async () => {
    mEvents.mockResolvedValue(railOf('events'));
    mCert.mockResolvedValue(railOf('cert_prep'));
    const result = await getClassroomRails(ctx);
    expect(result.rails.map((r) => r.surface)).toEqual(['events', 'cert_prep']);
  });

  it('keeps the product order, not the order they finished in', async () => {
    // Timeline resolves instantly, events slowly. Render order must not depend
    // on which database answered first.
    mTimeline.mockResolvedValue(railOf('timeline'));
    mEvents.mockImplementation(() => new Promise((r) => setTimeout(() => r(railOf('events')), 20)));
    mProject.mockResolvedValue(railOf('project'));
    const result = await getClassroomRails(ctx);
    expect(result.rails.map((r) => r.surface)).toEqual(['events', 'project', 'timeline']);
  });

  it('carries the week through, so the page knows what it asked for', async () => {
    const result = await getClassroomRails({ ...ctx, week: 3 });
    expect(result.week).toBe(3);
  });
});

describe('what stays hidden', () => {
  it('a resolver returning null contributes no rail at all', async () => {
    // No project, before the fence, Rooms flag off -- all the same shape.
    const result = await getClassroomRails(ctx);
    expect(result.rails).toEqual([]);
    expect(result.degraded).toEqual([]);
  });

  it('NEVER renders an empty rail -- an empty shelf teaches a student to skip it', async () => {
    expect(omitIfEmpty(railOf('community', 0))).toBeNull();
    expect(omitIfEmpty(railOf('community', 1))).not.toBeNull();
  });

  it('an absent rail is not the same as a broken one', async () => {
    mRooms.mockResolvedValue(null);
    mCommunity.mockRejectedValue(new Error('community is down'));
    const result = await getClassroomRails(ctx);
    expect(result.degraded).toEqual(['community']);   // rooms is absent, not degraded
  });
});

describe('one failure never empties the week', () => {
  it('a throwing rail degrades itself and nothing else', async () => {
    mEvents.mockResolvedValue(railOf('events'));
    mRooms.mockRejectedValue(new Error('rooms exploded'));
    mCert.mockResolvedValue(railOf('cert_prep'));
    const result = await getClassroomRails(ctx);
    expect(result.rails.map((r) => r.surface)).toEqual(['events', 'cert_prep']);
    expect(result.degraded).toEqual(['rooms']);
  });

  it('every rail failing still resolves, with all of them named', async () => {
    ALL.forEach((m) => m.mockRejectedValue(new Error('everything is down')));
    const result = await getClassroomRails(ctx);
    expect(result.rails).toEqual([]);
    expect(result.degraded).toHaveLength(7);
    expect(result.degraded).toContain('timeline');
  });

  it('does not reject -- the caller must never have to catch this', async () => {
    ALL.forEach((m) => m.mockRejectedValue(new Error('boom')));
    await expect(getClassroomRails(ctx)).resolves.toBeDefined();
  });

  it('logs the surface that failed, so a silent rail is a countable one', async () => {
    mRooms.mockRejectedValue(new Error('rooms exploded'));
    await getClassroomRails(ctx);
    expect(console.error).toHaveBeenCalledWith(
      '[classroom] rail failed',
      expect.objectContaining({ surface: 'rooms' }),
    );
  });
});
