/**
 * milestoneService — detection + latching, with every model and the plan store
 * mocked. Proves the four things the ladder depends on:
 *   1. "curriculum complete" means every GRADED card in all 12 weeks, and a week
 *      with no graded cards is NOT complete (no vacuous truth).
 *   2. "project complete" means every plan story incl. STORY-000 is verified.
 *   3. Latching is idempotent: a second sync with the same truth writes nothing.
 *   4. The state the ladder reads caps projects at three.
 */
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../../models/StudentMilestone', () => ({ __esModule: true, default: { findOrCreate: jest.fn(), findAll: jest.fn() } }));
jest.mock('../../../models/Project', () => ({ __esModule: true, default: { findAll: jest.fn() } }));
jest.mock('../../../models/StudentTask', () => ({ __esModule: true, default: { count: jest.fn() } }));
jest.mock('../../sbp/planStore', () => ({ getPublishedPlan: jest.fn() }));
jest.mock('../../sbp/verification/storyPoints', () => ({
  planStorySpecs: (plan: { stories?: Array<{ id: string }> }) => [
    ...(plan.stories ?? []).map((s) => ({ id: s.id, acceptance: [] })),
    { id: 'STORY-000', acceptance: [] },
  ],
}));
jest.mock('../../timeline/curriculumScope', () => ({ CANONICAL_PROGRAM_ID: 'prog-canonical' }));
jest.mock('../../timeline/typeRegistry', () => ({
  // Mirrors the real rule: graded types, with claude_studio required only from 2026-11-01.
  isCurriculumRequired: (slug: string, cohortStart: string | null) => {
    if (!['prompt_lab', 'implementation_task', 'knowledge_check', 'evaluation', 'claude_studio'].includes(slug)) return false;
    if (slug === 'claude_studio') return !cohortStart || cohortStart >= '2026-11-01';
    return true;
  },
}));

import { sequelize } from '../../../config/database';
import StudentMilestone from '../../../models/StudentMilestone';
import Project from '../../../models/Project';
import StudentTask from '../../../models/StudentTask';
import { getPublishedPlan } from '../../sbp/planStore';
import { getCurriculumCompletion, getProjectCompletions, syncMilestones, getMilestoneState, latchCertificationMilestone } from '../milestoneService';

const query = sequelize.query as unknown as jest.Mock;
const msFindOrCreate = StudentMilestone.findOrCreate as unknown as jest.Mock;
const msFindAll = StudentMilestone.findAll as unknown as jest.Mock;
const projectFindAll = Project.findAll as unknown as jest.Mock;
const taskCount = StudentTask.count as unknown as jest.Mock;
const publishedPlan = getPublishedPlan as unknown as jest.Mock;

/** Rows as the curriculum query returns them: one per (week, type) with done. */
function weekRows(spec: Record<number, Array<[string, boolean]>>): Array<{ week: number; type: string; done: boolean }> {
  const out: Array<{ week: number; type: string; done: boolean }> = [];
  for (const [week, cards] of Object.entries(spec)) for (const [type, done] of cards) out.push({ week: Number(week), type, done });
  return out;
}
/** Twelve weeks, each with one graded card and one video, all done unless overridden. */
function fullCurriculum(over: Partial<Record<number, Array<[string, boolean]>>> = {}) {
  const spec: Record<number, Array<[string, boolean]>> = {};
  for (let w = 1; w <= 12; w += 1) spec[w] = over[w] ?? [['prompt_lab', true], ['video', false]];
  return weekRows(spec);
}

/** The cohort-start lookup runs before the card query; default to the July 2026 cohort. */
const COHORT_JULY = [{ start_date: '2026-07-23' }];
const COHORT_NOV = [{ start_date: '2026-11-12' }];
const NO_COHORT = [{ start_date: null }];
function primeCurriculum(cards: unknown[], cohort: unknown[] = COHORT_JULY) {
  query.mockResolvedValueOnce(cohort).mockResolvedValueOnce(cards);
}

beforeEach(() => {
  jest.clearAllMocks();
  msFindOrCreate.mockResolvedValue([{}, true]);
  msFindAll.mockResolvedValue([]);
  projectFindAll.mockResolvedValue([]);
});

