/**
 * Which branch verification reads, and how far back.
 *
 * Two failures lived here, both of which look to a student like the platform
 * losing their work:
 *
 *  1. THE READ NAMED NO BRANCH AT ALL. It worked by accident — GitHub falls back
 *     to the repo's default branch — but nothing could say which branch that
 *     was, so a student on a feature branch was invisible with no diagnostic. The
 *     obvious fix, assuming `main`, would have broken a live student:
 *     `Pamy77/colaberry-architect-workspace` has a default branch of `master`.
 *
 *  2. ONE PAGE WAS THE WHOLE OF HISTORY. Past 100 commits the earliest work
 *     stopped being readable, so a story proven in week two could stop being
 *     provable in week six and the verdict moved backwards.
 *
 * These tests drive the reader through an injected fetch, so they assert on the
 * URLs it actually requests — which is the only place "which branch" is visible.
 */
import { readVerificationInputs, COMMIT_WINDOW } from '../repoProgressReader';

const OWNER = 'student';
const REPO = 'workspace';

interface Route { test: (url: string) => boolean; reply: (url: string) => unknown; status?: number }

/** A commit list entry as GitHub returns it. */
const commit = (sha: string, message: string) => ({ sha, commit: { message, author: { date: '2026-08-01T00:00:00Z', name: 'S' } } });

function makeFetch(routes: Route[]): { impl: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  const impl = (async (url: string) => {
    urls.push(String(url));
    const route = routes.find((r) => r.test(String(url)));
    const status = route?.status ?? 200;
    const body = route ? route.reply(String(url)) : [];
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => null },
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  }) as unknown as typeof fetch;
  return { impl, urls };
}

beforeEach(() => { process.env.GITHUB_TOKEN = 'test-token'; });

// ── 1. The branch is resolved, never assumed ────────────────────────────────

describe('the branch verification reads', () => {
  it('pins every read to the branch it was given, without assuming main', async () => {
    const { impl, urls } = makeFetch([
      { test: (u) => u.includes('/contents/'), status: 404, reply: () => null },
      { test: (u) => u.includes('/commits'), reply: () => [] },
    ]);

    // `master`, because Pamy77's repo really is on `master` — a hardcoded `main`
    // would have broken a live student's build.
    const out = await readVerificationInputs(
      { owner: OWNER, repo: REPO, branch: 'master' },
      { fetchImpl: impl, storyIds: [] },
    );

    expect(out.branch_read).toBe('master');
    // Both reads pinned: the progress file AND the commit list.
    expect(urls.some((u) => u.includes('ref=master'))).toBe(true);
    expect(urls.some((u) => u.includes('sha=master'))).toBe(true);
    expect(urls.some((u) => u.includes('main'))).toBe(false);
  });

  it('reports null rather than inventing a branch when none was recorded', async () => {
    const { impl, urls } = makeFetch([
      { test: (u) => u.includes('/contents/'), status: 404, reply: () => null },
      { test: (u) => u.includes('/commits'), reply: () => [] },
    ]);

    const out = await readVerificationInputs({ owner: OWNER, repo: REPO }, { fetchImpl: impl, storyIds: [] });

    // Legacy rows keep the old behaviour — no ref, GitHub uses the repo default.
    expect(out.branch_read).toBeNull();
    expect(urls.some((u) => u.includes('sha='))).toBe(false);
    expect(urls.some((u) => u.includes('ref='))).toBe(false);
  });
});

// ── 2. History past 100 commits ─────────────────────────────────────────────

describe('the commit window', () => {
  it('walks past the first 100 commits instead of losing the earlier ones', async () => {
    // 100 on page 1, 40 on page 2 — a student with 140 commits.
    const page1 = Array.from({ length: COMMIT_WINDOW }, (_, i) => commit(`new${i}`, 'chore: later work'));
    const page2 = Array.from({ length: 40 }, (_, i) => commit(`old${i}`, 'STORY-001 the early work'));

    const { impl } = makeFetch([
      { test: (u) => u.includes('/contents/'), status: 404, reply: () => null },
      { test: (u) => u.includes('/commits/'), reply: () => ({ sha: 'x', commit: { message: 'STORY-001 the early work', author: { date: '2026-07-01T00:00:00Z' } }, files: [{}] }) },
      // `&page=` is load-bearing: `per_page=100` contains the substring `page=1`,
      // so a looser match makes every page look like page one.
      { test: (u) => u.includes('&page=1'), reply: () => page1 },
      { test: (u) => u.includes('&page=2'), reply: () => page2 },
      { test: (u) => u.includes('/commits'), reply: () => [] },
    ]);

    const out = await readVerificationInputs(
      { owner: OWNER, repo: REPO },
      { fetchImpl: impl, storyIds: ['STORY-001'] },
    );

    expect(out.commits_scanned).toBe(140);
    // A short second page is the end of history, so nothing was cut off.
    expect(out.window_truncated).toBe(false);
    // The early story commits are still evidence.
    expect(out.commits.length).toBeGreaterThan(0);
  });

  it('stops after one page when history is short', async () => {
    const { impl, urls } = makeFetch([
      { test: (u) => u.includes('/contents/'), status: 404, reply: () => null },
      { test: (u) => u.includes('/commits'), reply: () => [commit('a', 'first')] },
    ]);

    await readVerificationInputs({ owner: OWNER, repo: REPO }, { fetchImpl: impl, storyIds: [] });

    // `&page=` not `page=` — the latter is a substring of `per_page=` and would
    // pass against a reader that paginates not at all.
    const paged = urls.filter((u) => u.includes('&page='));
    expect(paged.length).toBe(1);
    expect(paged[0]).toContain('&page=1');
  });
});

// ── 3. Work that exists, on another branch ──────────────────────────────────

describe('a student whose work is on a feature branch', () => {
  it('names the branch their story commits are on', async () => {
    const { impl } = makeFetch([
      { test: (u) => u.includes('/contents/'), status: 404, reply: () => null },
      { test: (u) => u.includes('/branches'), reply: () => [{ name: 'main' }, { name: 'feature/roster' }] },
      { test: (u) => u.includes('sha=feature%2Froster'), reply: () => [commit('f1', 'STORY-001 build the roster endpoint')] },
      { test: (u) => u.includes('/commits'), reply: () => [] },
    ]);

    const out = await readVerificationInputs(
      { owner: OWNER, repo: REPO, branch: 'main' },
      { fetchImpl: impl, storyIds: ['STORY-001'] },
    );

    expect(out.unmerged_branches).toEqual(['feature/roster']);
    // The verdict itself is still default-branch only — nothing was credited.
    expect(out.commits).toEqual([]);
  });

  it('does not go looking when the default branch already has the work', async () => {
    const { impl, urls } = makeFetch([
      { test: (u) => u.includes('/contents/'), status: 404, reply: () => null },
      { test: (u) => u.includes('/commits/'), reply: () => ({ sha: 'a', commit: { message: 'STORY-001 done', author: { date: '2026-08-01T00:00:00Z' } }, files: [{}] }) },
      { test: (u) => u.includes('/commits'), reply: () => [commit('a', 'STORY-001 done')] },
    ]);

    const out = await readVerificationInputs(
      { owner: OWNER, repo: REPO },
      { fetchImpl: impl, storyIds: ['STORY-001'] },
    );

    expect(out.unmerged_branches).toEqual([]);
    // The branch probe costs nothing on the happy path.
    expect(urls.some((u) => u.includes('/branches'))).toBe(false);
  });
});
