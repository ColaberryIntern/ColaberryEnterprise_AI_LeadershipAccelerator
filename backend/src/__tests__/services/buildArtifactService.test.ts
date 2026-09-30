/**
 * Tier-A build-artifact slot service tests (BC #9985689899).
 * No DB I/O — Project and Artifact are both mocked.
 */

const mockProjectFindByPk = jest.fn();
const mockArtifactFindOrCreate = jest.fn();
const mockArtifactFindAll = jest.fn();
const mockArtifactFindOne = jest.fn();

jest.mock('../../config/database', () => ({
  sequelize: { authenticate: jest.fn(), close: jest.fn(), query: jest.fn(), define: jest.fn() },
  connectDatabase: jest.fn(),
}));

jest.mock('../../models/Project', () => ({
  __esModule: true,
  default: { findByPk: mockProjectFindByPk },
}));

jest.mock('../../models/Artifact', () => ({
  __esModule: true,
  default: {
    findOrCreate: mockArtifactFindOrCreate,
    findAll: mockArtifactFindAll,
    findOne: mockArtifactFindOne,
  },
}));

import {
  scaffoldBuildArtifactSlots,
  listBuildArtifacts,
  updateBuildArtifact,
} from '../../services/buildArtifactService';

beforeEach(() => jest.clearAllMocks());

const PROJECT = { id: 'proj-1', enrollment_id: 'enr-1', name: 'Test Project' };

describe('scaffoldBuildArtifactSlots', () => {
  it('creates all 12 weekly slots for a project (happy path)', async () => {
    mockProjectFindByPk.mockResolvedValue(PROJECT);
    mockArtifactFindOrCreate.mockImplementation(({ where }: any) =>
      Promise.resolve([{ id: `slot-${where.week_number}`, ...where }, true])
    );

    const slots = await scaffoldBuildArtifactSlots('proj-1');

    expect(slots).toHaveLength(12);
    expect(mockArtifactFindOrCreate).toHaveBeenCalledTimes(12);
    expect(slots.map((s: any) => s.week_number)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
  });

  it('is idempotent — re-running returns existing slots without duplicating', async () => {
    mockProjectFindByPk.mockResolvedValue(PROJECT);
    mockArtifactFindOrCreate.mockImplementation(({ where }: any) =>
      Promise.resolve([{ id: `existing-${where.week_number}`, ...where }, false])
    );

    await scaffoldBuildArtifactSlots('proj-1');
    await scaffoldBuildArtifactSlots('proj-1');

    expect(mockArtifactFindOrCreate).toHaveBeenCalledTimes(24); // 12 weeks x 2 runs, never a raw create()
  });

  it('throws NotFoundError when project does not exist (failure path)', async () => {
    mockProjectFindByPk.mockResolvedValue(null);
    await expect(scaffoldBuildArtifactSlots('bad-project')).rejects.toMatchObject({
      message: 'Project not found',
      error_class: 'NotFoundError',
    });
    expect(mockArtifactFindOrCreate).not.toHaveBeenCalled();
  });
});

describe('listBuildArtifacts', () => {
  it('returns slots in stable week order regardless of DB row order (boundary)', async () => {
    mockProjectFindByPk.mockResolvedValue(PROJECT);
    mockArtifactFindAll.mockResolvedValue([
      { week_number: 5 },
      { week_number: 1 },
      { week_number: 12 },
    ]);

    const slots = await listBuildArtifacts('proj-1');

    expect(slots.map((s: any) => s.week_number)).toEqual([1, 5, 12]);
  });

  it('returns an empty array when no slots have been scaffolded yet (boundary)', async () => {
    mockProjectFindByPk.mockResolvedValue(PROJECT);
    mockArtifactFindAll.mockResolvedValue([]);

    expect(await listBuildArtifacts('proj-1')).toEqual([]);
  });

  it('throws NotFoundError for a missing project (failure path)', async () => {
    mockProjectFindByPk.mockResolvedValue(null);
    await expect(listBuildArtifacts('bad-project')).rejects.toMatchObject({
      error_class: 'NotFoundError',
    });
  });
});

describe('updateBuildArtifact', () => {
  it('updates url and status on the target week slot (happy path)', async () => {
    mockProjectFindByPk.mockResolvedValue(PROJECT);
    const update = jest.fn().mockResolvedValue(undefined);
    mockArtifactFindOne.mockResolvedValue({ id: 'slot-5', week_number: 5, update });

    const slot = await updateBuildArtifact('proj-1', 5, { url: 'https://github.com/x/y', status: 'submitted' });

    expect(slot).toBeDefined();
    expect(update).toHaveBeenCalledWith({ url: 'https://github.com/x/y', status: 'submitted' });
  });

  it('is idempotent — repeating the same update leaves the same end state', async () => {
    mockProjectFindByPk.mockResolvedValue(PROJECT);
    const update = jest.fn().mockResolvedValue(undefined);
    mockArtifactFindOne.mockResolvedValue({ id: 'slot-5', week_number: 5, update });

    await updateBuildArtifact('proj-1', 5, { status: 'submitted' });
    await updateBuildArtifact('proj-1', 5, { status: 'submitted' });

    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenNthCalledWith(1, { status: 'submitted' });
    expect(update).toHaveBeenNthCalledWith(2, { status: 'submitted' });
  });

  it('rejects a week_number outside 1-12 before touching the DB (boundary)', async () => {
    await expect(updateBuildArtifact('proj-1', 0, { status: 'submitted' })).rejects.toMatchObject({
      error_class: 'ValidationError',
    });
    await expect(updateBuildArtifact('proj-1', 13, { status: 'submitted' })).rejects.toMatchObject({
      error_class: 'ValidationError',
    });
    expect(mockProjectFindByPk).not.toHaveBeenCalled();
  });

  it('rejects an unknown status before touching the DB (boundary)', async () => {
    await expect(updateBuildArtifact('proj-1', 5, { status: 'done' as any })).rejects.toMatchObject({
      error_class: 'ValidationError',
    });
    expect(mockProjectFindByPk).not.toHaveBeenCalled();
  });

  it('throws NotFoundError for a missing project (failure path)', async () => {
    mockProjectFindByPk.mockResolvedValue(null);
    await expect(updateBuildArtifact('bad-project', 5, { status: 'submitted' })).rejects.toMatchObject({
      error_class: 'NotFoundError',
    });
  });

  it('throws NotFoundError when the week slot has not been scaffolded (failure path)', async () => {
    mockProjectFindByPk.mockResolvedValue(PROJECT);
    mockArtifactFindOne.mockResolvedValue(null);

    await expect(updateBuildArtifact('proj-1', 5, { status: 'submitted' })).rejects.toMatchObject({
      error_class: 'NotFoundError',
    });
  });
});