describe('getCurriculumCompletion', () => {
  it('is complete when every graded card in all 12 weeks is done, ignoring consumption cards', async () => {
    primeCurriculum(fullCurriculum());
    const r = await getCurriculumCompletion('e1');
    expect(r.complete).toBe(true);
    expect(r.incompleteWeeks).toEqual([]);
    expect(r.weeks.every((w) => w.graded === 1 && w.completed === 1)).toBe(true);
  });

  it('one unfinished graded card in one week blocks it, and names the week', async () => {
    primeCurriculum(fullCurriculum({ 7: [['prompt_lab', true], ['evaluation', false]] }));
    const r = await getCurriculumCompletion('e1');
    expect(r.complete).toBe(false);
    expect(r.incompleteWeeks).toEqual([7]);
  });

  it('a week with NO graded cards is not complete — an unauthored week is not a finished one', async () => {
    primeCurriculum(fullCurriculum({ 12: [['video', true], ['blog', true]] }));
    const r = await getCurriculumCompletion('e1');
    expect(r.complete).toBe(false);
    expect(r.incompleteWeeks).toEqual([12]);
  });

  it('a student who has done nothing is incomplete in every week', async () => {
    primeCurriculum(fullCurriculum(Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, [['prompt_lab', false]]]))));
    const r = await getCurriculumCompletion('e1');
    expect(r.incompleteWeeks).toHaveLength(12);
  });

  it('scopes the query to the shared curriculum and weeks 1..12', async () => {
    primeCurriculum([]);
    await getCurriculumCompletion('e1');
    const [sql, opts] = query.mock.calls[1];
    expect(sql).toMatch(/cohort_id IS NULL/);
    expect(sql).toMatch(/visibility = 'published'/);
    expect(opts.replacements).toMatchObject({ enrollmentId: 'e1', programId: 'prog-canonical', weeks: 12 });
  });

  // D8 (Ali, 2026-09-16): Claude Studio landed after the July 2026 cohort was
  // mid-programme, so it is not required of them; from November 2026 it is.
  // MEASURED: Farhat Beig had 77 of 89 graded cards done and her 12 missing
  // cards were exactly the 12 Studios.
  describe('D8 — a late-added graded type counts only from a cohort start date', () => {
    const withStudios = (studioDone: boolean) => fullCurriculum(Object.fromEntries(
      Array.from({ length: 12 }, (_, i) => [i + 1, [['prompt_lab', true], ['claude_studio', studioDone]]]),
    ));

    it('July 2026: undone Studios do not block curriculum complete', async () => {
      primeCurriculum(withStudios(false), COHORT_JULY);
      const r = await getCurriculumCompletion('farhat');
      expect(r.complete).toBe(true);
      expect(r.cohortStart).toBe('2026-07-23');
      expect(r.weeks[0].graded).toBe(1);   // the Studio is not counted at all
    });

    it('November 2026: undone Studios block it in every week', async () => {
      primeCurriculum(withStudios(false), COHORT_NOV);
      const r = await getCurriculumCompletion('nov-student');
      expect(r.complete).toBe(false);
      expect(r.incompleteWeeks).toHaveLength(12);
      expect(r.weeks[0].graded).toBe(2);
    });

    it('November 2026: done Studios complete it', async () => {
      primeCurriculum(withStudios(true), COHORT_NOV);
      expect((await getCurriculumCompletion('nov-student')).complete).toBe(true);
    });

    it('no cohort at all: held to everything (unknown never reads as exempt)', async () => {
      primeCurriculum(withStudios(false), NO_COHORT);
      const r = await getCurriculumCompletion('explorer');
      expect(r.complete).toBe(false);
      expect(r.cohortStart).toBeNull();
    });
  });
});

describe('getProjectCompletions', () => {
  it('a project is complete only when every plan story incl. STORY-000 is verified', async () => {
    projectFindAll.mockResolvedValue([{ id: 'p1', name: 'PropertyPulse' }, { id: 'p2', name: 'Half done' }]);
    publishedPlan.mockImplementation(async (id: string) => ({ plan: { stories: [{ id: 'STORY-001' }, { id: 'STORY-002' }] }, projectId: id }));
    taskCount.mockImplementation(async (opts: any) => (opts.where.project_id === 'p1' ? 3 : 2));
    const r = await getProjectCompletions('e1');
    expect(r).toEqual([
      { projectId: 'p1', name: 'PropertyPulse', complete: true, storiesTotal: 3, storiesVerified: 3 },
      { projectId: 'p2', name: 'Half done', complete: false, storiesTotal: 3, storiesVerified: 2 },
    ]);
  });

  it('a project without a published plan is not a build yet and is omitted', async () => {
    projectFindAll.mockResolvedValue([{ id: 'p1', name: 'Idea only' }]);
    publishedPlan.mockResolvedValue(null);
    expect(await getProjectCompletions('e1')).toEqual([]);
    expect(taskCount).not.toHaveBeenCalled();
  });

  it('counts verified stories by story id against the plan, not by task rows', async () => {
    projectFindAll.mockResolvedValue([{ id: 'p1', name: 'X' }]);
    publishedPlan.mockResolvedValue({ plan: { stories: [{ id: 'STORY-001' }] } });
    taskCount.mockResolvedValue(2);
    await getProjectCompletions('e1');
    expect(taskCount).toHaveBeenCalledWith(expect.objectContaining({ distinct: true, col: 'story_id' }));
  });
});

