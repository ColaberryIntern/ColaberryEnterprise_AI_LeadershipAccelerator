/**
 * Build-log -> social drafter tests (BC #9985689786). 4 independently
 * generated/approved sections per week (linkedin_post, video_script,
 * architecture_update, demo_summary) per TRAINING_INTEGRATION_PLAN.md §3.7.
 * No DB I/O — Project, Artifact, BuildLogDraft, and the OpenAI client are
 * all mocked.
 */

const mockProjectFindByPk = jest.fn();
const mockArtifactFindOne = jest.fn();
const mockArtifactFindAll = jest.fn();
const mockDraftFindOrCreate = jest.fn();
const mockDraftFindOne = jest.fn();
const mockDraftFindAll = jest.fn();
const mockChatCreate = jest.fn();

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
  default: { findOne: mockArtifactFindOne, findAll: mockArtifactFindAll },
}));

jest.mock('../../models/BuildLogDraft', () => ({
  __esModule: true,
  default: { findOrCreate: mockDraftFindOrCreate, findOne: mockDraftFindOne, findAll: mockDraftFindAll },
}));

jest.mock('../../services/openaiInstrumented', () => ({
  getInstrumentedOpenAI: jest.fn(() => ({
    chat: { completions: { create: mockChatCreate } },
  })),
}));

import {
  listBuildLogDrafts,
  draftBuildLogPost,
  generateBuildLogDraftsForCompletedWeeks,
  markBuildLogSectionStatus,
  BUILD_LOG_SECTION_TYPES,
} from '../../services/buildLogDraftService';

beforeEach(() => jest.clearAllMocks());

const PROJECT = { id: 'proj-1', enrollment_id: 'enr-1', name: 'Test Project', industry: 'Insurance' };
const SUBMITTED_ARTIFACT = { id: 'artifact-1', project_id: 'proj-1', week_number: 3, status: 'submitted', url: 'https://github.com/x/y' };

function emptySections() {
  const s: any = {};
  for (const t of BUILD_LOG_SECTION_TYPES) s[t] = { content: null, status: 'draft', posted_at: null };
  return s;
}

function sectionReply(type: string) {
  const bodies: Record<string, any> = {
    linkedin_post: { headline: 'Week 3 done', body: 'This week I shipped the requirements engine.', hashtags: ['#Colaberry'] },
    video_script: { hook: 'Watch this!', scenes: [{ narration: 'n', on_screen_action: 'a' }], duration_estimate_seconds: 60 },
    architecture_update: { paragraph: 'The system now supports X.' },
    demo_summary: { title: 'Week 3 demo', outline: [{ heading: 'Intro', talking_points: ['a'] }], duration_estimate_minutes: 5 },
  };
  return { choices: [{ message: { content: JSON.stringify(bodies[type]) } }] };
}

