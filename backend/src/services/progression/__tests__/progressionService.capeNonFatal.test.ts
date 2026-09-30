/**
 * Scoped test for progressionService.onCardCompleted's CAPE integration point
 * ONLY — the pre-existing XP/evidence/promotion logic in this file was untested
 * before this change (grandfathered per backend/CLAUDE.md); this file exists
 * specifically to prove the ONE thing CAPE Phase 0-1 adds is safe: a CAPE
 * evidence-write failure must never block card completion, XP, points, or
 * promotion (design doc's Failure-First Design; Assumption in
 * execution-contract.md). Every other dependency of onCardCompleted is mocked to
 * a permissive happy-path stub so the test isolates the CAPE call site.
 */
import TimelineCard from '../../../models/TimelineCard';
import TimelineCardProgress from '../../../models/TimelineCardProgress';
import XpEvent from '../../../models/XpEvent';
import StudentLevel from '../../../models/StudentLevel';

jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../../models/TimelineCard', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
jest.mock('../../../models/TimelineCardProgress', () => ({ __esModule: true, default: { findOrCreate: jest.fn() } }));
jest.mock('../../../models/XpEvent', () => ({ __esModule: true, default: { findOrCreate: jest.fn(), findAll: jest.fn() } }));
jest.mock('../../../models/StudentLevel', () => ({ __esModule: true, default: { findOrCreate: jest.fn() } }));
jest.mock('../timeline/typeRegistry', () => ({ resolve: jest.fn(() => ({ evidence_required: false })) }), { virtual: true });
jest.mock('../../timeline/typeRegistry', () => ({ resolve: jest.fn(() => ({ evidence_required: false })) }));
jest.mock('../pointsConfigService', () => ({ getTypeXp: jest.fn(async () => ({ learning: 0, builder: 0, community: 0 })) }));
jest.mock('../cardPointsService', () => ({ awardCardCompletionPoints: jest.fn(async () => 0) }));
jest.mock('../learningEngine', () => ({ awardLearningXp: jest.fn(async () => 5) }));
jest.mock('../evidenceEngine', () => ({ recordCardEvidence: jest.fn(async () => ({ builder_xp: 0 })) }));
jest.mock('../competencyEngine', () => ({
  recomputeForEnrollment: jest.fn(async () => undefined),
  getStudentCompetency: jest.fn(async () => []),
}));
jest.mock('../promotionService', () => ({ evaluateForEnrollment: jest.fn(async () => ({ promoted: false })) }));
jest.mock('../scoring', () => ({ aggregateXp: jest.fn(() => ({ learning: 0, builder: 0, community: 0 })) }));
jest.mock('../../pointsService', () => ({ getPointsSummary: jest.fn(async () => ({ total: 0 })) }));
jest.mock('../bandLadder', () => ({ computeBand: jest.fn(() => ({ slug: 'aware', name: 'AI Aware' })) }));
jest.mock('../../timeline/timelineGatingService', () => ({ assertCardUnlocked: jest.fn(async () => undefined) }));
jest.mock('../../runtime/watchProgressService', () => ({ assertWatchRequirement: jest.fn(async () => undefined) }));
jest.mock('../../runtime/fieldGuideService', () => ({ assertFieldGuideRequirement: jest.fn(async () => undefined) }));
jest.mock('../../runtime/cardDwellService', () => ({ assertDwellRequirement: jest.fn(async () => undefined) }));

const capeRecord = jest.fn();
jest.mock('../../cape/capeTimelineEvidenceBridge', () => ({ recordCapeEvidenceForCompletedCard: (...args: any[]) => capeRecord(...args) }));

const findByPk = TimelineCard.findByPk as unknown as jest.Mock;
const progressFindOrCreate = TimelineCardProgress.findOrCreate as unknown as jest.Mock;
const xpFindOrCreate = XpEvent.findOrCreate as unknown as jest.Mock;
const studentLevelFindOrCreate = StudentLevel.findOrCreate as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  findByPk.mockResolvedValue({ id: 'card-1', type: 'video', competencies: [], points: 0 });
  progressFindOrCreate.mockResolvedValue([{ status: 'completed' }, true]);
  xpFindOrCreate.mockResolvedValue([{}, true]);
  studentLevelFindOrCreate.mockResolvedValue([{ level_slug: 'builder', rank: 0 }, true]);
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('progressionService.onCardCompleted — CAPE non-fatal integration', () => {
  it('happy path: calls the CAPE bridge with the enrollment id and completed card', async () => {
    capeRecord.mockResolvedValue(undefined);
    const { onCardCompleted } = await import('../progressionService');
    const result = await onCardCompleted('enr-1', 'card-1');
    expect(capeRecord).toHaveBeenCalledWith('enr-1', { id: 'card-1', type: 'video' });
    expect(result.card_id).toBe('card-1');
  });

  it('failure path: a throwing CAPE bridge does not block card completion, and XP/points results are unchanged', async () => {
    capeRecord.mockRejectedValue(new Error('cape ledger unavailable'));
    const { onCardCompleted } = await import('../progressionService');
    const result = await onCardCompleted('enr-1', 'card-1');
    // completion succeeded despite the CAPE failure
    expect(result.card_id).toBe('card-1');
    expect(result.learning_xp).toBe(5); // unchanged from the mocked awardLearningXp happy path
    expect(result.points_awarded).toBe(0);
    expect(console.warn).toHaveBeenCalled(); // failure was logged, not swallowed silently
  });

  it('idempotency: completing the same card twice calls the CAPE bridge each time (bridge itself is idempotency-keyed downstream)', async () => {
    capeRecord.mockResolvedValue(undefined);
    const { onCardCompleted } = await import('../progressionService');
    await onCardCompleted('enr-1', 'card-1');
    await onCardCompleted('enr-1', 'card-1');
    expect(capeRecord).toHaveBeenCalledTimes(2);
    expect(capeRecord).toHaveBeenNthCalledWith(1, 'enr-1', { id: 'card-1', type: 'video' });
    expect(capeRecord).toHaveBeenNthCalledWith(2, 'enr-1', { id: 'card-1', type: 'video' });
  });
});
