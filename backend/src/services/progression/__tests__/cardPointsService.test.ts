import {
  eventTypeForCard,
  resolveCardEngagementPoints,
  awardCardCompletionPoints,
  awardLessonCompletionPoints,
} from '../cardPointsService';
import { award, sumPointsTodayByEventTypes } from '../../pointsService';
import PointsConfig from '../../../models/PointsConfig';
import { resolve as resolveType } from '../../timeline/typeRegistry';
import { env } from '../../../config/env';

jest.mock('../../pointsService', () => ({ award: jest.fn(), sumPointsTodayByEventTypes: jest.fn() }));
jest.mock('../../../models/PointsConfig', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../../timeline/typeRegistry', () => ({ resolve: jest.fn() }));
jest.mock('../../../config/env', () => ({ env: { portalPointsAwardEnabled: true, pointsDailyCapsEnabled: false } }));

const mockAward = award as jest.Mock;
const mockSumToday = sumPointsTodayByEventTypes as jest.Mock;
const mockFindOne = (PointsConfig as any).findOne as jest.Mock;
const mockResolveType = resolveType as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  (env as any).portalPointsAwardEnabled = true;
  (env as any).pointsDailyCapsEnabled = false;
  mockFindOne.mockResolvedValue(null);         // no config override by default
  mockResolveType.mockReturnValue(undefined);  // unknown type by default
  mockSumToday.mockResolvedValue(0);           // nothing banked today by default
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

  it('awards the sum of card.points (the exact badge value) when no config override exists', async () => {
    expect(await resolveCardEngagementPoints({ id: 'c1', type: 'knowledge_check', points: { learning: 15 } })).toBe(15);
    expect(await resolveCardEngagementPoints({ id: 'c2', type: 'prompt_challenge', points: { builder: 50, learning: 5 } })).toBe(55);
    expect(await resolveCardEngagementPoints({ id: 'c3', type: 'reflection', points: { learning: 5, community: 5 } })).toBe(10);
  });

  it('is 0 when the card has no points (badge hidden → nothing to award)', async () => {
    expect(await resolveCardEngagementPoints({ id: 'c1', type: 'announcement', points: { learning: 0, builder: 0, community: 0 } })).toBe(0);
    expect(await resolveCardEngagementPoints({ id: 'c2', type: 'announcement' })).toBe(0);
  });

  it('never throws — a config read error falls back to the badge value', async () => {
    mockFindOne.mockRejectedValue(new Error('db down'));
    await expect(resolveCardEngagementPoints({ id: 'c1', type: 'quiz', points: { learning: 15 } })).resolves.toBe(15);
  });
});

describe('awardCardCompletionPoints', () => {
  it('is a no-op returning 0 when the flag is disabled', async () => {
    (env as any).portalPointsAwardEnabled = false;
    expect(await awardCardCompletionPoints('enr-1', { id: 'c1', type: 'quiz' })).toBe(0);
    expect(mockAward).not.toHaveBeenCalled();
  });

  it('awards the sum of card.points, keyed idempotently by card, and returns the amount', async () => {
    mockResolveType.mockReturnValue({ render_band: 'quiz' });
    mockAward.mockResolvedValue({ awarded: true, points: 15 });
    const got = await awardCardCompletionPoints('enr-1', { id: 'card-9', type: 'quiz', points: { learning: 15 } });
    expect(got).toBe(15);
    const arg = mockAward.mock.calls[0];
    expect(arg[0]).toBe('enr-1');
    expect(arg[1]).toMatchObject({ eventType: 'knowledge_check', eventKey: 'card:card-9', points: 15 });
  });

  it('returns 0 on an idempotent re-completion (award reports not-created)', async () => {
    mockResolveType.mockReturnValue({ render_band: 'survey' });
    mockAward.mockResolvedValue({ awarded: false, points: 0 });
    expect(await awardCardCompletionPoints('enr-1', { id: 'card-9', type: 'warmup', points: { learning: 10 } })).toBe(0);
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
    await expect(awardCardCompletionPoints('enr-1', { id: 'c1', type: 'quiz', points: { learning: 15 } })).resolves.toBe(0);
  });
});

describe('awardCardCompletionPoints — ambient daily cap (POINTS_DAILY_CAPS_ENABLED)', () => {
  const ambientCard = { id: 'amb-1', type: 'ai_news_flash', points: { learning: 5 } };

  it('flag OFF: awards full value, never queries today\'s total, records as card_complete (byte-identical to today)', async () => {
    (env as any).pointsDailyCapsEnabled = false;
    mockAward.mockResolvedValue({ awarded: true, points: 5 });

    const got = await awardCardCompletionPoints('enr-1', ambientCard);

    expect(got).toBe(5);
    expect(mockSumToday).not.toHaveBeenCalled();
    expect(mockAward.mock.calls[0][1]).toMatchObject({ eventType: 'card_complete', eventKey: 'card:amb-1', points: 5 });
  });

  it('flag ON, under cap: awards full value, banked under the dedicated ambient event type', async () => {
    (env as any).pointsDailyCapsEnabled = true;
    mockSumToday.mockResolvedValue(40); // 40 banked today, cap 100
    mockAward.mockResolvedValue({ awarded: true, points: 5 });

    const got = await awardCardCompletionPoints('enr-1', ambientCard);

    expect(got).toBe(5);
    expect(mockSumToday).toHaveBeenCalledWith('enr-1', ['ambient_learning'], expect.any(String));
    expect(mockAward.mock.calls[0][1]).toMatchObject({ eventType: 'ambient_learning', eventKey: 'card:amb-1', points: 5 });
  });

  it('flag ON, partial room: clamps the award to the cap remainder', async () => {
    (env as any).pointsDailyCapsEnabled = true;
    mockSumToday.mockResolvedValue(97); // only 3 left under cap 100
    mockAward.mockResolvedValue({ awarded: true, points: 3 });

    const got = await awardCardCompletionPoints('enr-1', ambientCard);

    expect(mockAward.mock.calls[0][1].points).toBe(3);
    expect(got).toBe(3);
  });

  it('flag ON, at the cap: awards nothing and writes no points row (idempotency untouched)', async () => {
    (env as any).pointsDailyCapsEnabled = true;
    mockSumToday.mockResolvedValue(100);

    const got = await awardCardCompletionPoints('enr-1', ambientCard);

    expect(got).toBe(0);
    expect(mockAward).not.toHaveBeenCalled();
  });

  it('flag ON: a non-ambient card is never capped (real coursework is unaffected)', async () => {
    (env as any).pointsDailyCapsEnabled = true;
    mockResolveType.mockReturnValue({ render_band: 'quiz' });
    mockAward.mockResolvedValue({ awarded: true, points: 15 });

    const got = await awardCardCompletionPoints('enr-1', { id: 'kc-1', type: 'knowledge_check', points: { learning: 15 } });

    expect(got).toBe(15);
    expect(mockSumToday).not.toHaveBeenCalled();
    expect(mockAward.mock.calls[0][1]).toMatchObject({ eventType: 'knowledge_check', eventKey: 'card:kc-1', points: 15 });
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