describe('draftBuildLogPost', () => {
  it('drafts all 4 sections for a completed week (happy path)', async () => {
    mockProjectFindByPk.mockResolvedValue(PROJECT);
    mockArtifactFindOne.mockResolvedValue(SUBMITTED_ARTIFACT);
    const update = jest.fn().mockResolvedValue(undefined);
    mockDraftFindOrCreate.mockResolvedValue([{ id: 'draft-1', draft_content: emptySections(), update }, true]);

    for (const type of BUILD_LOG_SECTION_TYPES) mockChatCreate.mockResolvedValueOnce(sectionReply(type));

    await draftBuildLogPost('proj-1', 3);

    expect(mockChatCreate).toHaveBeenCalledTimes(4);
    const [[patch]] = update.mock.calls;
    expect(Object.keys(patch.draft_content)).toEqual(expect.arrayContaining(BUILD_LOG_SECTION_TYPES));
    expect(patch.draft_content.linkedin_post.content.hashtags).toContain('#Colaberry');
    expect(patch.draft_content.video_script.content.hook).toBe('Watch this!');
    expect(patch.draft_content.architecture_update.content.paragraph).toBe('The system now supports X.');
    expect(patch.draft_content.demo_summary.content.title).toBe('Week 3 demo');
    for (const type of BUILD_LOG_SECTION_TYPES) {
      expect(patch.draft_content[type].status).toBe('draft');
      expect(patch.draft_content[type].posted_at).toBeNull();
    }
  });

  it('adds #Colaberry to the linkedin_post when the LLM forgets it (boundary)', async () => {
    mockProjectFindByPk.mockResolvedValue(PROJECT);
    mockArtifactFindOne.mockResolvedValue(SUBMITTED_ARTIFACT);
    const update = jest.fn().mockResolvedValue(undefined);
    mockDraftFindOrCreate.mockResolvedValue([{ id: 'draft-1', draft_content: emptySections(), update }, true]);

    mockChatCreate
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ headline: 'x', body: 'y', hashtags: [] }) } }] })
      .mockResolvedValueOnce(sectionReply('video_script'))
      .mockResolvedValueOnce(sectionReply('architecture_update'))
      .mockResolvedValueOnce(sectionReply('demo_summary'));

    await draftBuildLogPost('proj-1', 3);

    const [[patch]] = update.mock.calls;
    expect(patch.draft_content.linkedin_post.content.hashtags).toEqual(['#Colaberry']);
  });

  it('is idempotent per-section — already-generated sections are not regenerated (boundary)', async () => {
    mockProjectFindByPk.mockResolvedValue(PROJECT);
    mockArtifactFindOne.mockResolvedValue(SUBMITTED_ARTIFACT);
    const partial = emptySections();
    partial.linkedin_post = { content: { headline: 'x', body: 'y', hashtags: ['#Colaberry'] }, status: 'draft', posted_at: null };
    partial.video_script = { content: { hook: 'h', scenes: [], duration_estimate_seconds: 60 }, status: 'posted', posted_at: '2026-07-14T00:00:00.000Z' };
    const update = jest.fn().mockResolvedValue(undefined);
    mockDraftFindOrCreate.mockResolvedValue([{ id: 'draft-1', draft_content: partial, update }, false]);

    mockChatCreate
      .mockResolvedValueOnce(sectionReply('architecture_update'))
      .mockResolvedValueOnce(sectionReply('demo_summary'));

    await draftBuildLogPost('proj-1', 3);

    expect(mockChatCreate).toHaveBeenCalledTimes(2); // only the 2 missing sections
    const [[patch]] = update.mock.calls;
    expect(patch.draft_content.linkedin_post.content.headline).toBe('x'); // untouched
    expect(patch.draft_content.video_script.status).toBe('posted'); // untouched
  });

  it('returns without any LLM call when all 4 sections already exist (boundary)', async () => {
    mockProjectFindByPk.mockResolvedValue(PROJECT);
    mockArtifactFindOne.mockResolvedValue(SUBMITTED_ARTIFACT);
    const full = emptySections();
    for (const type of BUILD_LOG_SECTION_TYPES) full[type] = { content: { x: 1 }, status: 'draft', posted_at: null };
    mockDraftFindOrCreate.mockResolvedValue([{ id: 'draft-1', draft_content: full }, false]);

    const draft = await draftBuildLogPost('proj-1', 3);

    expect(draft.draft_content).toBe(full);
    expect(mockChatCreate).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range week_number before touching the DB (boundary)', async () => {
    await expect(draftBuildLogPost('proj-1', 13)).rejects.toMatchObject({ error_class: 'ValidationError' });
    expect(mockProjectFindByPk).not.toHaveBeenCalled();
  });

  it('throws NotFoundError for a missing project (failure path)', async () => {
    mockProjectFindByPk.mockResolvedValue(null);
    await expect(draftBuildLogPost('bad-project', 3)).rejects.toMatchObject({ error_class: 'NotFoundError' });
  });

  it('throws ValidationError when the week has no submitted/reviewed build artifact yet (failure path)', async () => {
    mockProjectFindByPk.mockResolvedValue(PROJECT);
    mockArtifactFindOne.mockResolvedValue({ ...SUBMITTED_ARTIFACT, status: 'in_progress' });

    await expect(draftBuildLogPost('proj-1', 3)).rejects.toMatchObject({ error_class: 'ValidationError' });
    expect(mockDraftFindOrCreate).not.toHaveBeenCalled();
  });

  it('one section failing does not block the others — partial success is not an error (failure isolation)', async () => {
    mockProjectFindByPk.mockResolvedValue(PROJECT);
    mockArtifactFindOne.mockResolvedValue(SUBMITTED_ARTIFACT);
    const update = jest.fn().mockResolvedValue(undefined);
    mockDraftFindOrCreate.mockResolvedValue([{ id: 'draft-1', draft_content: emptySections(), update }, true]);

    mockChatCreate
      .mockResolvedValueOnce(sectionReply('linkedin_post'))
      .mockRejectedValueOnce(new Error('rate limited')) // video_script fails
      .mockResolvedValueOnce(sectionReply('architecture_update'))
      .mockResolvedValueOnce(sectionReply('demo_summary'));

    const draft = await draftBuildLogPost('proj-1', 3);

    expect(draft).toBeDefined();
    const [[patch]] = update.mock.calls;
    expect(patch.draft_content.linkedin_post.content).not.toBeNull();
    expect(patch.draft_content.video_script.content).toBeNull(); // failed section stays ungenerated, not errored-out
    expect(patch.draft_content.architecture_update.content).not.toBeNull();
    expect(patch.draft_content.demo_summary.content).not.toBeNull();
  });

  it('surfaces UpstreamUnavailable and writes nothing when every section fails (failure path)', async () => {
    mockProjectFindByPk.mockResolvedValue(PROJECT);
    mockArtifactFindOne.mockResolvedValue(SUBMITTED_ARTIFACT);
    const update = jest.fn();
    mockDraftFindOrCreate.mockResolvedValue([{ id: 'draft-1', draft_content: emptySections(), update }, true]);
    mockChatCreate.mockRejectedValue(new Error('rate limited'));

    await expect(draftBuildLogPost('proj-1', 3)).rejects.toMatchObject({ error_class: 'UpstreamUnavailable' });
    expect(update).not.toHaveBeenCalled();
  });
});

