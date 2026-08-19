/**
 * The three legacy writers, against the two ways they destroyed student work.
 *
 * `claudeMdService.pushClaudeMdToRepo` and
 * `projectScaffoldService.generateAndPushScaffold` predate the SBP pipeline.
 * Both full-replaced `CLAUDE.md` — the same file the SBP writer splices a
 * managed block into — so one sync through either path deleted that block and
 * anything the student had written beside it. Neither asked whether the platform
 * had push access before trying.
 *
 * These tests pin the repaired behaviour at the WRITER level, not at the helper
 * level: the bug was never in `spliceManagedBlock`, it was in the two callers
 * that did not use it. A test of the splice in isolation would have passed
 * throughout the entire period the writers were destroying files.
 */
import { BLOCK_BEGIN, BLOCK_END } from '../sbp/managedBlock';

// ── mocks ───────────────────────────────────────────────────────────────────
// `../models` is mocked with a factory so the 1000-line Sequelize barrel is
// never loaded; ts-jest would otherwise pull the whole model graph in.
jest.mock('../../models', () => ({
  Project: {},
  RequirementsMap: {},
  NextAction: { findOne: jest.fn().mockResolvedValue(null), findAll: jest.fn().mockResolvedValue([]) },
  ProgressionLog: {},
  ProjectSystemContract: { findOne: jest.fn().mockResolvedValue(null) },
  GitHubConnection: { findOne: jest.fn() },
  StudentGithubActivity: {},
  Enrollment: {},
}));

jest.mock('../projectService', () => ({
  getProjectByEnrollment: jest.fn().mockResolvedValue({
    id: 'proj-1',
    organization_name: 'Acme',
    industry: 'Logistics',
    project_stage: 'build',
  }),
}));

jest.mock('../requirementsMatchingService', () => ({
  getRequirementsStatus: jest.fn().mockResolvedValue({ requirements: [] }),
}));

jest.mock('../projectProgressService', () => ({
  calculateProgress: jest.fn().mockResolvedValue({
    requirementsCompletionPct: 10,
    productionReadinessScore: 20,
  }),
}));

jest.mock('../githubService', () => ({
  getConnection: jest.fn(),
  readFileFromRepo: jest.fn(),
  writeFileToRepo: jest.fn().mockResolvedValue({ sha: 'abc' }),
  writeMultipleFilesToRepo: jest.fn().mockImplementation(
    (_e: string, files: Array<{ path: string }>) => Promise.resolve({ filesWritten: files.length }),
  ),
}));

import { getConnection, readFileFromRepo, writeFileToRepo, writeMultipleFilesToRepo } from '../githubService';
import { pushClaudeMdToRepo } from '../claudeMdService';
import { generateAndPushScaffold } from '../projectScaffoldService';

const mockGetConnection = getConnection as jest.Mock;
const mockReadFile = readFileFromRepo as jest.Mock;
const mockWriteFile = writeFileToRepo as jest.Mock;
const mockWriteMany = writeMultipleFilesToRepo as jest.Mock;

/** A connection GitHub told us we may push to. */
const WRITABLE = {
  repo_owner: 'student',
  repo_name: 'workspace',
  access_token_encrypted: 'tok',
  status_json: { connect: { state: 'connected', platform_can_push: true } },
};

/** A connection GitHub told us is read-only — 12 of 14 live rows look like this. */
const PULL_ONLY = {
  repo_owner: 'student',
  repo_name: 'workspace',
  access_token_encrypted: 'tok',
  status_json: { connect: { state: 'connected', platform_can_push: false } },
};

/** What a real student's CLAUDE.md looks like: their prose, our block below it. */
const STUDENT_CLAUDE_MD = `# CLAUDE.md

## My conventions
- Always run the linter before committing.
- Never touch the vendor directory.

${BLOCK_BEGIN}
managed content from a previous SBP publish
${BLOCK_END}
`;

beforeEach(() => {
  jest.clearAllMocks();
  mockWriteFile.mockResolvedValue({ sha: 'abc' });
  mockWriteMany.mockImplementation(
    (_e: string, files: Array<{ path: string }>) => Promise.resolve({ filesWritten: files.length }),
  );
});

// ── 1. CLAUDE.md is spliced, never replaced ─────────────────────────────────

