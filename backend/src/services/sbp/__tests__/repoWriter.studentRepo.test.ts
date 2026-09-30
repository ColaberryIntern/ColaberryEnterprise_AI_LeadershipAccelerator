/**
 * The guarantee the connect step depends on: a repo the student ALREADY has,
 * with their own CLAUDE.md and their own source files in it, survives the
 * platform's first write intact.
 *
 * This is the test that makes bring-your-own-repo safe to offer. Until now the
 * writer was tested against synthetic file lists; here it runs against a fixture
 * that looks like a real folder someone set up on day one — a CLAUDE.md carrying
 * conventions Ali baked in, a package.json, source under src/, a README, a test,
 * and a .gitignore.
 *
 * Three things are asserted, and each maps to a way a student loses work:
 *   1. Their CLAUDE.md content is still there, verbatim, with our block spliced
 *      in — not replaced.
 *   2. No path outside CLAUDE.md / docs/** / .colaberry/** is in the commit.
 *      Not "no path was overwritten" — no path was even SENT.
 *   3. A second write with the same plan commits nothing at all.
 */
import { writeDocsToRepo, MANIFEST_PATH } from '../repoWriter';
import { RenderedFile } from '../renderDocs';
import { BLOCK_BEGIN, BLOCK_END } from '../managedBlock';
import { createHash } from 'crypto';

const TARGET = { owner: 'a-student', repo: 'their-own-project' };

// ── the fixture: a folder a student has been working in for a week ──────────

/** Their CLAUDE.md. Written by them, on day one, with conventions from class. */
const STUDENT_CLAUDE_MD = `# CLAUDE.md — Nightshift Dispatch

## House rules
- Python 3.11, FastAPI, SQLModel. No Django.
- Every endpoint gets a pytest before it gets an implementation.
- I use \`ruff\` and \`black\`. Do not reformat with anything else.

## My naming
- Tables are singular: \`driver\`, \`shift\`, \`route\`.
- Service functions are verbs: \`assign_route\`, \`close_shift\`.

## Things I already tried and rejected
- Celery for the reminder job. Too much for one cron.
- Storing shifts as intervals — the DST boundary broke it twice.
`;

/** Everything else in their repo. None of it is ours and none of it may move. */
const STUDENT_FILES: Record<string, string> = {
  'CLAUDE.md': STUDENT_CLAUDE_MD,
  'README.md': '# Nightshift Dispatch\n\nRun `make dev`.\n',
  '.gitignore': '__pycache__/\n.venv/\n.env\n',
  'pyproject.toml': '[project]\nname = "nightshift"\nversion = "0.1.0"\n',
  'src/main.py': 'from fastapi import FastAPI\n\napp = FastAPI()\n',
  'src/services/dispatch.py': 'def assign_route(driver_id: str) -> None:\n    raise NotImplementedError\n',
  'tests/test_dispatch.py': 'def test_assign_route_rejects_unknown_driver():\n    assert True\n',
};

/** What the platform renders — the shape renderDocs produces. */
const PLATFORM_FILES: RenderedFile[] = [
  { path: 'CLAUDE.md', content: '# CLAUDE.md — Nightshift Dispatch\n\nRead docs/REQUIREMENTS.md before writing code.\n' },
  { path: 'docs/REQUIREMENTS.md', content: '# Requirements\n\nFUNC-001 — dispatch a driver.\n' },
  { path: 'docs/STORIES.md', content: '# Stories\n\n- STORY-001\n' },
  { path: 'docs/stories/STORY-001.md', content: '# STORY-001 — assign a route\n' },
  { path: '.colaberry/plan.json', content: '{"stories":[]}\n' },
  { path: '.colaberry/progress.json', content: '{"schema_version":1,"project":"Nightshift Dispatch","stories":[]}\n' },
  { path: MANIFEST_PATH, content: '{"files":[]}\n' },
];

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const manifestFor = (files: RenderedFile[]) =>
  JSON.stringify({ files: files.map((f) => ({ path: f.path, sha256: sha256(f.content) })) });