describe('listBuildLogDrafts', () => {
  it('returns drafts ordered by week_number (happy path)', async () => {
    mockProjectFindByPk.mockResolvedValue(PROJECT);
    mockDraftFindAll.mockResolvedValue([{ week_number: 2 }, { week_number: 5 }]);

    const drafts = await listBuildLogDrafts('proj-1');

    expect(mockDraftFindAll).toHaveBeenCalledWith(expect.objectContaining({ order: [['week_number', 'ASC']] }));
    expect(drafts).toHaveLength(2);
  });

  it('throws NotFoundError for a missing project (failure path)', async () => {
    mockProjectFindByPk.mockResolvedValue(null);
    await expect(listBuildLogDrafts('bad-project')).rejects.toMatchObject({ error_class: 'NotFoundError' });
  });
});

describe('generateBuildLogDraftsForCompletedWeeks', () => {
  it('drafts new weeks, skips fully-drafted weeks, and isolates per-project failures (happy + failure path)', async () => {
    mockArtifactFindAll.mockResolvedValue([
      { project_id: 'proj-1', week_number: 1, status: 'submitted' },
      { project_id: 'proj-2', week_number: 2, status: 'submitted' },
      { project_id: 'proj-3', week_number: 1, status: 'reviewed' },
    ]);

    const fullSections = emptySections();
    for (const t of BUILD_LOG_SECTION_TYPES) fullSections[t] = { content: { x: 1 }, status: 'draft', posted_at: null };

    // proj-1: no existing draft -> drafted; proj-2: all 4 sections already done -> skipped; proj-3: no draft, but every LLM call fails -> failed
    mockDraftFindOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ draft_content: fullSections })
      .mockResolvedValueOnce(null);

    mockProjectFindByPk.mockImplementation((id: string) => Promise.resolve({ id, enrollment_id: 'enr', name: 'P' }));
    mockArtifactFindOne
      .mockResolvedValueOnce({ id: 'a1', project_id: 'proj-1', week_number: 1, status: 'submitted', url: null })
      .mockResolvedValueOnce({ id: 'a3', project_id: 'proj-3', week_number: 1, status: 'reviewed', url: null });

    const update = jest.fn().mockResolvedValue(undefined);
    mockDraftFindOrCreate
      .mockResolvedValueOnce([{ id: 'd1', draft_content: emptySections(), update }, true])
      .mockResolvedValueOnce([{ id: 'd3', draft_content: emptySections(), update }, true]);

    for (const type of BUILD_LOG_SECTION_TYPES) mockChatCreate.mockResolvedValueOnce(sectionReply(type)); // proj-1 succeeds
    mockChatCreate.mockRejectedValue(new Error('LLM down')); // proj-3 fails entirely thereafter

    const result = await generateBuildLogDraftsForCompletedWeeks();

    expect(result).toEqual({ scanned: 3, drafted: 1, skipped: 1, failed: 1 });
  });

  it('returns all-zero counts when nothing is completed yet (boundary)', async () => {
    mockArtifactFindAll.mockResolvedValue([]);
    const result = await generateBuildLogDraftsForCompletedWeeks();
    expect(result).toEqual({ scanned: 0, drafted: 0, skipped: 0, failed: 0 });
  });
});

