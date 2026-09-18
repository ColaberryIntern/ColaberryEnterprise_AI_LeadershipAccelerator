/**
 * pointsDrilldownService — the milestone lens. Proves it is absent with the
 * flag off (the page stays byte-identical), present with it on, merges latched
 * state over live counts (D5), and degrades to null without taking the other
 * lenses down.
 */
jest.mock('../pointsService', () => ({ getPointsSummary: jest.fn(async () => ({ total: 948, events: [] })) }));
jest.mock('../streakService', () => ({ getStreak: jest.fn(async () => ({ count: 3, total_streak_points: 24 })) }));
jest.mock('../progression/progressionService', () => ({ getProgressionSummary: jest.fn(async () => ({ xp: { learning: 100, builder: 64, community: 0 } })) }));
jest.mock('../progression/promotionService', () => ({ getPromotionStatus: jest.fn(async () => ({ readiness: 0.58, level: 'builder_ii', rank: 2, next_level: 'builder_iii', at_max: false, gaps: ['Projects verified — 1 of 3'], ladder: 'milestone' })) }));
jest.mock('../../config/env', () => ({ env: { milestoneLadderEnabled: false } }));

const status = jest.fn();
const curriculum = jest.fn();
const projects = jest.fn();
const certFindOne = jest.fn();
jest.mock('../progression/milestonePromotion', () => ({ getMilestonePromotionStatus: (...a: unknown[]) => status(...a) }));
jest.mock('../progression/milestoneService', () => ({
  getCurriculumCompletion: (...a: unknown[]) => curriculum(...a),
  getProjectCompletions: (...a: unknown[]) => projects(...a),
}));
jest.mock('../../models/StudentCertification', () => ({ __esModule: true, default: { findOne: (...a: unknown[]) => certFindOne(...a) } }));

import { env } from '../../config/env';
import { getPointsDrilldown } from '../pointsDrilldownService';

beforeEach(() => {
  jest.clearAllMocks();
  (env as any).milestoneLadderEnabled = true;
  status.mockResolvedValue({
    rungName: 'AI Builder II', rank: 2, next_rung_name: 'AI Builder III', at_max: false,
    state: { curriculumComplete: true, projectsComplete: 1, certificationApproved: false },
    gaps: [{ key: 'projects', have: 1, need: 3, text: 'Projects verified — 1 of 3' }],
  });
  curriculum.mockResolvedValue({
    complete: true, incompleteWeeks: [], cohortStart: '2026-07-23',
    weeks: Array.from({ length: 12 }, (_, i) => ({ week: i + 1, graded: i === 0 ? 8 : 6, completed: i === 0 ? 8 : 6 })),
  });
  projects.mockResolvedValue([
    { projectId: 'p1', name: 'AI Support Workflow Assistant', complete: true, storiesTotal: 8, storiesVerified: 8 },
    { projectId: 'p2', name: 'Kashmir Craft AI Order Assistant', complete: false, storiesTotal: 15, storiesVerified: 14 },
  ]);
  certFindOne.mockResolvedValue(null);
});

describe('milestone lens', () => {
  it('is null with the flag off and never touches the milestone services', async () => {
    (env as any).milestoneLadderEnabled = false;
    const v = await getPointsDrilldown('e1');
    expect(v.milestones).toBeNull();
    expect(status).not.toHaveBeenCalled();
    expect(v.engagement.total).toBe(948);
    expect(v.skill_xp?.total).toBe(164);
  });

  it('assembles the checklist from latched state plus live counts', async () => {
    const v = await getPointsDrilldown('e1');
    expect(v.milestones).toEqual({
      rung_name: 'AI Builder II', rank: 2, next_rung_name: 'AI Builder III', at_max: false,
      curriculum: { complete: true, done: 74, total: 74, incomplete_weeks: [] },
      projects: [
        { id: 'p1', name: 'AI Support Workflow Assistant', verified: 8, total: 8, complete: true },
        { id: 'p2', name: 'Kashmir Craft AI Order Assistant', verified: 14, total: 15, complete: false },
      ],
      projects_complete: 1,
      certification: { status: 'none', reviewed_by: null },
      gaps: ['Projects verified — 1 of 3'],
    });
  });

  it('a latched curriculum stays complete when the live read no longer is (D5)', async () => {
    curriculum.mockResolvedValue({ complete: false, incompleteWeeks: [5], cohortStart: '2026-07-23', weeks: [{ week: 5, graded: 6, completed: 5 }] });
    const v = await getPointsDrilldown('e1');
    expect(v.milestones?.curriculum).toMatchObject({ complete: true, done: 5, total: 6, incomplete_weeks: [5] });
  });

  it('reports the latest certification claim, and names the reviewer only once approved', async () => {
    certFindOne.mockResolvedValue({ status: 'pending', reviewed_by: null });
    expect((await getPointsDrilldown('e1')).milestones?.certification).toEqual({ status: 'pending', reviewed_by: null });

    certFindOne.mockResolvedValue({ status: 'approved', reviewed_by: 'ali@colaberry.com' });
    status.mockResolvedValue({ ...(await status()), state: { curriculumComplete: true, projectsComplete: 3, certificationApproved: true } });
    expect((await getPointsDrilldown('e1')).milestones?.certification).toEqual({ status: 'approved', reviewed_by: 'ali@colaberry.com' });
  });

  it('degrades to null on a lens failure without losing engagement or readiness', async () => {
    projects.mockRejectedValue(new Error('db down'));
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const v = await getPointsDrilldown('e1');
    expect(v.milestones).toBeNull();
    expect(v.engagement.total).toBe(948);
    expect(v.readiness?.pct).toBe(58);
    expect(logSpy.mock.calls.some((c) => String(c[0]).includes('milestones_lens_failed'))).toBe(true);
    logSpy.mockRestore();
  });
});
