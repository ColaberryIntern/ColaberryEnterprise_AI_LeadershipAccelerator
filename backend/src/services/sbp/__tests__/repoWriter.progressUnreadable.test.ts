/**
 * `.colaberry/progress.json` is co-owned, and the platform's half of the merge
 * must never cost the student theirs.
 *
 * The case this pins, from production on 2026-09-15: a learner's file had two
 * `notes` fields over the old per-field cap. `parseProgressFile` rejected the
 * whole file, `mergeProgressFile` fell back to the clean render, and the sync
 * committed a template with every `passed` set to false over ten stories he
 * had built. He restored it by hand; the next sync did it again.
 *
 * Two things are pinned here. Long notes are now readable at all (the contract
 * tests cover the parser; this covers the write). And a file that is still
 * unreadable, for a reason the parser genuinely cannot get past, is DROPPED
 * from the commit rather than replaced, while every other file still ships.
 */
import { writeDocsToRepo, MANIFEST_PATH } from '../repoWriter';
import { RenderedFile } from '../renderDocs';
import { PROGRESS_FILE_PATH, renderProgressFile, serialiseProgressFile } from '../verification/progressContract';

const TARGET = { owner: 'a-student', repo: 'their-own-project' };
const CRIT_A = 'Given uncertain data, when detected, then the system flags it for human review.';
const CRIT_B = 'Given certain data, when processed, then the system does not flag it.';

const rendered = renderProgressFile([{ id: 'STORY-009', release: 'r3', acceptance: [CRIT_A, CRIT_B] }], 'Ops Centre');

const PLATFORM_FILES: RenderedFile[] = [
  { path: 'docs/STORIES.md', content: '# Stories\n\n- STORY-009\n' },
  { path: PROGRESS_FILE_PATH, content: serialiseProgressFile(rendered) },
  { path: MANIFEST_PATH, content: '{"files":[]}\n' },
];

interface Captured { treeEntries: Array<{ path: string; content: string }>; commits: number; logs: string[] }

/** A GitHub stand-in whose repo holds exactly one file: the student's progress.json (or none). */
function github(captured: Captured, studentProgress: string | null | 'unreadable'): typeof fetch {
  return (async (url: string, init: RequestInit = {}) => {
    const u = String(url);
    const method = init.method ?? 'GET';
    if (u.includes('/contents/')) {
      const path = decodeURIComponent(u.split('/contents/')[1]);
      if (path !== PROGRESS_FILE_PATH || studentProgress === null) {
        return { ok: false, status: 404, text: async () => 'Not Found', json: async () => ({}) };
      }
      if (studentProgress === 'unreadable') {
        return { ok: false, status: 500, text: async () => 'upstream', json: async () => ({}) };
      }
      return { ok: true, status: 200, json: async () => ({ content: Buffer.from(studentProgress, 'utf8').toString('base64') }), text: async () => '' };
    }
    if (u.endsWith(`/repos/${TARGET.owner}/${TARGET.repo}`)) return { ok: true, status: 200, json: async () => ({ default_branch: 'main' }), text: async () => '' };
    if (u.includes('/git/ref/heads/')) return { ok: true, status: 200, json: async () => ({ object: { sha: 'base' } }), text: async () => '' };
    if (u.includes('/git/commits/base')) return { ok: true, status: 200, json: async () => ({ tree: { sha: 'base-tree' } }), text: async () => '' };
    if (u.endsWith('/git/trees') && method === 'POST') {
      captured.treeEntries = JSON.parse(String(init.body)).tree;
      return { ok: true, status: 201, json: async () => ({ sha: 'tree' }), text: async () => '' };
    }
    if (u.endsWith('/git/commits') && method === 'POST') { captured.commits += 1; return { ok: true, status: 201, json: async () => ({ sha: 'commit' }), text: async () => '' }; }
    if (u.includes('/git/refs/heads/') && method === 'PATCH') return { ok: true, status: 200, json: async () => ({}), text: async () => '' };
    throw new Error(`unexpected GitHub call in fixture: ${method} ${u}`);
  }) as unknown as typeof fetch;
}

