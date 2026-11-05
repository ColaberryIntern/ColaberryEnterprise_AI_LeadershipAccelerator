jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));
jest.mock('../../curriculumCompletionService', () => ({
  ...jest.requireActual('../../curriculumCompletionService'),
  getStudentWeekBreakdown: jest.fn(),
}));

import { sequelize } from '../../../config/database';
import { getStudentWeekBreakdown } from '../../curriculumCompletionService';
import { readMyCurriculumProgress } from '../reeseCurriculumTool';

const query = sequelize.query as unknown as jest.Mock;
const breakdown = getStudentWeekBreakdown as jest.Mock;

const row = (week: number | null, completed: number, published: number) =>
  ({ week, completed, publishedCardCount: published, completedPct: published ? Math.round((completed / published) * 1000) / 10 : 0, weekDone: published > 0 && completed / published >= 0.3 });

beforeEach(() => jest.clearAllMocks());

describe('readMyCurriculumProgress (C88, Reese takes learner curriculum questions)', () => {
  it('reads only the sender: every query binds the sender id, the breakdown is the sender\'s own cohort', async () => {
    query
      .mockResolvedValueOnce([[{ cohort_id: 'cohort-1' }], undefined])
      .mockResolvedValueOnce([[
        { title: 'Reflect', type: 'reflection', bucket: 'reflect', order: 1, status: 'not_started' },
        { title: 'Agents 101', type: 'lesson', bucket: 'learn', order: 2, status: 'completed' },
        { title: 'Warm-up', type: 'quiz', bucket: 'pre_class', order: 1, status: 'in_progress' },
      ], undefined]);
    breakdown.mockResolvedValue({ enrollmentId: 'me', name: 'Me', scheduledWeek: 3, rows: [row(1, 9, 10), row(2, 4, 10), row(3, 1, 10), row(4, 0, 10), row(9, 0, 10), row(null, 2, 5)] });

    const out = await readMyCurriculumProgress('me');

    expect(query.mock.calls[0][1]).toEqual({ bind: ['me'] });
    expect(query.mock.calls[1][1]).toEqual({ bind: ['me', 3] });
    expect(breakdown).toHaveBeenCalledWith('cohort-1', 'me');
    expect(out.status).toBe('ok');
    expect(out.scheduledWeek).toBe(3);
    expect(out.weeks!.map((w) => w.week)).toEqual([2, 3, 4]);
    expect(out.thisWeek!.map((c) => c.title)).toEqual(['Warm-up', 'Agents 101', 'Reflect']); // taught order: pre_class, learn, reflect
  });

  it('a learner with no cohort gets an honest no-cohort answer and no further queries', async () => {
    query.mockResolvedValueOnce([[{ cohort_id: null }], undefined]);
    const out = await readMyCurriculumProgress('explorer-1');
    expect(out.status).toBe('no_cohort');
    expect(breakdown).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('an enrollment the breakdown cannot find returns no_data', async () => {
    query.mockResolvedValueOnce([[{ cohort_id: 'cohort-1' }], undefined]);
    breakdown.mockResolvedValue(null);
    expect((await readMyCurriculumProgress('ghost')).status).toBe('no_data');
  });
});
