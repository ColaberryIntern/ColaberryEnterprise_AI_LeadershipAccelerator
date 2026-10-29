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
jest.mock('../../timeline/timelineService', () => ({ videoFromMetadata: jest.fn(() => null) }));
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
    await expect(getWatchVerdict('e1', 'c1')).resolves.toEqual({ watched_pct: 0, required_pct: 75, met: false });
  });
});
