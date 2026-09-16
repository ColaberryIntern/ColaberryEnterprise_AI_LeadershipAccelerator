/**
 * getRungNamesForEnrollments — the batched, read-only rung resolver behind the
 * community badge. One StudentLevel query for the whole list; a missing row
 * derives from points alone; a promoted row wins over points.
 */
jest.mock('../../../models/TimelineCard', () => ({ __esModule: true, default: {} }));
jest.mock('../../../models/TimelineCardProgress', () => ({ __esModule: true, default: {} }));
jest.mock('../../../models/XpEvent', () => ({ __esModule: true, default: {} }));
jest.mock('../../../models/StudentLevel', () => ({ __esModule: true, default: { findAll: jest.fn(), findOrCreate: jest.fn() } }));
jest.mock('../../timeline/typeRegistry', () => ({ resolve: jest.fn() }));
jest.mock('../pointsConfigService', () => ({ getTypeXp: jest.fn() }));
jest.mock('../cardPointsService', () => ({ awardCardCompletionPoints: jest.fn() }));
jest.mock('../learningEngine', () => ({ awardLearningXp: jest.fn() }));
jest.mock('../evidenceEngine', () => ({ recordCardEvidence: jest.fn() }));
jest.mock('../competencyEngine', () => ({ recomputeForEnrollment: jest.fn(), getStudentCompetency: jest.fn() }));
jest.mock('../promotionService', () => ({ evaluateForEnrollment: jest.fn() }));
jest.mock('../../pointsService', () => ({ getPointsSummary: jest.fn() }));

import StudentLevel from '../../../models/StudentLevel';
import { getRungNamesForEnrollments } from '../progressionService';

const findAll = StudentLevel.findAll as unknown as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('getRungNamesForEnrollments', () => {
  it('resolves every id in ONE query, promoted rows by rung and the rest by points', async () => {
    findAll.mockResolvedValue([
      { enrollment_id: 'farhat', level_slug: 'builder_ii', rank: 2 },
      { enrollment_id: 'legacy', level_slug: 'junior_builder', rank: 1 },
    ]);
    const totals = new Map([['farhat', 40], ['legacy', 40], ['explorer', 948], ['newbie', 0]]);
    const out = await getRungNamesForEnrollments(['farhat', 'legacy', 'explorer', 'newbie', 'farhat'], totals);
    expect(findAll).toHaveBeenCalledTimes(1);
    expect(findAll.mock.calls[0][0].where.enrollment_id).toEqual(['farhat', 'legacy', 'explorer', 'newbie']);
    expect(out.get('farhat')).toBe('AI Builder II');       // promoted: points ignored
    expect(out.get('legacy')).toBe('AI Builder I');        // legacy slug still maps
    expect(out.get('explorer')).toBe('AI Enabled II');     // no row: points rung
    expect(out.get('newbie')).toBe('AI Aware I');
  });

  it('returns an empty map for no ids without querying', async () => {
    expect((await getRungNamesForEnrollments([], new Map())).size).toBe(0);
    expect(await getRungNamesForEnrollments(['', undefined as unknown as string], new Map())).toEqual(new Map());
    expect(findAll).not.toHaveBeenCalled();
  });
});
