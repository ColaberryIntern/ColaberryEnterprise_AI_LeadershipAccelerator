// Mock models index before any import to prevent Sequelize association setup
const mockFindAll = jest.fn();
const mockSave = jest.fn().mockResolvedValue(undefined);

jest.mock('../../models', () => ({
  GitHubConnection: { findOne: jest.fn() },
  StudentGithubActivity: { findOne: jest.fn(), create: jest.fn() },
  Enrollment: { findAll: jest.fn() },
  RequirementsMap: { findAll: mockFindAll },
}));

// Sequelize Op stub — only 'in' and 'is' are needed by verifyRequirementsFromCommits
jest.mock('sequelize', () => ({
  Op: { in: Symbol('in'), is: Symbol('is'), ne: Symbol('ne') },
  Model: class {},
}));

import { verifyRequirementsFromCommits } from '../githubIntegrationService';

const PROJECT_ID = 'proj-uuid-1111';
const HEAD_SHA = 'abc1234';

function makeRow(key: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `req-${key}`,
    project_id: PROJECT_ID,
    requirement_key: key,
    capability_id: null,
    is_active: true,
    status: 'unmatched',
    metadata: {},
    save: mockSave,
    ...overrides,
  };
}

describe('verifyRequirementsFromCommits', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSave.mockResolvedValue(undefined);
  });

  it('returns early when commits array is empty', async () => {
    const result = await verifyRequirementsFromCommits(PROJECT_ID, [], HEAD_SHA);
    expect(result).toEqual({ verified: 0 });
    expect(mockFindAll).not.toHaveBeenCalled();
  });

  it('returns early when no commit message contains a requirement key', async () => {
    const result = await verifyRequirementsFromCommits(
      PROJECT_ID,
      [{ message: 'fix typo in README' }, { message: 'update package.json' }],
      HEAD_SHA,
    );
    expect(result).toEqual({ verified: 0 });
    expect(mockFindAll).not.toHaveBeenCalled();
  });

  it('flips a matching requirement to verified when commit message contains its key', async () => {
    const row = makeRow('AUTH.001');
    mockFindAll.mockResolvedValue([row]);

    const result = await verifyRequirementsFromCommits(
      PROJECT_ID,
      [{ message: 'implement JWT middleware [AUTH.001]' }],
      HEAD_SHA,
    );

    expect(result).toEqual({ verified: 1 });
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect((row as any).status).toBe('verified');
    expect((row as any).verified_by).toBe('github_push');
    expect((row as any).metadata.github_push_sha).toBe(HEAD_SHA);
  });

  it('extracts keys from multiple commits and verifies all matching rows', async () => {
    const rowAuth = makeRow('AUTH.001');
    const rowData = makeRow('DATA.002');
    mockFindAll.mockResolvedValue([rowAuth, rowData]);

    const result = await verifyRequirementsFromCommits(
      PROJECT_ID,
      [
        { message: 'add login route AUTH.001' },
        { message: 'create user table DATA.002: postgres migration' },
      ],
      HEAD_SHA,
    );

    expect(result).toEqual({ verified: 2 });
    expect(mockSave).toHaveBeenCalledTimes(2);
  });

  it('is idempotent: calling twice keeps status verified, no error', async () => {
    const row = makeRow('AUTH.001', { status: 'verified' });
    mockFindAll.mockResolvedValue([row]);

    await verifyRequirementsFromCommits(PROJECT_ID, [{ message: 'AUTH.001' }], HEAD_SHA);
    await verifyRequirementsFromCommits(PROJECT_ID, [{ message: 'AUTH.001' }], HEAD_SHA);

    expect((row as any).status).toBe('verified');
    expect(mockSave).toHaveBeenCalledTimes(2);
  });

  it('returns 0 when no rows match the mentioned keys', async () => {
    mockFindAll.mockResolvedValue([]);

    const result = await verifyRequirementsFromCommits(
      PROJECT_ID,
      [{ message: 'implement AUTH.001' }],
      HEAD_SHA,
    );

    expect(result).toEqual({ verified: 0 });
  });

  it('propagates DB errors from RequirementsMap.findAll', async () => {
    mockFindAll.mockRejectedValue(new Error('DB connection lost'));

    await expect(
      verifyRequirementsFromCommits(PROJECT_ID, [{ message: 'AUTH.001' }], HEAD_SHA),
    ).rejects.toThrow('DB connection lost');
  });
});