interface Captured {
  /** Paths the writer actually asked GitHub to put in the new tree. */
  treePaths: string[];
  treeEntries: Array<{ path: string; content: string }>;
  /** Every path the writer READ, so we can prove it only looked where it writes. */
  readPaths: string[];
  commits: number;
}

/**
 * A GitHub stand-in backed by the fixture. `contents/` answers with the real
 * student file so the splice runs against genuine content rather than a stub.
 */
function githubWithStudentRepo(captured: Captured): typeof fetch {
  return (async (url: string, init: RequestInit = {}) => {
    const u = String(url);
    const method = init.method ?? 'GET';

    if (u.includes('/contents/')) {
      const path = decodeURIComponent(u.split('/contents/')[1]);
      captured.readPaths.push(path);
      const content = STUDENT_FILES[path];
      if (content === undefined) return { ok: false, status: 404, text: async () => 'Not Found', json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ content: Buffer.from(content, 'utf8').toString('base64') }), text: async () => '' };
    }
    if (u.endsWith(`/repos/${TARGET.owner}/${TARGET.repo}`)) {
      return { ok: true, status: 200, json: async () => ({ default_branch: 'main' }), text: async () => '' };
    }
    if (u.includes('/git/ref/heads/')) {
      return { ok: true, status: 200, json: async () => ({ object: { sha: 'base-commit-sha' } }), text: async () => '' };
    }
    if (u.includes('/git/commits/base-commit-sha')) {
      return { ok: true, status: 200, json: async () => ({ tree: { sha: 'base-tree-sha' } }), text: async () => '' };
    }
    if (u.endsWith('/git/trees') && method === 'POST') {
      const body = JSON.parse(String(init.body));
      captured.treeEntries = body.tree;
      captured.treePaths = body.tree.map((t: any) => t.path);
      // base_tree is what leaves every other file in place — without it the
      // commit would be the platform's files and nothing else.
      expect(body.base_tree).toBe('base-tree-sha');
      return { ok: true, status: 201, json: async () => ({ sha: 'new-tree-sha' }), text: async () => '' };
    }
    if (u.endsWith('/git/commits') && method === 'POST') {
      captured.commits += 1;
      return { ok: true, status: 201, json: async () => ({ sha: 'new-commit-sha' }), text: async () => '' };
    }
    if (u.includes('/git/refs/heads/') && method === 'PATCH') {
      // Never forced: a concurrent push by the student must win, not be erased.
      expect(JSON.parse(String(init.body)).force).toBe(false);
      return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
    }
    throw new Error(`unexpected GitHub call in fixture: ${method} ${u}`);
  }) as unknown as typeof fetch;
}