describe('markBuildLogSectionStatus', () => {
  it('marks a section posted and sets posted_at the first time (happy path)', async () => {
    mockProjectFindByPk.mockResolvedValue(PROJECT);
    const sections = emptySections();
    sections.linkedin_post = { content: { body: 'x' }, status: 'draft', posted_at: null };
    const update = jest.fn().mockResolvedValue(undefined);
    mockDraftFindOne.mockResolvedValue({ id: 'draft-1', draft_content: sections, update });

    await markBuildLogSectionStatus('proj-1', 'draft-1', 'linkedin_post', 'posted');

    const [[patch]] = update.mock.calls;
    expect(patch.draft_content.linkedin_post.status).toBe('posted');
    expect(patch.draft_content.linkedin_post.posted_at).toEqual(expect.any(String));
  });

  it('is idempotent — marking an already-posted section posted again does not change posted_at (boundary)', async () => {
    mockProjectFindByPk.mockResolvedValue(PROJECT);
    const sections = emptySections();
    sections.linkedin_post = { content: { body: 'x' }, status: 'posted', posted_at: '2026-07-14T00:00:00.000Z' };
    const update = jest.fn().mockResolvedValue(undefined);
    mockDraftFindOne.mockResolvedValue({ id: 'draft-1', draft_content: sections, update });

    await markBuildLogSectionStatus('proj-1', 'draft-1', 'linkedin_post', 'posted');

    const [[patch]] = update.mock.calls;
    expect(patch.draft_content.linkedin_post.posted_at).toBe('2026-07-14T00:00:00.000Z');
  });

  it('leaves other sections untouched when marking one section (boundary)', async () => {
    mockProjectFindByPk.mockResolvedValue(PROJECT);
    const sections = emptySections();
    sections.linkedin_post = { content: { body: 'x' }, status: 'draft', posted_at: null };
    sections.video_script = { content: { hook: 'h' }, status: 'draft', posted_at: null };
    const update = jest.fn().mockResolvedValue(undefined);
    mockDraftFindOne.mockResolvedValue({ id: 'draft-1', draft_content: sections, update });

    await markBuildLogSectionStatus('proj-1', 'draft-1', 'linkedin_post', 'skipped');

    const [[patch]] = update.mock.calls;
    expect(patch.draft_content.video_script.status).toBe('draft');
  });

  it('throws ValidationError for an unknown section (boundary)', async () => {
    mockProjectFindByPk.mockResolvedValue(PROJECT);
    await expect(markBuildLogSectionStatus('proj-1', 'draft-1', 'oil_painting' as any, 'posted')).rejects.toMatchObject({ error_class: 'ValidationError' });
    expect(mockDraftFindOne).not.toHaveBeenCalled();
  });

  it('throws NotFoundError for a missing draft (failure path)', async () => {
    mockProjectFindByPk.mockResolvedValue(PROJECT);
    mockDraftFindOne.mockResolvedValue(null);

    await expect(markBuildLogSectionStatus('proj-1', 'bad-draft', 'linkedin_post', 'skipped')).rejects.toMatchObject({ error_class: 'NotFoundError' });
  });

  it('throws ValidationError when the section has not been generated yet (boundary)', async () => {
    mockProjectFindByPk.mockResolvedValue(PROJECT);
    mockDraftFindOne.mockResolvedValue({ id: 'draft-1', draft_content: emptySections(), update: jest.fn() });

    await expect(markBuildLogSectionStatus('proj-1', 'draft-1', 'linkedin_post', 'skipped')).rejects.toMatchObject({ error_class: 'ValidationError' });
  });
});