/** The learner's file: both criteria ticked, notes far over the old 4,000 cap. */
const STUDENT_FILE = serialiseProgressFile({
  ...rendered,
  stories: [{
    ...rendered.stories[0],
    criteria: [{ text: CRIT_A, passed: true, evidence: 'flagging.py + tests' }, { text: CRIT_B, passed: true }],
    files_touched: ['src/flagging.py'],
    notes: 'Uncertainty threshold decision. '.repeat(300),
    updated_at: '2026-09-12T22:30:00Z',
  }],
});

describe('progress.json write when the student already has one', () => {
  let captured: Captured;
  beforeEach(() => {
    process.env.GITHUB_TOKEN = 'platform-token';
    captured = { treeEntries: [], commits: 0, logs: [] };
    jest.spyOn(console, 'log').mockImplementation((line?: unknown) => { captured.logs.push(String(line)); });
  });
  afterEach(() => jest.restoreAllMocks());

  it('keeps every tick and the long notes when merging over the learner\'s file', async () => {
    expect(STUDENT_FILE.length).toBeGreaterThan(4000);
    const result = await writeDocsToRepo(TARGET, PLATFORM_FILES, null, { fetchImpl: github(captured, STUDENT_FILE) });
    expect(result.committed).toBe(true);
    const written = captured.treeEntries.find((e) => e.path === PROGRESS_FILE_PATH);
    expect(written).toBeDefined();
    const file = JSON.parse(written!.content);
    expect(file.stories[0].criteria.map((c: any) => c.passed)).toEqual([true, true]);
    expect(file.stories[0].notes).toBe('Uncertainty threshold decision. '.repeat(300));
    expect(file.stories[0].files_touched).toEqual(['src/flagging.py']);
  });

  it('writes the clean render when the repo has no progress.json yet', async () => {
    const result = await writeDocsToRepo(TARGET, PLATFORM_FILES, null, { fetchImpl: github(captured, null) });
    expect(result.committed).toBe(true);
    const written = captured.treeEntries.find((e) => e.path === PROGRESS_FILE_PATH);
    expect(written).toBeDefined();
    expect(JSON.parse(written!.content).stories[0].criteria.every((c: any) => c.passed === false)).toBe(true);
  });

  it('DROPS progress.json from the commit, and ships the rest, when the learner\'s copy cannot be parsed', async () => {
    const mangled = STUDENT_FILE.replace('"passed": true', '"passed": "yes"');
    const result = await writeDocsToRepo(TARGET, PLATFORM_FILES, null, { fetchImpl: github(captured, mangled) });
    expect(result.committed).toBe(true);
    const paths = captured.treeEntries.map((e) => e.path);
    expect(paths).toContain('docs/STORIES.md');
    expect(paths).not.toContain(PROGRESS_FILE_PATH);
    const skip = captured.logs.map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .find((l) => l?.event === 'sbp_repo_progress_write_skipped');
    expect(skip).toBeDefined();
    expect(skip.outcome).toBe('partial');
    expect(skip.context.reason).toBe('ProgressFileSchemaMismatch');
    expect(String(skip.context.issues[0])).toMatch(/^STORY-009 criteria\.0\.passed: /);
  });

  it('DROPS progress.json when GitHub would not show us the learner\'s copy at all', async () => {
    const result = await writeDocsToRepo(TARGET, PLATFORM_FILES, null, { fetchImpl: github(captured, 'unreadable') });
    expect(result.committed).toBe(true);
    expect(captured.treeEntries.map((e) => e.path)).not.toContain(PROGRESS_FILE_PATH);
    const skip = captured.logs.map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .find((l) => l?.event === 'sbp_repo_progress_write_skipped');
    expect(skip?.context.reason).toBe('RepoFileUnreadable');
  });

  it('a drop that empties the change set commits nothing, not a lone manifest', async () => {
    const onlyProgress: RenderedFile[] = PLATFORM_FILES.filter((f) => f.path !== 'docs/STORIES.md');
    const mangled = STUDENT_FILE.replace('"passed": true', '"passed": "yes"');
    const result = await writeDocsToRepo(TARGET, onlyProgress, null, { fetchImpl: github(captured, mangled) });
    expect(result.committed).toBe(false);
    expect(captured.commits).toBe(0);
  });
});
