/**
 * Phase 2 T202b — the Week-0 truncation, tested where it happens.
 *
 * WHY THIS SUITE EXISTS, and why it is separate from
 * `services/__tests__/freeAccountBehaviourChanges.test.ts`.
 *
 * T202b gives portal free accounts `enrollment_type: 'explorer'`, which makes
 * `contentEntitlement.isFreePreviewTier` return true for them. That is the
 * PREDICATE. The EFFECT — the thing a learner actually experiences — is one line
 * in this service:
 *
 *   const cards = isFreeTier ? allCards.filter((c) => c.week === 0) : allCards;
 *
 * It contains neither `enrollment_type` nor `tier`, so the generated consumer
 * enumeration cannot see it, and the first version of T202b tested the predicate
 * and deferred the effect to the acceptance scenarios. A verifier checked those
 * scenarios and found none of them covers Week-0 truncation, and that this line
 * was executed by **no test in the repository** — `getFeed` appears in other
 * suites only as a jest mock. So the phase's most visible learner-facing change
 * was going to ship with its predicate tested and its effect untested.
 *
 * This suite drives the real `getFeed` and asserts the cards a learner receives.
 */
const mockIsFreePreviewTier = jest.fn();
jest.mock('../../access/contentEntitlement', () => ({
  isFreePreviewTier: (...a: unknown[]) => mockIsFreePreviewTier(...a),
}));

const mockTimelineCardFindAll = jest.fn();
jest.mock('../../../models/TimelineCard', () => ({
  __esModule: true,
  default: { findAll: (...a: unknown[]) => mockTimelineCardFindAll(...a) },
}));

jest.mock('../../../models/TimelineCardProgress', () => ({
  __esModule: true,
  default: { findAll: jest.fn().mockResolvedValue([]) },
}));

const mockEnrollmentFindByPk = jest.fn();
jest.mock('../../../models/Enrollment', () => ({
  __esModule: true,
  default: { findByPk: (...a: unknown[]) => mockEnrollmentFindByPk(...a) },
}));

jest.mock('../../../models/CurriculumTypeDefinition', () => ({
  __esModule: true,
  default: { findAll: jest.fn().mockResolvedValue([]) },
}));

jest.mock('../timelineGatingService', () => ({
  buildGateContext: jest.fn().mockImplementation(async (allCards: unknown[]) => ({ allCards })),
  evaluateCardLock: jest.fn().mockReturnValue({ locked: false, unmet: [] }),
}));

jest.mock('../typeRegistry', () => ({
  resolve: jest.fn().mockReturnValue({ student_label: 'Lesson', render_band: 'overview' }),
}));

jest.mock('../curriculumScope', () => ({ globalCurriculumWhere: () => ({}) }));
jest.mock('../../runtime/communityRituals', () => ({ ritualStudentLabel: () => 'Lesson' }));
jest.mock('../networkVideoService', () => ({ selectTestimonialForEnrollment: jest.fn().mockResolvedValue(null) }));
jest.mock('../podcastMediaService', () => ({ selectPodcastForEnrollment: jest.fn().mockResolvedValue(null) }));
jest.mock('../blogMediaService', () => ({ selectBlogForEnrollment: jest.fn().mockResolvedValue(null) }));
jest.mock('../../../config/env', () => ({ env: {} }));

import { getFeed } from '../timelineService';

/** One card per week 0..3, so a truncation to week 0 is unmistakable. */
const card = (week: number, n: number) => ({
  id: `card-w${week}-${n}`,
  type: 'lesson',
  title: `Week ${week} card ${n}`,
  subtitle: null,
  description: null,
  week,
  bucket: 'learn',
  order: n,
  difficulty: null,
  estimated_time: null,
  points: 0,
  competencies: null,
  unlock_rules: null,
});

const ALL_CARDS = [card(0, 1), card(0, 2), card(1, 1), card(2, 1), card(3, 1)];

describe('getFeed — the Week-0 curriculum gate (T202b)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnrollmentFindByPk.mockResolvedValue({ id: 'enr-1', cohort_id: null });
    mockTimelineCardFindAll.mockResolvedValue(ALL_CARDS);
  });

  it('a free-preview learner receives ONLY the week 0 cards', async () => {
    mockIsFreePreviewTier.mockResolvedValue(true);

    const feed = await getFeed('enr-1');

    expect(feed.cards.map((c) => c.week)).toEqual([0, 0]);
    expect(feed.cards).toHaveLength(2);
  });

  it('a full member receives every week — the gate is not simply always on', async () => {
    mockIsFreePreviewTier.mockResolvedValue(false);

    const feed = await getFeed('enr-1');

    expect(feed.cards.map((c) => c.week)).toEqual([0, 0, 1, 2, 3]);
    expect(feed.cards).toHaveLength(5);
  });

  it('the two differ, which is the whole behaviour change for population A', async () => {
    mockIsFreePreviewTier.mockResolvedValue(true);
    const gated = await getFeed('enr-1');
    mockIsFreePreviewTier.mockResolvedValue(false);
    const full = await getFeed('enr-1');

    expect(gated.cards.length).toBeLessThan(full.cards.length);
    // Named explicitly: weeks 1-12 are what a portal free account loses when
    // T202b gives it `enrollment_type: 'explorer'`.
    const lostWeeks = full.cards.filter((c) => (c.week ?? 0) > 0).map((c) => c.week);
    expect(lostWeeks).toEqual([1, 2, 3]);
    expect(gated.cards.some((c) => (c.week ?? 0) > 0)).toBe(false);
  });

  it('the gate is decided by isFreePreviewTier for THIS enrollment, not by a card property', async () => {
    mockIsFreePreviewTier.mockResolvedValue(true);

    await getFeed('enr-42');

    expect(mockIsFreePreviewTier).toHaveBeenCalledWith('enr-42');
  });

  it('surfaces the gate to the client as is_explorer, which drives the upsell', async () => {
    mockIsFreePreviewTier.mockResolvedValue(true);
    expect((await getFeed('enr-1')).is_explorer).toBe(true);

    mockIsFreePreviewTier.mockResolvedValue(false);
    expect((await getFeed('enr-1')).is_explorer).toBe(false);
  });

  it('an unknown enrollment gets an empty feed rather than the full curriculum', async () => {
    mockEnrollmentFindByPk.mockResolvedValue(null);

    const feed = await getFeed('nobody');

    expect(feed.cards).toEqual([]);
    // And the gate was never consulted, so a lookup failure cannot accidentally
    // hand someone the paid curriculum.
    expect(mockIsFreePreviewTier).not.toHaveBeenCalled();
  });

  it('a curriculum with no week 0 cards gives a gated learner an empty feed, not a full one', async () => {
    // The failure mode worth guarding: if the filter were ever inverted or
    // dropped, this case would silently return all twelve weeks.
    mockTimelineCardFindAll.mockResolvedValue([card(1, 1), card(2, 1)]);
    mockIsFreePreviewTier.mockResolvedValue(true);

    const feed = await getFeed('enr-1');

    expect(feed.cards).toEqual([]);
  });
});
