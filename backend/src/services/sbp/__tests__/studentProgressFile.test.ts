/**
 * studentProgressFile — can a CONNECTED, PULL-ONLY student actually reach their
 * own progress file?
 *
 * That is the whole question, and it is the one two previous rounds of copy
 * never asked. The panel first told these students to build the file from
 * STORY-000's example block, which contains one story. The correction pointed
 * them at `.colaberry/progress.seed.json`, which `seedPathFor` produces in
 * exactly one place — inside the docs zip — and which, read live from all
 * fifteen pull-only repos on 2026-08-21, is in NONE of them.
 *
 * So these tests are about REACHABILITY and about not destroying anything on the
 * way. They stand on `repoForProject` being the wrong lookup here (it answers
 * null for precisely this cohort), on the file arriving at the live path rather
 * than a seed sibling, and on the merge preserving what the student already has.
 */
const mockPublished = jest.fn();
const mockLatest = jest.fn();
jest.mock('../planStore', () => ({
  getPublishedPlan: (...a: unknown[]) => mockPublished(...a),
  getPlan: (...a: unknown[]) => mockLatest(...a),
}));

const mockWriteAccess = jest.fn(async () => 'pull_only');
jest.mock('../repoWriteAccess', () => ({
  repoWriteAccessForProject: (...a: unknown[]) => mockWriteAccess(...(a as [])),
}));

jest.mock('../buildProgressSnapshot', () => ({
  loadBuildProgress: jest.fn(async () => ({ progress: [], baselineByStory: {} })),
}));

const mockReadProgress = jest.fn(async () => null as string | null);
jest.mock('../repoWriter', () => ({
  readRepoProgressFile: (...a: unknown[]) => mockReadProgress(...(a as [])),
}));

const mockConnection = jest.fn();
jest.mock('../../../models/GitHubConnection', () => ({
  __esModule: true,
  default: { findOne: (...a: unknown[]) => mockConnection(...a) },
}));
// The BARREL, for `repoForProject` — the lookup this feature must NOT use. Wired
// to the same row so the two answers are compared against identical input.
jest.mock('../../../models', () => ({
  GitHubConnection: { findOne: (...a: unknown[]) => mockConnection(...a) },
}));
jest.mock('../../../models/Project', () => ({
  __esModule: true,
  default: { findByPk: jest.fn(async () => ({ id: 'prj-1', enrollment_id: 'enr-1' })) },
}));

import { buildStudentProgressFile } from '../studentProgressFile';
import { PROGRESS_FILE_PATH } from '../verification/progressContract';
import { repoForProject } from '../workspaceRepo';
import { BuildPlan } from '../planContract';
import raw from './fixtures/pilot-dryrun-plan.json';

const pilot = raw as unknown as BuildPlan;
const PRJ = '248d9d63-2543-45a1-b3f9-d1f691a8428a';

const stored = (over: Record<string, unknown> = {}) => ({
  id: 'plan-1', project_id: PRJ, version: 3, status: 'published',
  plan: pilot, plan_sha256: 'abc123', gate_ok: true, gate_violations: [],
  model: null, attempts: 1, correlation_id: 'corr-1',
  published_at: '2026-08-14T00:00:00Z', created_at: '2026-08-13T00:00:00Z', ...over,
});

/**
 * A pull-only connection row, in the shape the affected rows actually have.
 *
 * `platform_can_push: false` under `status_json.connect` is what `writeAccessOf`
 * reads, and `provisioned: false` is its recorded sibling — both, because
 * `writeAccessPatch` exists precisely so that half of this answer cannot be
 * written on its own. Getting the shape right matters here: a fixture that only
 * LOOKS pull-only reads back as `access_unknown`, and the assertion that
 * `repoForProject` refuses this row would then be passing for the wrong reason.
 */
const pullOnlyRow = () => ({
  project_id: PRJ,
  repo_owner: 'HellenMuhonjaData',
  repo_name: 'MeshMedic',
  repo_url: 'https://github.com/HellenMuhonjaData/MeshMedic',
  status_json: {
    provisioned: false,
    connect: { platform_can_push: false, default_branch: 'main' },
  },
});

const HELLENS_NINE = [
  'updatedAt', 'storyStatus', 'systemStatus', 'guardrailEnforced',
  'agentsScoped', 'outcomes', 'story000', 'decisions', 'notes',
];

const hellensFile = (storyId: string, criteria: string[]): string => JSON.stringify({
  schema_version: 2,
  project: 'MeshMedic',
  updatedAt: '2026-08-18T09:00:00Z',
  storyStatus: { [storyId]: 'done' },
  systemStatus: 'green',
  guardrailEnforced: true,
  agentsScoped: ['intake'],
  outcomes: [{ metric: 'referral_time', baseline: 48 }],
  story000: { command_center_url: 'https://hellen.example/mesh' },
  decisions: [{ on: '2026-08-16', chose: 'Vercel over Pages', because: 'custom domain' }],
  notes: 'Command Center reads storyStatus and decisions at runtime.',
  stories: [{ id: storyId, criteria: criteria.map((text) => ({ text, passed: true })) }],
}, null, 2);

beforeEach(() => {
  jest.clearAllMocks();
  mockPublished.mockResolvedValue(stored());
  mockLatest.mockResolvedValue(null);
  mockWriteAccess.mockResolvedValue('pull_only');
  mockConnection.mockResolvedValue(pullOnlyRow());
  mockReadProgress.mockResolvedValue(null);
});