describe('writing into a repo the student already had', () => {
  let captured: Captured;
  let impl: typeof fetch;

  beforeEach(() => {
    process.env.GITHUB_TOKEN = 'platform-token';
    captured = { treePaths: [], treeEntries: [], readPaths: [], commits: 0 };
    impl = githubWithStudentRepo(captured);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('splices the managed block into THEIR CLAUDE.md instead of replacing it', async () => {
    const result = await writeDocsToRepo(TARGET, PLATFORM_FILES, null, { fetchImpl: impl });
    expect(result.committed).toBe(true);

    const written = captured.treeEntries.find((e) => e.path === 'CLAUDE.md');
    expect(written).toBeDefined();

    // Every line the student wrote is still in the file, unchanged.
    for (const line of STUDENT_CLAUDE_MD.split('\n').filter((l) => l.trim())) {
      expect(written!.content).toContain(line);
    }
    // Their content comes FIRST — our block is appended below it, not wrapped
    // around it. A student opening the file still sees their own rules at the top.
    expect(written!.content.indexOf('## House rules')).toBeLessThan(written!.content.indexOf(BLOCK_BEGIN));
    expect(written!.content).toContain(BLOCK_BEGIN);
    expect(written!.content).toContain(BLOCK_END);
    expect(written!.content).toContain('Read docs/REQUIREMENTS.md before writing code.');

    // Specifically: the rejected-approaches section is the kind of thing that is
    // expensive to lose and impossible to notice losing.
    expect(written!.content).toContain('Celery for the reminder job. Too much for one cron.');
  });

  it('a second write with the same plan re-splices rather than stacking a second block', async () => {
    await writeDocsToRepo(TARGET, PLATFORM_FILES, null, { fetchImpl: impl });
    const firstWrite = captured.treeEntries.find((e) => e.path === 'CLAUDE.md')!.content;

    // The student's repo now contains the spliced file. Replay it.
    const withBlock = { ...STUDENT_FILES, 'CLAUDE.md': firstWrite };
    const replay: Captured = { treePaths: [], treeEntries: [], readPaths: [], commits: 0 };
    const replayImpl = ((url: string, init: RequestInit = {}) => {
      const u = String(url);
      if (u.includes('/contents/')) {
        const path = decodeURIComponent(u.split('/contents/')[1]);
        replay.readPaths.push(path);
        const content = withBlock[path as keyof typeof withBlock];
        if (content === undefined) return Promise.resolve({ ok: false, status: 404, text: async () => '', json: async () => ({}) });
        return Promise.resolve({ ok: true, status: 200, json: async () => ({ content: Buffer.from(content, 'utf8').toString('base64') }), text: async () => '' });
      }
      return (githubWithStudentRepo(replay) as any)(url, init);
    }) as unknown as typeof fetch;

    // A CHANGED plan, so the writer is genuinely re-writing CLAUDE.md.
    const changed = PLATFORM_FILES.map((f) =>
      f.path === 'CLAUDE.md' ? { ...f, content: `${f.content}\nNow with a second convention.\n` } : f);
    await writeDocsToRepo(TARGET, changed, manifestFor(PLATFORM_FILES), { fetchImpl: replayImpl });

    const second = replay.treeEntries.find((e) => e.path === 'CLAUDE.md')!.content;
    expect(second.match(new RegExp(BLOCK_BEGIN.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&'), 'g'))).toHaveLength(1);
    expect(second).toContain('## House rules');
    expect(second).toContain('Now with a second convention.');
  });

  it('touches nothing outside CLAUDE.md, docs/** and .colaberry/**', async () => {
    await writeDocsToRepo(TARGET, PLATFORM_FILES, null, { fetchImpl: impl });

    const studentOnly = Object.keys(STUDENT_FILES).filter((p) => p !== 'CLAUDE.md');
    for (const path of studentOnly) {
      expect(captured.treePaths).not.toContain(path);
    }
    // Stronger than "not overwritten": their source was never even read.
    expect(captured.readPaths).not.toContain('src/main.py');
    expect(captured.readPaths).not.toContain('pyproject.toml');
    expect(captured.readPaths.every((p) => p === 'CLAUDE.md' || p.startsWith('.colaberry/') || p.startsWith('docs/'))).toBe(true);

    for (const path of captured.treePaths) {
      expect(path === 'CLAUDE.md' || path.startsWith('docs/') || path.startsWith('.colaberry/')).toBe(true);
    }
  });

  it('makes exactly ONE commit for the whole document set', async () => {
    await writeDocsToRepo(TARGET, PLATFORM_FILES, null, { fetchImpl: impl });
    expect(captured.commits).toBe(1);
    expect(captured.treePaths.length).toBeGreaterThan(1);
  });

  it('re-running an unchanged plan against their repo commits nothing at all', async () => {
    const result = await writeDocsToRepo(TARGET, PLATFORM_FILES, manifestFor(PLATFORM_FILES), { fetchImpl: impl });
    expect(result.committed).toBe(false);
    expect(captured.commits).toBe(0);
    // Not one network call, so a repeated publish cannot churn their history.
    expect(captured.readPaths).toEqual([]);
  });
});
