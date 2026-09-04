const mockGetProjectByEnrollment = jest.fn();
jest.mock('../../projectService', () => ({ getProjectByEnrollment: (...a: any[]) => mockGetProjectByEnrollment(...a) }));

const mockGitHubConnectionFindOne = jest.fn();
jest.mock('../../../models/GitHubConnection', () => ({ __esModule: true, default: { findOne: (...a: any[]) => mockGitHubConnectionFindOne(...a) } }));

const mockStudentTaskFindAll = jest.fn();
jest.mock('../../../models/StudentTask', () => ({ __esModule: true, default: { findAll: (...a: any[]) => mockStudentTaskFindAll(...a) } }));

import { getProjectProgressField } from '../projectProgressSource';

beforeEach(() => {
  jest.clearAllMocks();
  mockGitHubConnectionFindOne.mockResolvedValue(null);
  mockStudentTaskFindAll.mockResolvedValue([]);
});

describe('getProjectProgressField', () => {
  it('happy path: reuses getProjectByEnrollment() (the real active/non-archived resolver) rather than a raw query', async () => {
    mockGetProjectByEnrollment.mockResolvedValue({
      id: 'proj-1', name: 'Support Copilot', project_stage: 'implementation', requirements_completion_pct: 55, progress_computed_at: new Date('2026-09-01'),
    });
    mockGitHubConnectionFindOne.mockResolvedValue({ id: 'conn-1' });
    mockStudentTaskFindAll.mockResolvedValue([
      { id: 't1', status: 'done', verified_at: new Date('2026-08-20') },
      { id: 't2', status: 'in_progress', verified_at: null },
    ]);

    const field = await getProjectProgressField('enrollment-1');

    expect(field.status).toBe('known');
    expect(field.value).toEqual({
      name: 'Support Copilot', stage: 'implementation', requirementsCompletionPct: 55,
      repoConnected: true, totalStories: 2, verifiedStories: 1,
    });
    expect(mockGetProjectByEnrollment).toHaveBeenCalledWith('enrollment-1');
  });

  it('honesty boundary: verifiedStories counts only real platform-confirmed verification, never the student\'s own self-reported status', async () => {
    mockGetProjectByEnrollment.mockResolvedValue({ id: 'proj-1', name: 'X', project_stage: 'discovery', requirements_completion_pct: 0 });
    mockStudentTaskFindAll.mockResolvedValue([
      { id: 't1', status: 'done', verified_at: null }, // self-reported done, NOT platform-verified
      { id: 't2', status: 'todo', verified_at: null },
    ]);

    const field = await getProjectProgressField('enrollment-1');

    expect(field.value?.verifiedStories).toBe(0);
    expect(field.value?.totalStories).toBe(2);
  });

  it('honesty boundary: no active project is unknown, not a fabricated empty project', async () => {
    mockGetProjectByEnrollment.mockResolvedValue(null);

    const field = await getProjectProgressField('enrollment-1');

    expect(field.status).toBe('unknown');
    expect(field.value).toBeNull();
  });

  it('no repo connection is honestly reflected as repoConnected:false', async () => {
    mockGetProjectByEnrollment.mockResolvedValue({ id: 'proj-1', name: 'X', project_stage: 'discovery', requirements_completion_pct: 0 });

    const field = await getProjectProgressField('enrollment-1');

    expect(field.value?.repoConnected).toBe(false);
  });
});
