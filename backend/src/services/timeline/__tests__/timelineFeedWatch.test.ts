/**
 * The feed payload carries each tile's watch progress — tested on the real
 * `getFeed`, because the wiring is what was missing.
 *
 * Reported by the QA tester 2026-11-24: a tile for a part-watched video showed
 * no progress until the card was reopened and played again.
 *
 * WHY THIS SUITE EXISTS AS WELL AS feedWatchState.test.ts. That suite proves the
 * math on rows it is handed. It says nothing about whether the feed actually
 * ASKS for it or puts the answer in the payload — and a mutation that replaced
 * the emission with a literal `null` passed all 506 timeline tests. So the one
 * line that a student's tile depends on had no test at all. Same gap, and the
 * same argument, as the Week-0 truncation in the sibling suite next door.
 *
 * The harness mirrors timelineWeekZeroGate.test.ts: real `getFeed`, mocked models.
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

const mockProgressFindAll = jest.fn();
jest.mock('../../../models/TimelineCardProgress', () => ({
  __esModule: true,
  default: { findAll: (...a: unknown[]) => mockProgressFindAll(...a) },
}));

const mockEnrollmentFindByPk = jest.fn();
jest.mock('../../../models/Enrollment', () => ({
  __esModule: true,
  default: { findByPk: (...a: unknown[]) => mockEnrollmentFindByPk(...a) },
}));

const mockTypeDefFindAll = jest.fn();
jest.mock('../../../models/CurriculumTypeDefinition', () => ({
  __esModule: true,
  default: { findAll: (...a: unknown[]) => mockTypeDefFindAll(...a) },
}));

jest.mock('../timelineGatingService', () => ({
  buildGateContext: jest.fn().mockImplementation(async (allCards: unknown[]) => ({ allCards })),
  evaluateCardLock: jest.fn().mockReturnValue({ locked: false, unmet: [] }),
}));
jest.mock('../typeRegistry', () => ({
  resolve: jest.fn().mockReturnValue({ student_label: 'Lesson', render_band: 'video' }),
}));
jest.mock('../curriculumScope', () => ({ globalCurriculumWhere: () => ({}), isCardServable: () => true }));
jest.mock('../../runtime/communityRituals', () => ({ ritualStudentLabel: () => 'Lesson' }));
jest.mock('../networkVideoService', () => ({
  selectTestimonialForEnrollment: jest.fn().mockResolvedValue(null),
  getAssignedTestimonialDurationS: jest.fn().mockResolvedValue(null),
}));
jest.mock('../podcastMediaService', () => ({
  selectPodcastForEnrollment: jest.fn().mockResolvedValue(null),
  getAssignedPodcastDurationS: jest.fn().mockResolvedValue(null),
}));
jest.mock('../blogMediaService', () => ({ selectBlogForEnrollment: jest.fn().mockResolvedValue(null) }));
jest.mock('../../../config/env', () => ({ env: {} }));

import { getFeed } from '../timelineService';

/** A video card the watch gate applies to. */
const videoCard = (id: string) => ({
  id,
  type: 'video',
  title: `Card ${id}`,
  subtitle: null,
  description: null,
  week: 4,
  bucket: 'learn',
  order: 0,
  difficulty: null,
  estimated_time: 20,
  points: 0,
  competencies: null,
  unlock_rules: null,
  completion_rules: null,
  metadata: { video: { url: 'https://www.youtube.com/watch?v=abc', duration_seconds: 1200 } },
});

/** A progress row carrying a stored watch blob, as a watch beat writes it. */
const watchedRow = (cardId: string, watch: Record<string, number>) => ({
  card_id: cardId,
  status: 'in_progress',
  quiz_score: null,
  completed_at: null,
  analytics: { watch },
});

const HALF_WATCHED = { watched_s: 600, max_position_s: 612, duration_s: 1200, watched_pct: 50 };

const feedCard = async (id: string) => (await getFeed('enr-1')).cards.find((c) => c.id === id);

beforeEach(() => {
  jest.clearAllMocks();
  mockIsFreePreviewTier.mockResolvedValue(false);
  mockEnrollmentFindByPk.mockResolvedValue({ id: 'enr-1', cohort_id: null });
  mockTimelineCardFindAll.mockResolvedValue([videoCard('card-1')]);
  mockProgressFindAll.mockResolvedValue([]);
  mockTypeDefFindAll.mockResolvedValue([{ slug: 'video', capabilities: null, thumbnail_url: null, completion_rules: null }]);
});

describe('getFeed — watch progress on the tile', () => {
  it('sends the percentage and the resume point for a part-watched video', async () => {
    mockProgressFindAll.mockResolvedValue([watchedRow('card-1', HALF_WATCHED)]);

    expect((await feedCard('card-1'))?.watch).toEqual({
      watched_pct: 50,
      required_pct: 75,
      met: false,
      position_s: 612,
      duration_s: 1200,
    });
  });

  it('sends null for a video this student has never played', async () => {
    mockProgressFindAll.mockResolvedValue([]);
    expect((await feedCard('card-1'))?.watch).toBeNull();
  });

  it('reads the stored progress rows it already loaded, and queries nothing extra', async () => {
    // The point of putting this in the feed: the progress rows are already here.
    // One findAll for every card's progress, not one per video card on screen.
    mockProgressFindAll.mockResolvedValue([watchedRow('card-1', HALF_WATCHED)]);
    await getFeed('enr-1');
    expect(mockProgressFindAll).toHaveBeenCalledTimes(1);
  });

  it('reads the type\'s watch requirement off the query the feed already makes', async () => {
    // completion_rules has to be among the attributes selected, or every tile
    // would silently fall back to the default bar.
    mockProgressFindAll.mockResolvedValue([watchedRow('card-1', HALF_WATCHED)]);
    mockTypeDefFindAll.mockResolvedValue([{ slug: 'video', capabilities: null, thumbnail_url: null, completion_rules: { video_watched: 0.5 } }]);

    expect((await feedCard('card-1'))?.watch).toMatchObject({ required_pct: 50, met: true });
    expect(mockTypeDefFindAll).toHaveBeenCalledTimes(1);
    expect(mockTypeDefFindAll.mock.calls[0][0].attributes).toContain('completion_rules');
  });

  it('leaves every other field on the card exactly as it was', async () => {
    // This change adds a field; it must not disturb the payload around it.
    mockProgressFindAll.mockResolvedValue([watchedRow('card-1', HALF_WATCHED)]);
    const card = await feedCard('card-1');

    expect(card?.status).toBe('in_progress');
    expect(card?.video).toMatchObject({ url: 'https://www.youtube.com/watch?v=abc', duration_seconds: 1200 });
  });
});
