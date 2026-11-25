/**
 * watchVerdictFor / getWatchVerdict — the read the workspace and drawer hydrate
 * their Mark-complete button from on open (2026-10-29: a video task showed an
 * enabled button, the student clicked it, and the server's 422 replaced the page).
 * The completion gate reads the SAME verdict, so these also pin that the button
 * and the gate can never disagree.
 */
jest.mock('../../../models/TimelineCard', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
jest.mock('../../../models/TimelineCardProgress', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../../../models/CurriculumTypeDefinition', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
// cardVideoMetadata, not timelineService: videoFromMetadata moved there when the
// feed started reading watch state, to keep the two out of an import cycle.
jest.mock('../../timeline/cardVideoMetadata', () => ({ videoFromMetadata: jest.fn(() => null) }));
jest.mock('../../timeline/networkVideoService', () => ({ getAssignedTestimonialDurationS: jest.fn(() => null) }));
jest.mock('../../timeline/podcastMediaService', () => ({ getAssignedPodcastDurationS: jest.fn(() => null) }));
jest.mock('../../timeline/curriculumScope', () => ({ isCardServable: jest.fn(() => true) }));

import TimelineCard from '../../../models/TimelineCard';
import TimelineCardProgress from '../../../models/TimelineCardProgress';
import CurriculumTypeDefinition from '../../../models/CurriculumTypeDefinition';
import { watchVerdictFor, getWatchVerdict, assertWatchRequirement } from '../watchProgressService';

const findCard = TimelineCard.findByPk as jest.Mock;
const findProgress = TimelineCardProgress.findOne as jest.Mock;
const findType = CurriculumTypeDefinition.findOne as jest.Mock;

const video = { id: 'c1', type: 'testimonial', visibility: 'published', metadata: {}, completion_rules: { video_watched: 0.75 } } as any;
const reading = { id: 'c2', type: 'reading', visibility: 'published', metadata: {}, completion_rules: null } as any;
const progressWith = (watch: any, status = 'in_progress') => ({ status, analytics: { watch } });

beforeEach(() => { jest.clearAllMocks(); findType.mockResolvedValue(null); });

describe('watchVerdictFor', () => {
  it('a type with no watch rule is never gated', async () => {
    await expect(watchVerdictFor('e1', reading)).resolves.toEqual({ watched_pct: 0, required_pct: null, met: true });
  });

  it('a fresh open (no beats yet) is NOT met — the button must start dimmed', async () => {
    findProgress.mockResolvedValue(null);
    await expect(watchVerdictFor('e1', video)).resolves.toEqual({ watched_pct: 0, required_pct: 75, met: false });
  });

  it('below the bar reports progress and stays unmet', async () => {
    findProgress.mockResolvedValue(progressWith({ watched_s: 60, duration_s: 300, watched_pct: 20 }));
    await expect(watchVerdictFor('e1', video)).resolves.toEqual({ watched_pct: 20, required_pct: 75, met: false });
  });

  it('at the bar is met', async () => {
    findProgress.mockResolvedValue(progressWith({ watched_s: 240, duration_s: 300, watched_pct: 80 }));
    await expect(watchVerdictFor('e1', video)).resolves.toMatchObject({ required_pct: 75, met: true });
  });

  it('an already-completed card is always met (never re-gated)', async () => {
    findProgress.mockResolvedValue(progressWith(null, 'completed'));
    await expect(watchVerdictFor('e1', video)).resolves.toMatchObject({ met: true });
  });
});

describe('the gate agrees with the button', () => {
  it('assertWatchRequirement rejects exactly when the verdict is unmet', async () => {
    findProgress.mockResolvedValue(progressWith({ watched_s: 60, duration_s: 300, watched_pct: 20 }));
    await expect(assertWatchRequirement('e1', video)).rejects.toMatchObject({ status: 422, code: 'watch_requirement', watched_pct: 20, required_pct: 75 });
    findProgress.mockResolvedValue(progressWith({ watched_s: 240, duration_s: 300, watched_pct: 80 }));
    await expect(assertWatchRequirement('e1', video)).resolves.toBeUndefined();
  });
});

describe('getWatchVerdict', () => {
  it('404s on a card that does not exist', async () => {
    findCard.mockResolvedValue(null);
    await expect(getWatchVerdict('e1', 'nope')).rejects.toMatchObject({ status: 404 });
  });

  it('reads the card and returns its verdict', async () => {
    findCard.mockResolvedValue(video);
    findProgress.mockResolvedValue(null);
    await expect(getWatchVerdict('e1', 'c1')).resolves.toEqual({
      watched_pct: 0, required_pct: 75, met: false, position_s: null, duration_s: null,
    });
  });
});

/**
 * The player's half of this read (2026-11-25). `max_position_s` had been stored
 * on every beat since the gate shipped and nothing read it back, so reopening a
 * part-watched video started it over. The drawer and the lesson workspace both
 * hydrate from here, so this is where the resume point has to appear.
 */
describe('getWatchVerdict — where to start playing', () => {
  beforeEach(() => { findCard.mockResolvedValue(video); });

  it('carries the furthest second this student reached', async () => {
    findProgress.mockResolvedValue(progressWith({ watched_s: 600, max_position_s: 612, duration_s: 1200, watched_pct: 50 }));
    await expect(getWatchVerdict('e1', 'c1')).resolves.toMatchObject({ position_s: 612, duration_s: 1200 });
  });

  it('has no resume point for a video nobody has played', async () => {
    findProgress.mockResolvedValue(null);
    await expect(getWatchVerdict('e1', 'c1')).resolves.toMatchObject({ position_s: null, duration_s: null });
  });

  it('still carries the position for a card that is already completed', async () => {
    // The gate never re-gates a completed card, but a rewatch still wants to
    // know where they got to — and the client decides it is too close to the end.
    findProgress.mockResolvedValue({ status: 'completed', analytics: { watch: { watched_s: 1200, max_position_s: 1190, duration_s: 1200, watched_pct: 100 } } });
    await expect(getWatchVerdict('e1', 'c1')).resolves.toMatchObject({ met: true, position_s: 1190 });
  });

  it('carries a position even for a type with no watch requirement', async () => {
    // Ungated, so there is no bar — but they still left off somewhere.
    findCard.mockResolvedValue(reading);
    findProgress.mockResolvedValue(progressWith({ watched_s: 400, max_position_s: 400, duration_s: 1200, watched_pct: 33 }));
    await expect(getWatchVerdict('e1', 'c2')).resolves.toMatchObject({ required_pct: null, position_s: 400 });
  });
});
