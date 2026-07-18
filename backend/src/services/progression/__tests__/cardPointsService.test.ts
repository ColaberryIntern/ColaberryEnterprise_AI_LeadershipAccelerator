import {
  eventTypeForCard,
  resolveCardEngagementPoints,
  awardCardCompletionPoints,
  awardLessonCompletionPoints,
} from '../cardPointsService';
import { award } from '../../pointsService';
import PointsConfig from '../../../models/PointsConfig';
import { resolve as resolveType } from '../../timeline/typeRegistry';
import { env } from '../../../config/env';

jest.mock('../../pointsService', () => ({ award: jest.fn() }));
jest.mock('../../../models/PointsConfig', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../../timeline/typeRegistry', () => ({ resolve: jest.fn() }));
jest.mock('../../../config/env', () => ({ env: { portalPointsAwardEnabled: true } }));

const mockAward = award as jest.Mock;
const mockFindOne = (PointsConfig as any).findOne as jest.Mock;
const mockResolveType = resolveType as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  (env as any).portalPointsAwardEnabled = true;
  mockFindOne.mockResolvedValue(null);         // no config override by default
  mockResolveType.mockReturnValue(undefined);  // unknown type by default
});

describe('eventTypeForCard', () => {
  it('maps the survey band to survey_complete', () => {
    mockResolveType.mockReturnValue({ render_band: 'survey' });
    expect(eventTypeForCard({ id: 'c1', type: 'warmup' })).toBe('survey_complete');
  });
  it('maps the evaluation type to evaluation_passed', () => {
    mockResolveType.mockReturnValue({ render_band: 'evaluation' });
    expect(eventTypeForCard({ id: 'c1', type: 'evaluation' })).toBe('evaluation_passed');
  });
  it('maps the quiz band to knowledge_check', () => {
    mockResolveType.mockReturnValue({ render_band: 'quiz' });
    expect(eventTypeForCard({ id: 'c1', type: 'quiz' })).toBe('knowledge_check');
  });
  it('defaults everything else to card_complete', () => {
    mockResolveType.mockReturnValue({ render_band: 'media' });
    expect(eventTypeForCard({ id: 'c1', type: 'video' })).toBe('card_complete');
  });
});

describe('resolveCardEngagementPoints', () => {
  it('prefers a per-card override (card_override config.engagement)', async () => {
    mockFindOne.mockResolvedValueOnce({ config: { engagement: 42 } }); // card_override
    expect(await resolveCardEngagementPoints({ id: 'c1', type: 'quiz' })).toBe(42);
    expect(mockFindOne).toHaveBeenCalledTimes(1); // short-circuits before type_default
  });

  it('falls back to a per-type override (type_default config.engagement)', async () => {
    mockFindOne
      .mockResolvedValueOnce(null)                        // card_override
      .mockResolvedValueOnce({ config: { engagement: 7 } }); // type_default
    expect(await resolveCardEngagementPoints({ id: 'c1', type: 'reading' })).toBe(7);
  });

  it('uses the band fallback map when no config exists (survey=10, quiz=15, evaluation=20)', async () => {
    mockResolveType.mockReturnValue({ render_band: 'survey' });
    expect(await resolveCardEngagementPoints({ id: 'c1', type: 'warmup' })).toBe(10);
    mockResolveType.mockReturnValue({ render_band: 'quiz' });
    expect(await resolveCardEngagementPoints({ id: 'c2', type: 'quiz' })).toBe(15);
    mockResolveType.mockReturnValue({ render_band: 'evaluation' });
    expect(await resolveCardEngagementPoints({ id: 'c3', type: 'evaluation' })).toBe(20);
  });

  it('defaults an unknown band/type to 5', async () => {
    mockResolveType.mockReturnValue({ render_band: 'mystery' });
    expect(await resolveCardEngagementPoints({ id: 'c1', type: 'mystery' })).toBe(5);
  });

  it('never throws — a config read error falls back to the code map', async () => {
    mockFindOne.mockRejectedValue(new Error('db down'));
    mockResolveType.mockReturnValue({ render_band: 'survey' });
    await expect(resolveCardEngagementPoints({ id: 'c1', type: 'warmup' })).resolves.toBe(10);
  });
});

describe('awardCardCompletionPoints', () => {
  it('is a no-op returning 0 when the flag is disabled', async () => {
    (env as any).portalPointsAwardEnabled = false;
    expect(await awardCardCompletionPoints('enr-1', { id: 'c1', type: 'quiz' })).toBe(0);
    expect(mockAward).not.toHaveBeenCalled();
  });

  it('awards the resolved points, keyed idempotently by card, and returns the amount', async () => {
    mockResolveType.mockReturnValue({ render_band: 'quiz' });
    mockAward.mockResolvedValue({ awarded: true, points: 15 });
    const got = await awardCardCompletionPoints('enr-1', { id: 'card-9', type: 'quiz' });
    expect(got).toBe(15);
    const arg = mockAward.mock.calls[0];
    expect(arg[0]).toBe('enr-1');
    expect(arg[1]).toMatchObject({ eventType: 'knowledge_check', eventKey: 'card:card-9', points: 15 });
  });

  it('returns 0 on an idempotent re-completion (award reports not-created)', async () => {
    mockResolveType.mockReturnValue({ render_band: 'survey' });
    mockAward.mockResolvedValue({ awarded: false, points: 0 });
    expect(await awardCardCompletionPoints('enr-1', { id: 'card-9', type: 'warmup' })).toBe(0);
  });

  it('does not award when the resolved amount is 0', async () => {
    mockFindOne.mockResolvedValueOnce({ config: { engagement: 0 } }); // explicit 0 override
    const got = await awardCardCompletionPoints('enr-1', { id: 'c1', type: 'quiz' });
    expect(got).toBe(0);
    expect(mockAward).not.toHaveBeenCalled();
  });

  it('never throws — an award failure is swallowed and returns 0 (non-fatal)', async () => {
    mockResolveType.mockReturnValue({ render_band: 'quiz' });
    mockAward.mockRejectedValue(new Error('write failed'));
    await expect(awardCardCompletionPoints('enr-1', { id: 'c1', type: 'quiz' })).resolves.toBe(0);
  });
});

describe('awardLessonCompletionPoints', () => {
  it('is a no-op returning 0 when the flag is disabled', async () => {
    (env as any).portalPointsAwardEnabled = false;
    expect(await awardLessonCompletionPoints('enr-1', 'lesson-1')).toBe(0);
    expect(mockAward).not.toHaveBeenCalled();
  });

  it('awards lesson_complete keyed by lesson and returns the amount', async () => {
    mockAward.mockResolvedValue({ awarded: true, points: 10 });
    const got = await awardLessonCompletionPoints('enr-1', 'lesson-7');
    expect(got).toBe(10);
    expect(mockAward.mock.calls[0][1]).toMatchObject({ eventType: 'lesson_complete', eventKey: 'lesson:lesson-7' });
  });

  it('never throws — an award failure returns 0', async () => {
    mockAward.mockRejectedValue(new Error('boom'));
    await expect(awardLessonCompletionPoints('enr-1', 'lesson-7')).resolves.toBe(0);
  });
});