describe('syncMilestones', () => {
  it('latches the curriculum and each complete project, and reports what it wrote', async () => {
    primeCurriculum(fullCurriculum());
    projectFindAll.mockResolvedValue([{ id: 'p1', name: 'A' }]);
    publishedPlan.mockResolvedValue({ plan: { stories: [{ id: 'STORY-001' }] } });
    taskCount.mockResolvedValue(2);
    msFindAll.mockResolvedValue([
      { milestone_type: 'curriculum_complete', source_ref: 'curriculum' },
      { milestone_type: 'project_complete', source_ref: 'p1' },
    ]);

    const r = await syncMilestones('e1');

    expect(r.newlyLatched).toEqual([
      { type: 'curriculum_complete', source_ref: 'curriculum' },
      { type: 'project_complete', source_ref: 'p1' },
    ]);
    expect(r.state).toEqual({ curriculumComplete: true, projectsComplete: 1, certificationApproved: false });
    expect(msFindOrCreate).toHaveBeenCalledTimes(2);
  });

  it('is idempotent: the same truth on a second run writes nothing new', async () => {
    primeCurriculum(fullCurriculum());
    primeCurriculum(fullCurriculum());
    projectFindAll.mockResolvedValue([{ id: 'p1', name: 'A' }]);
    publishedPlan.mockResolvedValue({ plan: { stories: [{ id: 'STORY-001' }] } });
    taskCount.mockResolvedValue(2);
    msFindOrCreate.mockResolvedValue([{}, false]);   // rows already exist
    msFindAll.mockResolvedValue([
      { milestone_type: 'curriculum_complete', source_ref: 'curriculum' },
      { milestone_type: 'project_complete', source_ref: 'p1' },
    ]);

    const first = await syncMilestones('e1');
    const second = await syncMilestones('e1');
    expect(first.newlyLatched).toEqual([]);
    expect(second.newlyLatched).toEqual([]);
    expect(first.state).toEqual(second.state);
  });

  it('never latches an incomplete project or an incomplete curriculum', async () => {
    primeCurriculum(fullCurriculum({ 3: [['prompt_lab', false]] }));
    projectFindAll.mockResolvedValue([{ id: 'p1', name: 'A' }]);
    publishedPlan.mockResolvedValue({ plan: { stories: [{ id: 'STORY-001' }, { id: 'STORY-002' }] } });
    taskCount.mockResolvedValue(1);
    await syncMilestones('e1');
    expect(msFindOrCreate).not.toHaveBeenCalled();
  });

  it('a latched milestone survives the truth changing under it (D5)', async () => {
    // Curriculum no longer reads complete (a week was re-authored), but the row exists.
    primeCurriculum(fullCurriculum({ 5: [['evaluation', false]] }));
    msFindAll.mockResolvedValue([{ milestone_type: 'curriculum_complete', source_ref: 'curriculum' }]);
    const r = await syncMilestones('e1');
    expect(r.curriculum.complete).toBe(false);
    expect(r.state.curriculumComplete).toBe(true);
  });
});

describe('getMilestoneState', () => {
  it('caps projects at three and reads certification from its own row type', async () => {
    msFindAll.mockResolvedValue([
      { milestone_type: 'project_complete', source_ref: 'p1' },
      { milestone_type: 'project_complete', source_ref: 'p2' },
      { milestone_type: 'project_complete', source_ref: 'p3' },
      { milestone_type: 'project_complete', source_ref: 'p4' },
      { milestone_type: 'certification_approved', source_ref: 'cert-1' },
    ]);
    expect(await getMilestoneState('e1')).toEqual({ curriculumComplete: false, projectsComplete: 3, certificationApproved: true });
  });
  it('counts distinct projects, not rows', async () => {
    msFindAll.mockResolvedValue([
      { milestone_type: 'project_complete', source_ref: 'p1' },
      { milestone_type: 'project_complete', source_ref: 'p1' },
    ]);
    expect((await getMilestoneState('e1')).projectsComplete).toBe(1);
  });
});

describe('latchCertificationMilestone', () => {
  it('keys on the certification id so a retried approval is a no-op', async () => {
    msFindOrCreate.mockResolvedValueOnce([{}, true]).mockResolvedValueOnce([{}, false]);
    expect(await latchCertificationMilestone('e1', 'cert-1', { track: 'cca_f' })).toBe(true);
    expect(await latchCertificationMilestone('e1', 'cert-1', { track: 'cca_f' })).toBe(false);
    expect(msFindOrCreate.mock.calls[0][0].where).toEqual({ enrollment_id: 'e1', milestone_type: 'certification_approved', source_ref: 'cert-1' });
  });
});