describe('pushClaudeMdToRepo does not destroy the student CLAUDE.md', () => {
  it('keeps the prose the student wrote above our block', async () => {
    mockGetConnection.mockResolvedValue(WRITABLE);
    mockReadFile.mockResolvedValue(STUDENT_CLAUDE_MD);

    await pushClaudeMdToRepo('enr-1');

    const call = mockWriteFile.mock.calls.find((c: unknown[]) => c[1] === 'CLAUDE.md');
    expect(call).toBeDefined();
    const written = call![2] as string;

    expect(written).toContain('Always run the linter before committing.');
    expect(written).toContain('Never touch the vendor directory.');
  });

  it('leaves exactly one managed block, not a second one appended', async () => {
    mockGetConnection.mockResolvedValue(WRITABLE);
    mockReadFile.mockResolvedValue(STUDENT_CLAUDE_MD);

    await pushClaudeMdToRepo('enr-1');

    const written = mockWriteFile.mock.calls.find((c: unknown[]) => c[1] === 'CLAUDE.md')![2] as string;
    const begins = written.split('COLABERRY:BEGIN').length - 1;
    expect(begins).toBe(1);
  });

  it('appends rather than clobbering when their file cannot be read', async () => {
    mockGetConnection.mockResolvedValue(WRITABLE);
    // A failed read is null. Splicing against null must APPEND our block, never
    // replace a file we could not see.
    mockReadFile.mockResolvedValue(null);

    await pushClaudeMdToRepo('enr-1');

    const written = mockWriteFile.mock.calls.find((c: unknown[]) => c[1] === 'CLAUDE.md')![2] as string;
    expect(written).toContain(BLOCK_BEGIN);
    expect(written).toContain(BLOCK_END);
  });
});

// ── 2. The write guard ──────────────────────────────────────────────────────

describe('the legacy writers do not push to a repo we cannot write', () => {
  it('pushClaudeMdToRepo attempts nothing on a pull-only repo', async () => {
    mockGetConnection.mockResolvedValue(PULL_ONLY);

    const result = await pushClaudeMdToRepo('enr-1');

    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(result.skipped).toBe('no_write_access');
    expect(result.claudeMd).toBe(false);
  });

  it('generateAndPushScaffold refuses a pull-only repo before any write', async () => {
    mockGetConnection.mockResolvedValue(PULL_ONLY);

    await expect(generateAndPushScaffold('enr-1')).rejects.toThrow(/push access/i);
    expect(mockWriteMany).not.toHaveBeenCalled();
  });
});

// ── 3. The scaffold stays out of the student's source tree ──────────────────

describe('the scaffold does not scatter files through a student source tree', () => {
  it('writes no .gitkeep stubs into src/, tests/ or docs/', async () => {
    mockGetConnection.mockResolvedValue(WRITABLE);
    mockReadFile.mockResolvedValue(null);

    await generateAndPushScaffold('enr-1');

    const paths = (mockWriteMany.mock.calls[0][1] as Array<{ path: string }>).map((f) => f.path);
    expect(paths.filter((p) => p.endsWith('.gitkeep'))).toEqual([]);
    expect(paths.some((p) => p.startsWith('src/'))).toBe(false);
  });

  it('every path it does write is inside the legacy policy', async () => {
    mockGetConnection.mockResolvedValue(WRITABLE);
    mockReadFile.mockResolvedValue(null);

    await generateAndPushScaffold('enr-1');

    const paths = (mockWriteMany.mock.calls[0][1] as Array<{ path: string }>).map((f) => f.path);
    const allowed = [/^CLAUDE\.md$/, /^PROJECT_STATE\.json$/, /^requirements\/[^/]+\.md$/, /^README\.md$/, /^\.gitignore$/];
    for (const p of paths) {
      expect(allowed.some((re) => re.test(p))).toBe(true);
    }
  });

  it('splices rather than replaces the CLAUDE.md it scaffolds', async () => {
    mockGetConnection.mockResolvedValue(WRITABLE);
    mockReadFile.mockImplementation((_e: string, path: string) =>
      Promise.resolve(path === 'CLAUDE.md' ? STUDENT_CLAUDE_MD : null));

    await generateAndPushScaffold('enr-1');

    const files = mockWriteMany.mock.calls[0][1] as Array<{ path: string; content: string }>;
    const claude = files.find((f) => f.path === 'CLAUDE.md');
    expect(claude).toBeDefined();
    expect(claude!.content).toContain('Always run the linter before committing.');
  });

  it('does not overwrite a README the student has written', async () => {
    mockGetConnection.mockResolvedValue(WRITABLE);
    mockReadFile.mockImplementation((_e: string, path: string) =>
      Promise.resolve(path === 'README.md' ? '# My own README\n\nI wrote this.' : null));

    await generateAndPushScaffold('enr-1');

    const files = mockWriteMany.mock.calls[0][1] as Array<{ path: string; content: string }>;
    expect(files.find((f) => f.path === 'README.md')).toBeUndefined();
  });
});
