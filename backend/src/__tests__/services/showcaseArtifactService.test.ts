/**
 * Tier-B showcase-artifact service tests (BC #9985689928).
 * No DB I/O — Project, ShowcaseArtifact, and the OpenAI client are all mocked.
 */

const mockProjectFindByPk = jest.fn();
const mockArtifactFindOrCreate = jest.fn();
const mockArtifactFindAll = jest.fn();
const mockChatCreate = jest.fn();

jest.mock('../../config/database', () => ({
  sequelize: { authenticate: jest.fn(), close: jest.fn(), query: jest.fn(), define: jest.fn() },
  connectDatabase: jest.fn(),
}));

jest.mock('../../models/Project', () => ({
  __esModule: true,
  default: { findByPk: mockProjectFindByPk },
}));

jest.mock('../../models/ShowcaseArtifact', () => ({
  __esModule: true,
  default: { findOrCreate: mockArtifactFindOrCreate, findAll: mockArtifactFindAll },
}));

jest.mock('../../services/openaiInstrumented', () => ({
  getInstrumentedOpenAI: jest.fn(() => ({
    chat: { completions: { create: mockChatCreate } },
  })),
}));

import {
  scaffoldShowcaseSlots,
  listShowcaseArtifacts,
  draftShowcaseArtifact,
  SHOWCASE_ARTIFACT_TYPES,
} from '../../services/showcaseArtifactService';

beforeEach(() => jest.clearAllMocks());

const PROJECT = { id: 'proj-1', enrollment_id: 'enr-1', name: 'Test Project' };

describe('scaffoldShowcaseSlots', () => {
  it('creates all 4 slots for a project (happy path)', async () => {
    mockProjectFindByPk.mockResolvedValue(PROJECT);
    mockArtifactFindOrCreate.mockImplementation(({ where }: any) =>
      Promise.resolve([{ id: `slot-${where.artifact_type}`, ...where }, true])
    );

    const slots = await scaffoldShowcaseSlots('proj-1');

    expect(slots).toHaveLength(4);
    expect(mockArtifactFindOrCreate).toHaveBeenCalledTimes(4);
    expect(slots.map((s: any) => s.artifact_type)).toEqual(SHOWCASE_ARTIFACT_TYPES);
  });

  it('is idempotent — re-running returns existing slots without duplicating', async () => {
    mockProjectFindByPk.mockResolvedValue(PROJECT);
    mockArtifactFindOrCreate.mockImplementation(({ where }: any) =>
      Promise.resolve([{ id: `existing-${where.artifact_type}`, ...where }, false])
    );

    await scaffoldShowcaseSlots('proj-1');
    await scaffoldShowcaseSlots('proj-1');

    expect(mockArtifactFindOrCreate).toHaveBeenCalledTimes(8); // 4 types x 2 runs, never a raw create()
  });

  it('throws NotFoundError when project does not exist (failure path)', async () => {
    mockProjectFindByPk.mockResolvedValue(null);
    await expect(scaffoldShowcaseSlots('bad-project')).rejects.toMatchObject({
      message: 'Project not found',
      error_class: 'NotFoundError',
    });
    expect(mockArtifactFindOrCreate).not.toHaveBeenCalled();
  });
});

describe('listShowcaseArtifacts', () => {
  it('returns slots in stable type order regardless of DB row order (boundary)', async () => {
    mockProjectFindByPk.mockResolvedValue(PROJECT);
    mockArtifactFindAll.mockResolvedValue([
      { artifact_type: 'ppt' },
      { artifact_type: 'demo_video' },
    ]);

    const slots = await listShowcaseArtifacts('proj-1');

    expect(slots.map((s: any) => s.artifact_type)).toEqual(['demo_video', 'ppt']);
  });

  it('returns an empty array when no slots have been scaffolded yet (boundary)', async () => {
    mockProjectFindByPk.mockResolvedValue(PROJECT);
    mockArtifactFindAll.mockResolvedValue([]);

    expect(await listShowcaseArtifacts('proj-1')).toEqual([]);
  });
});

describe('draftShowcaseArtifact', () => {
  it('drafts content and saves it to the slot (happy path)', async () => {
    mockProjectFindByPk.mockResolvedValue(PROJECT);
    const update = jest.fn().mockResolvedValue(undefined);
    mockArtifactFindOrCreate.mockResolvedValue([{ id: 'slot-1', artifact_type: 'demo_video', update }, false]);
    mockChatCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ title: 'Demo', scenes: [] }) } }],
    });

    const slot = await draftShowcaseArtifact('proj-1', 'demo_video');

    expect(slot).toBeDefined();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'drafted',
      draft_content: { title: 'Demo', scenes: [] },
    }));
  });

  it('rejects an unknown artifact type before touching the DB (boundary)', async () => {
    await expect(draftShowcaseArtifact('proj-1', 'oil_painting' as any)).rejects.toMatchObject({
      error_class: 'ValidationError',
    });
    expect(mockProjectFindByPk).not.toHaveBeenCalled();
  });

  it('throws NotFoundError for a missing project (boundary)', async () => {
    mockProjectFindByPk.mockResolvedValue(null);
    await expect(draftShowcaseArtifact('bad-project', 'ppt')).rejects.toMatchObject({
      error_class: 'NotFoundError',
    });
  });

  it('surfaces an UpstreamUnavailable error and does not write a partial draft on LLM failure', async () => {
    mockProjectFindByPk.mockResolvedValue(PROJECT);
    const update = jest.fn();
    mockArtifactFindOrCreate.mockResolvedValue([{ id: 'slot-1', artifact_type: 'ppt', update }, false]);
    mockChatCreate.mockRejectedValue(new Error('rate limited'));

    await expect(draftShowcaseArtifact('proj-1', 'ppt')).rejects.toMatchObject({
      error_class: 'UpstreamUnavailable',
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('surfaces UpstreamUnavailable and writes nothing when the LLM returns unparseable content (failure path)', async () => {
    mockProjectFindByPk.mockResolvedValue(PROJECT);
    const update = jest.fn();
    mockArtifactFindOrCreate.mockResolvedValue([{ id: 'slot-1', artifact_type: 'one_pager_infographic', update }, false]);
    mockChatCreate.mockResolvedValue({ choices: [{ message: { content: 'not json' } }] });

    await expect(draftShowcaseArtifact('proj-1', 'one_pager_infographic')).rejects.toMatchObject({
      error_class: 'UpstreamUnavailable',
    });
    expect(update).not.toHaveBeenCalled();
  });
});
