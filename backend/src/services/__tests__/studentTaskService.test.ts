import { createTasksFromRequirements } from '../studentTaskService';
import RequirementsMap from '../../models/RequirementsMap';
import StudentTaskList from '../../models/StudentTaskList';
import StudentTask from '../../models/StudentTask';
import Project from '../../models/Project';

jest.mock('../../models/RequirementsMap');
jest.mock('../../models/StudentTaskList');
jest.mock('../../models/StudentTask');
jest.mock('../../models/Project');

const PROJECT_ID = 'project-uuid-1111';
const ENROLLMENT_ID = 'enrollment-uuid-2222';

const makeReq = (key: string, text: string, id?: string) => ({
  id: id ?? `req-${key}`,
  project_id: PROJECT_ID,
  requirement_key: key,
  requirement_text: text,
  is_active: true,
});

const TASK_LIST_ROW = { id: 'list-uuid-auth', project_id: PROJECT_ID, cluster: 'AUTH' };
const TASK_LIST_ROW_DATA = { id: 'list-uuid-data', project_id: PROJECT_ID, cluster: 'DATA' };

describe('studentTaskService.createTasksFromRequirements', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns early when project has no active requirements', async () => {
    (RequirementsMap.findAll as jest.Mock).mockResolvedValue([]);

    await createTasksFromRequirements(PROJECT_ID);

    expect(StudentTaskList.findOrCreate).not.toHaveBeenCalled();
    expect(StudentTask.findOrCreate).not.toHaveBeenCalled();
  });

  it('returns early when project row is not found', async () => {
    (RequirementsMap.findAll as jest.Mock).mockResolvedValue([makeReq('AUTH.001', 'Authenticate users')]);
    (Project.findByPk as jest.Mock).mockResolvedValue(null);

    await createTasksFromRequirements(PROJECT_ID);

    expect(StudentTaskList.findOrCreate).not.toHaveBeenCalled();
  });

  it('creates one task list per cluster and one task per requirement', async () => {
    (RequirementsMap.findAll as jest.Mock).mockResolvedValue([
      makeReq('AUTH.001', 'Authenticate users via JWT'),
      makeReq('AUTH.002', 'Support OAuth 2.0 flows'),
      makeReq('DATA.001', 'Store user profiles in Postgres'),
    ]);
    (Project.findByPk as jest.Mock).mockResolvedValue({ id: PROJECT_ID, enrollment_id: ENROLLMENT_ID });
    (StudentTaskList.findOrCreate as jest.Mock)
      .mockResolvedValueOnce([TASK_LIST_ROW, true])
      .mockResolvedValueOnce([TASK_LIST_ROW_DATA, true]);
    (StudentTask.findOrCreate as jest.Mock).mockResolvedValue([{}, true]);

    await createTasksFromRequirements(PROJECT_ID);

    expect(StudentTaskList.findOrCreate).toHaveBeenCalledTimes(2);
    expect(StudentTask.findOrCreate).toHaveBeenCalledTimes(3);
  });

  it('derives cluster correctly from requirement_key prefix', async () => {
    (RequirementsMap.findAll as jest.Mock).mockResolvedValue([
      makeReq('INFRA_OPS.001', 'Set up CI/CD pipeline'),
    ]);
    (Project.findByPk as jest.Mock).mockResolvedValue({ id: PROJECT_ID, enrollment_id: ENROLLMENT_ID });
    (StudentTaskList.findOrCreate as jest.Mock).mockResolvedValue([{ id: 'list-infra', cluster: 'INFRA_OPS' }, true]);
    (StudentTask.findOrCreate as jest.Mock).mockResolvedValue([{}, true]);

    await createTasksFromRequirements(PROJECT_ID);

    const [listCall] = (StudentTaskList.findOrCreate as jest.Mock).mock.calls;
    expect(listCall[0].where.cluster).toBe('INFRA_OPS');
    expect(listCall[0].defaults.title).toBe('Infra Ops Requirements');
  });

  it('is idempotent: calling twice invokes findOrCreate both times without throwing', async () => {
    const reqs = [makeReq('AUTH.001', 'Authenticate users')];
    (RequirementsMap.findAll as jest.Mock).mockResolvedValue(reqs);
    (Project.findByPk as jest.Mock).mockResolvedValue({ id: PROJECT_ID, enrollment_id: ENROLLMENT_ID });
    (StudentTaskList.findOrCreate as jest.Mock).mockResolvedValue([TASK_LIST_ROW, false]);
    (StudentTask.findOrCreate as jest.Mock).mockResolvedValue([{}, false]);

    await createTasksFromRequirements(PROJECT_ID);
    await createTasksFromRequirements(PROJECT_ID);

    // 2 calls per run = 4 total across two runs
    expect(StudentTaskList.findOrCreate).toHaveBeenCalledTimes(2);
    expect(StudentTask.findOrCreate).toHaveBeenCalledTimes(2);
  });

  it('truncates long requirement text to 120 chars for the task title', async () => {
    const longText = 'A'.repeat(200);
    (RequirementsMap.findAll as jest.Mock).mockResolvedValue([makeReq('SEC.001', longText)]);
    (Project.findByPk as jest.Mock).mockResolvedValue({ id: PROJECT_ID, enrollment_id: ENROLLMENT_ID });
    (StudentTaskList.findOrCreate as jest.Mock).mockResolvedValue([{ id: 'list-sec' }, true]);
    (StudentTask.findOrCreate as jest.Mock).mockResolvedValue([{}, true]);

    await createTasksFromRequirements(PROJECT_ID);

    const [taskCall] = (StudentTask.findOrCreate as jest.Mock).mock.calls;
    expect(taskCall[0].defaults.title.length).toBeLessThanOrEqual(120);
    expect(taskCall[0].defaults.title.endsWith('...')).toBe(true);
  });

  it('propagates errors from RequirementsMap.findAll', async () => {
    (RequirementsMap.findAll as jest.Mock).mockRejectedValue(new Error('DB connection lost'));

    await expect(createTasksFromRequirements(PROJECT_ID)).rejects.toThrow('DB connection lost');
  });
});
