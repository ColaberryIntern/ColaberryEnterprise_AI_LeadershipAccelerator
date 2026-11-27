/**
 * GET /api/portal/project/tasks — the ordering of the stories on a board.
 *
 * ## Why a test exists for one `order` clause
 *
 * This route served its tasks in an undefined order for as long as it has existed, while *looking*
 * ordered. It asked for `order: [['position', 'ASC']]` inside a non-separate `include`, and
 * Sequelize ignores that: `Model._findSeparate` omits `order` for a non-separate include and the
 * query generator never reads an include-level `order` at all. The intent was written down, was
 * never executed, and nothing failed — which is the shape of bug a test has to pin, because
 * reading the code tells you the opposite of what runs.
 *
 * It became load-bearing with AF10.9. All ten agent-domain builder boards are reached through
 * this route, and that change lifts each board's capability ladder to the top by `position`. If
 * this clause does not take effect, the ladder is moved in the database and a builder still opens
 * their board to whatever order the join produced.
 *
 * So these tests assert the SHAPE of the query rather than the result: a top-level order entry
 * naming the `tasks` association, and no include that carries its own `order`. A result-based
 * test would pass against a mock that returns pre-sorted rows no matter which form the clause
 * took, which is exactly how this went unnoticed.
 */
import express from 'express';
import request from 'supertest';

jest.mock('../../middlewares/participantAuth', () => ({
  requireParticipant: (req: any, _res: any, next: any) => {
    req.participant = { sub: 'enrollment-test-uuid', email: 'builder@test.com', role: 'participant' };
    next();
  },
}));

jest.mock('../../services/projectService', () => ({
  getProjectByEnrollment: jest.fn(),
}));

const findAll = jest.fn();
const StudentTask = { name: 'StudentTask' };

jest.mock('../../models', () => ({
  StudentTaskList: { findAll },
  StudentTask,
}));

import { getProjectByEnrollment } from '../../services/projectService';

const mockGetProject = getProjectByEnrollment as jest.Mock;

const buildApp = async () => {
  const app = express();
  app.use(express.json());
  const mod = await import('../projectRoutes');
  app.use(mod.default);
  return app;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetProject.mockResolvedValue({ id: 'project-uuid-001' });
  findAll.mockResolvedValue([]);
});

describe('GET /api/portal/project/tasks ordering', () => {
  it('orders the tasks through a TOP-LEVEL clause naming the association', async () => {
    await request(await buildApp()).get('/api/portal/project/tasks').expect(200);

    expect(findAll).toHaveBeenCalledTimes(1);
    const options = findAll.mock.calls[0][0];
    expect(options.order).toEqual([
      ['position', 'ASC'],
      [{ model: StudentTask, as: 'tasks' }, 'position', 'ASC'],
    ]);
  });

  it('puts NO order inside the include, because Sequelize would ignore it', async () => {
    // The regression this file exists for. An include-level order reads as ordered and is not.
    await request(await buildApp()).get('/api/portal/project/tasks').expect(200);

    const options = findAll.mock.calls[0][0];
    for (const include of options.include) {
      expect(include.order).toBeUndefined();
    }
  });

  it('still orders the lists themselves, which was never broken', async () => {
    await request(await buildApp()).get('/api/portal/project/tasks').expect(200);

    const options = findAll.mock.calls[0][0];
    expect(options.order[0]).toEqual(['position', 'ASC']);
  });

  it('includes the tasks association at all', async () => {
    await request(await buildApp()).get('/api/portal/project/tasks').expect(200);

    const options = findAll.mock.calls[0][0];
    expect(options.include).toEqual([{ model: StudentTask, as: 'tasks' }]);
    expect(options.where).toEqual({ project_id: 'project-uuid-001' });
  });

  it('returns an empty list rather than failing when the participant has no project', async () => {
    mockGetProject.mockResolvedValue(null);
    const res = await request(await buildApp()).get('/api/portal/project/tasks').expect(200);
    expect(res.body).toEqual({ taskLists: [] });
    expect(findAll).not.toHaveBeenCalled();
  });
});
