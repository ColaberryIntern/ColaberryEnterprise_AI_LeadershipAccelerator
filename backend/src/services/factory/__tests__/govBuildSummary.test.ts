/**
 * govBuildSummary is the cockpit's BUILD view: releases → stories + a progress rollup, read from the materialized
 * SBP rows for the project linked to the gov delivery project's solution_build track. It also lazily publishes the
 * plan (so commits verify). `verified` is the honest done (verified_at set), and pct is verified/total.
 */
const ctFindOne = jest.fn();
jest.mock('../../../models/ContractTrack', () => ({ __esModule: true, default: { findOne: (...a: any[]) => ctFindOne(...a) } }));
const stlFindAll = jest.fn();
const stFindAll = jest.fn();
jest.mock('../../../models/StudentTaskList', () => ({ __esModule: true, default: { findAll: (...a: any[]) => stlFindAll(...a) } }));
jest.mock('../../../models/StudentTask', () => ({ __esModule: true, default: { findAll: (...a: any[]) => stFindAll(...a) } }));
const ensureGovBuildPlanPublished = jest.fn();
jest.mock('../govBuildPublish', () => ({ __esModule: true, ensureGovBuildPlanPublished: (...a: any[]) => ensureGovBuildPlanPublished(...a) }));

import { getGovBuildSummary } from '../govBuildSummary';

beforeEach(() => {
  jest.clearAllMocks();
  ctFindOne.mockResolvedValue({ solution_student_project_id: 'sp-1' });
  stlFindAll.mockResolvedValue([]); stFindAll.mockResolvedValue([]);
  ensureGovBuildPlanPublished.mockResolvedValue({ published: true, action: 'already' });
});

it('returns null when no build project is linked', async () => {
  ctFindOne.mockResolvedValueOnce(null);
  expect(await getGovBuildSummary('dp-1')).toBeNull();
  ctFindOne.mockResolvedValueOnce({ solution_student_project_id: null });
  expect(await getGovBuildSummary('dp-1')).toBeNull();
  expect(await getGovBuildSummary('')).toBeNull();
});

it('rolls up releases → stories with verified/pct, and ensures the plan is published for the commit loop', async () => {
  stlFindAll.mockResolvedValue([
    { cluster: 'prep', title: 'Prep', position: 0 },
    { cluster: 'r0', title: 'Release 0 · skeleton', status: 'in_progress', position: 1 },
  ]);
  stFindAll.mockResolvedValue([
    { story_id: 'STORY-001', release_key: 'r0', title: 'A', status: 'complete', verified_at: '2026-10-01T00:00:00Z', position: 1 },
    { story_id: 'STORY-002', release_key: 'r0', title: 'B', status: 'in_progress', verified_at: null, position: 2 },
    { story_id: 'STORY-003', release_key: 'r1', title: 'C', status: 'not_started', position: 3 },
    { story_id: null, title: 'not a story', position: 4 },
  ]);
  const summary = (await getGovBuildSummary('dp-1'))!;
  expect(summary.studentProjectId).toBe('sp-1');
  expect(ensureGovBuildPlanPublished).toHaveBeenCalledWith('sp-1');  // the commit loop is turned on

  expect(summary.releases.map((r) => r.key)).toEqual(['r0', 'r1']);  // prep dropped; r1 invented from its story
  expect(summary.releases.find((r) => r.key === 'r0')!.stories.map((s) => s.storyId)).toEqual(['STORY-001', 'STORY-002']);
  const a = summary.releases[0].stories[0];
  expect(a).toMatchObject({ storyId: 'STORY-001', verified: true, status: 'complete' });
  expect(summary.releases[0].stories[1].verified).toBe(false);

  expect(summary.rollup).toEqual({ total: 3, verified: 1, complete: 1, inProgress: 1, blocked: 0, notStarted: 1, pct: 33 });
});

it('still returns a summary when the publish backfill fails (best-effort, never blocks the view)', async () => {
  ensureGovBuildPlanPublished.mockRejectedValue(new Error('db down'));
  stFindAll.mockResolvedValue([{ story_id: 'STORY-001', release_key: 'r0', title: 'A', status: 'complete', verified_at: '2026-10-01T00:00:00Z', position: 1 }]);
  const summary = (await getGovBuildSummary('dp-1'))!;
  expect(summary.rollup.total).toBe(1);
  expect(summary.rollup.pct).toBe(100);
});