describe('a pull-only student can reach their own progress file', () => {
  it('delivers it at the live path, never at a seed sibling they do not have', async () => {
    const file = await buildStudentProgressFile(PRJ);
    expect(file.path).toBe(PROGRESS_FILE_PATH);
    expect(file.path).not.toContain('.seed.');
    expect(file.filename).toBe('progress.json');
  });

  /**
   * The lookup that would have made this silently useless.
   *
   * `repoForProject` answers "is there a repo worth attempting a WRITE against"
   * and returns null for a pull-only connection by design. Routed through it,
   * this feature would return the blank seed to every student it exists for and
   * look like it was working. Asserted rather than commented, because the two
   * functions are one character apart at a call site.
   */
  it('reads the repo even though repoForProject refuses it', async () => {
    // Refused for the RIGHT reason: `pull_only`, the students' own recorded
    // choice, not `access_unknown` from a fixture that never said anything.
    const { writeAccessOf } = await import('../repoConnect/connectionAccess');
    expect(writeAccessOf(pullOnlyRow())).toBe('pull_only');
    expect(await repoForProject(PRJ)).toBeNull();
    const file = await buildStudentProgressFile(PRJ);
    expect(file.repo).toBe('HellenMuhonjaData/MeshMedic');
    expect(mockReadProgress).toHaveBeenCalledWith(
      { owner: 'HellenMuhonjaData', repo: 'MeshMedic' },
      expect.anything(),
    );
  });

  it('carries every story in the plan, not just the first', async () => {
    const file = await buildStudentProgressFile(PRJ);
    const out = JSON.parse(file.content);
    expect(out.stories.length).toBeGreaterThan(1);
    expect(file.merge.stories).toBe(out.stories.length);
    for (const story of out.stories) {
      expect(Array.isArray(story.criteria)).toBe(true);
    }
  });

  it('writes each criterion in the exact words the plan asks for', async () => {
    const out = JSON.parse((await buildStudentProgressFile(PRJ)).content);
    const first = pilot.stories[0];
    const mirrored = out.stories.find((s: any) => s.id === first.id);
    expect(mirrored.criteria.map((c: any) => c.text)).toEqual(first.acceptance);
  });
});

describe('it cannot destroy what the student already has', () => {
  it('keeps all nine of Hellen Muhonja\'s custom top-level keys', async () => {
    const first = pilot.stories[0];
    mockReadProgress.mockResolvedValue(hellensFile(first.id, first.acceptance));
    const file = await buildStudentProgressFile(PRJ);
    expect(file.merge.preserved_top_level_keys).toEqual(HELLENS_NINE);
    const out = JSON.parse(file.content);
    expect(out.decisions).toEqual([
      { on: '2026-08-16', chose: 'Vercel over Pages', because: 'custom domain' },
    ]);
  });

  it('keeps their ticks while adding the stories that were missing', async () => {
    const first = pilot.stories[0];
    mockReadProgress.mockResolvedValue(hellensFile(first.id, first.acceptance));
    const file = await buildStudentProgressFile(PRJ);
    expect(file.merge.existing).toBe('merged');
    expect(file.merge.criteria_passed).toBe(first.acceptance.length);
    expect(file.merge.stories).toBeGreaterThan(1);
  });

  it('says so rather than claiming a merge when their file cannot be read', async () => {
    mockReadProgress.mockResolvedValue('{ this is not json');
    const file = await buildStudentProgressFile(PRJ);
    expect(file.merge.existing).toBe('unreadable');
  });

  it('is safe to run twice — byte-identical, no duplicate stories, no reverted tick', async () => {
    const first = pilot.stories[0];
    mockReadProgress.mockResolvedValue(hellensFile(first.id, first.acceptance));
    const once = await buildStudentProgressFile(PRJ);

    mockReadProgress.mockResolvedValue(once.content);
    const twice = await buildStudentProgressFile(PRJ);

    expect(twice.content).toBe(once.content);
    const ids = JSON.parse(twice.content).stories.map((s: any) => s.id);
    expect(ids).toEqual([...new Set(ids)]);
    expect(twice.merge.criteria_passed).toBe(once.merge.criteria_passed);
  });
});

describe('when there is nothing to merge over', () => {
  it('hands over the clean seed rather than failing', async () => {
    mockReadProgress.mockResolvedValue(null);
    const file = await buildStudentProgressFile(PRJ);
    expect(file.merge.existing).toBe('absent');
    expect(file.merge.criteria_passed).toBe(0);
    expect(file.merge.stories).toBeGreaterThan(0);
  });

  it('works with no repo connected at all, without pretending one was read', async () => {
    mockConnection.mockResolvedValue(null);
    const file = await buildStudentProgressFile(PRJ);
    expect(file.repo).toBeNull();
    expect(mockReadProgress).not.toHaveBeenCalled();
    expect(file.merge.existing).toBe('absent');
  });

  it('refuses clearly when the project has no plan at all', async () => {
    mockPublished.mockResolvedValue(null);
    mockLatest.mockResolvedValue(null);
    await expect(buildStudentProgressFile(PRJ)).rejects.toMatchObject({
      error_class: 'NoPublishedPlan',
    });
  });
});
