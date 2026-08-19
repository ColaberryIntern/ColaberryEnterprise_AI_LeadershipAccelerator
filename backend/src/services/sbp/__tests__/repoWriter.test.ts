/**
 * repoWriter — the three properties that protect a student's repo:
 * unchanged ⇒ no commit, one commit not sixteen, and never a path outside the
 * allowlist. GitHub is mocked; nothing here touches the network.
 */
import {
  writeDocsToRepo, changedFiles, parseManifestHashes,
  RepoWriteError, BOT_NAME, BOT_COMMIT_PREFIX,
} from '../repoWriter';
import { RenderedFile } from '../renderDocs';
import { createHash } from 'crypto';

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
const TARGET = { owner: 'ColaberryIntern', repo: 'sponsor-dashboard-248d9d63', branch: 'main' };

const files: RenderedFile[] = [
  { path: 'docs/REQUIREMENTS.md', content: '# Requirements\nA manager can build a roster.' },
  { path: 'docs/stories/STORY-001.md', content: '# STORY-001\nBuild the roster.' },
  { path: 'CLAUDE.md', content: '# CLAUDE.md\nConventions.' },
];

const manifestFor = (fs: RenderedFile[]) =>
  JSON.stringify({ files: fs.map((f) => ({ path: f.path, sha256: sha(f.content) })) });

/** Scripts the 5-call commit flow: repo, ref, base commit, tree, commit, patch. */
function githubStub() {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = jest.fn(async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    const u = String(url);
    const body = (json: any) => ({ ok: true, status: 200, json: async () => json, text: async () => '' });
    if (u.endsWith('/git/ref/heads/main')) return body({ object: { sha: 'base-commit-sha' } });
    if (u.includes('/git/commits/base-commit-sha')) return body({ tree: { sha: 'base-tree-sha' } });
    if (u.endsWith('/git/trees')) return body({ sha: 'new-tree-sha' });
    if (u.endsWith('/git/commits')) return body({ sha: 'new-commit-sha' });
    if (u.includes('/git/refs/heads/main')) return body({});
    return body({ default_branch: 'main' });
  });
  return { impl: impl as unknown as typeof fetch, calls, mock: impl };
}

beforeEach(() => {
  process.env.GITHUB_TOKEN = 'platform-token';
  delete process.env.GITHUB_API_URL;
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

// ── the idempotency guarantee ───────────────────────────────────────────────
describe('unchanged ⇒ no commit', () => {
  it('makes NO network call at all when every hash matches', async () => {
    const { impl, mock } = githubStub();
    const result = await writeDocsToRepo(TARGET, files, manifestFor(files), { fetchImpl: impl });
    expect(result.committed).toBe(false);
    expect(result.changedPaths).toEqual([]);
    expect(result.skippedUnchanged).toBe(3);
    expect(mock).not.toHaveBeenCalled();
  });

  it('commits only the files that actually differ', async () => {
    const stale = manifestFor([files[0], files[1], { ...files[2], content: 'OLD' }]);
    const { impl, calls } = githubStub();
    const result = await writeDocsToRepo(TARGET, files, stale, { fetchImpl: impl });
    expect(result.committed).toBe(true);
    expect(result.changedPaths).toEqual(['CLAUDE.md']);
    expect(result.skippedUnchanged).toBe(2);
    const treeCall = calls.find((c) => c.url.endsWith('/git/trees'))!;
    expect(JSON.parse(String(treeCall.init.body)).tree).toHaveLength(1);
  });

  it('treats an absent manifest as a first write', async () => {
    const { impl } = githubStub();
    const result = await writeDocsToRepo(TARGET, files, null, { fetchImpl: impl });
    expect(result.changedPaths).toHaveLength(3);
  });

  it('rewrites everything when the manifest is corrupt rather than guessing', async () => {
    const { impl } = githubStub();
    const result = await writeDocsToRepo(TARGET, files, '{ not json', { fetchImpl: impl });
    expect(result.changedPaths).toHaveLength(3);
  });
});

describe('changedFiles (pure)', () => {
  it('detects a content change', () => {
    const existing = { 'CLAUDE.md': sha('different') };
    expect(changedFiles([files[2]], existing)).toHaveLength(1);
  });
  it('detects nothing when hashes match', () => {
    expect(changedFiles(files, parseManifestHashes(manifestFor(files)))).toHaveLength(0);
  });
  it('treats an unknown path as changed', () => {
    expect(changedFiles(files, {})).toHaveLength(3);
  });
});

// ── one commit ──────────────────────────────────────────────────────────────
describe('one commit, not one per file', () => {
  it('creates exactly one commit for a multi-file change', async () => {
    const { impl, calls } = githubStub();
    await writeDocsToRepo(TARGET, files, null, { fetchImpl: impl });
    const commitCalls = calls.filter((c) => c.url.endsWith('/git/commits') && c.init.method === 'POST');
    expect(commitCalls).toHaveLength(1);
    expect(JSON.parse(String(commitCalls[0].init.body)).tree).toBe('new-tree-sha');
  });

  it('layers over the existing tree so student files are untouched', async () => {
    const { impl, calls } = githubStub();
    await writeDocsToRepo(TARGET, files, null, { fetchImpl: impl });
    const tree = JSON.parse(String(calls.find((c) => c.url.endsWith('/git/trees'))!.init.body));
    expect(tree.base_tree).toBe('base-tree-sha');
  });

  it('authors as the bot, with the prefix the webhook matches to avoid a sync loop', async () => {
    const { impl, calls } = githubStub();
    await writeDocsToRepo(TARGET, files, null, { fetchImpl: impl, correlationId: 'corr-9' });
    const commit = JSON.parse(String(calls.find((c) => c.url.endsWith('/git/commits'))!.init.body));
    expect(commit.author.name).toBe(BOT_NAME);
    expect(commit.message).toContain(BOT_COMMIT_PREFIX);
    expect(commit.message).toContain('corr-9');
  });

  it('never force-pushes — a concurrent human push must win, not be erased', async () => {
    const { impl, calls } = githubStub();
    await writeDocsToRepo(TARGET, files, null, { fetchImpl: impl });
    const patch = calls.find((c) => c.init.method === 'PATCH')!;
    expect(JSON.parse(String(patch.init.body)).force).toBe(false);
  });
});

// ── the allowlist ───────────────────────────────────────────────────────────
describe('path allowlist (FR-027)', () => {
  it.each([
    'src/index.ts',
    'package.json',
    '.github/workflows/deploy.yml',
    '../outside.md',
  ])('THROWS on %p rather than skipping it', async (badPath) => {
    const { impl, mock } = githubStub();
    await expect(
      writeDocsToRepo(TARGET, [...files, { path: badPath, content: 'x' }], null, { fetchImpl: impl }),
    ).rejects.toMatchObject({ error_class: 'AllowlistViolation' });
    // Checked before anything leaves the process.
    expect(mock).not.toHaveBeenCalled();
  });

  it('checks the allowlist before even reading the token', async () => {
    delete process.env.GITHUB_TOKEN;
    const { impl } = githubStub();
    await expect(
      writeDocsToRepo(TARGET, [{ path: 'src/evil.ts', content: 'x' }], null, { fetchImpl: impl }),
    ).rejects.toMatchObject({ error_class: 'AllowlistViolation' });
  });
});

// ── failure behaviour and secrets ───────────────────────────────────────────
describe('failure behaviour', () => {
  it('fails with ConfigError when the platform token is missing', async () => {
    delete process.env.GITHUB_TOKEN;
    const { impl } = githubStub();
    await expect(writeDocsToRepo(TARGET, files, null, { fetchImpl: impl }))
      .rejects.toMatchObject({ error_class: 'ConfigError' });
  });

  // These count attempts on the REPO call, not raw fetch calls: the writer also
  // reads the student's existing CLAUDE.md before committing it, and that read
  // is deliberately soft (a 404 just means they have none). Counting every
  // fetch would make an unrelated extra request look like a retry.
  const repoCalls = (impl: jest.Mock) =>
    impl.mock.calls.filter((c) => !String(c[0]).includes('/contents/')).length;

  it('does not retry a terminal 4xx', async () => {
    const impl = jest.fn(async () => ({ ok: false, status: 404, text: async () => 'Not Found', json: async () => ({}) }));
    await expect(writeDocsToRepo(TARGET, files, null, { fetchImpl: impl as any }))
      .rejects.toBeInstanceOf(RepoWriteError);
    expect(repoCalls(impl)).toBe(1);
  });

  it('retries a 5xx up to the cap, then fails cleanly', async () => {
    const impl = jest.fn(async () => ({ ok: false, status: 503, text: async () => 'unavailable', json: async () => ({}) }));
    await expect(writeDocsToRepo(TARGET, files, null, { fetchImpl: impl as any }))
      .rejects.toMatchObject({ error_class: 'UpstreamError' });
    // 3 attempts on the repo call. The CLAUDE.md read retries its own 5xx too,
    // then gives up softly, which is why this filters rather than counting all.
    expect(repoCalls(impl)).toBe(3);
  });

  it('classifies a timeout distinctly', async () => {
    const impl = jest.fn(async () => { throw Object.assign(new Error('aborted'), { name: 'AbortError' }); });
    await expect(writeDocsToRepo(TARGET, files, null, { fetchImpl: impl as any }))
      .rejects.toMatchObject({ error_class: 'UpstreamTimeout' });
  });

  /**
   * A PERMISSION REFUSAL IS ITS OWN CLASS, and it has to be.
   *
   * Every other failure here is transient or ours. This one is neither: the
   * platform holds read access and no amount of retrying will change that. It
   * came back as a generic `UpstreamError`, so the caller could not tell
   * "GitHub had a bad minute" from "we will never be able to write to this repo
   * again" — and so the connection went on claiming writability while every
   * sync queued the same doomed commit, silently, forever.
   */
  it('classifies a permission refusal as NoPushAccess, not as a generic upstream fault', async () => {
    const impl = jest.fn(async () => ({
      ok: false,
      status: 403,
      text: async () => 'Resource not accessible by personal access token',
      json: async () => ({}),
      headers: new Headers(),
    }));
    await expect(writeDocsToRepo(TARGET, files, null, { fetchImpl: impl as any }))
      .rejects.toMatchObject({ error_class: 'NoPushAccess' });
  });

  it('does not retry a permission refusal — it is terminal, and retrying burns quota', async () => {
    const impl = jest.fn(async () => ({
      ok: false, status: 403, text: async () => 'Must have admin rights to Repository.',
      json: async () => ({}), headers: new Headers(),
    }));
    await expect(writeDocsToRepo(TARGET, files, null, { fetchImpl: impl as any }))
      .rejects.toBeInstanceOf(RepoWriteError);
    expect(repoCalls(impl)).toBe(1);
  });

  /**
   * GitHub overloads 403 for throttling as well as for refusal, and the caller
   * DEMOTES A CONNECTION on NoPushAccess. Mistaking a rate limit for a refusal
   * would mark a perfectly good repo read-only and stop the platform writing to
   * it until somebody noticed.
   */
  it('does not mistake a rate limit for a permission refusal', async () => {
    const impl = jest.fn(async () => ({
      ok: false, status: 403,
      text: async () => 'API rate limit exceeded for installation.',
      json: async () => ({}), headers: new Headers(),
    }));
    await expect(writeDocsToRepo(TARGET, files, null, { fetchImpl: impl as any }))
      .rejects.toMatchObject({ error_class: 'UpstreamError' });
  });

  /**
   * 404 is what a freshly provisioned repo returns before the student's first
   * push, because the branch does not exist yet. Reading that as "no push
   * access" would demote every repo in the adopt flow.
   */
  it('leaves a 404 as an upstream fault, since a missing branch looks the same', async () => {
    const impl = jest.fn(async () => ({
      ok: false, status: 404, text: async () => 'Not Found', json: async () => ({}), headers: new Headers(),
    }));
    await expect(writeDocsToRepo(TARGET, files, null, { fetchImpl: impl as any }))
      .rejects.toMatchObject({ error_class: 'UpstreamError' });
  });

  it('NEVER writes the platform token to a log line', async () => {
    const spy = jest.spyOn(console, 'log');
    process.env.GITHUB_TOKEN = 'ghp_SUPERSECRET_TOKEN_VALUE';
    const { impl } = githubStub();
    await writeDocsToRepo(TARGET, files, null, { fetchImpl: impl, correlationId: 'c1' });
    for (const call of spy.mock.calls) {
      expect(String(call[0])).not.toContain('ghp_SUPERSECRET_TOKEN_VALUE');
    }
  });

  it('sends the token as a Bearer header, not in the URL', async () => {
    const { impl, calls } = githubStub();
    await writeDocsToRepo(TARGET, files, null, { fetchImpl: impl });
    for (const c of calls) {
      expect(c.url).not.toContain('platform-token');
      expect((c.init.headers as any).Authorization).toBe('Bearer platform-token');
    }
  });
});

// ── the manifest must not make every sync look dirty ────────────────────────
// Regression from the T16 live check: every mocked test passed while the real
// run committed on the second write. The manifest cannot hold its own hash, and
// its generated_at is fresh each render, so it always looked modified.
describe('the manifest never triggers a commit on its own', () => {
  const withManifest = (fs: RenderedFile[], generatedAt: string): RenderedFile[] => [
    ...fs,
    {
      path: '.colaberry/manifest.json',
      content: JSON.stringify({
        generated_at: generatedAt,
        files: fs.map((f) => ({ path: f.path, sha256: sha(f.content) })),
      }),
    },
  ];

  it('makes NO commit when only the manifest timestamp moved', async () => {
    const before = withManifest(files, '2026-08-10T00:00:00Z');
    const after = withManifest(files, '2026-08-10T09:99:99Z');   // re-rendered later
    const manifestContent = before.find((f) => f.path === '.colaberry/manifest.json')!.content;

    const { impl, mock } = githubStub();
    const result = await writeDocsToRepo(TARGET, after, manifestContent, { fetchImpl: impl });

    expect(result.committed).toBe(false);
    expect(mock).not.toHaveBeenCalled();
  });

  it('does carry the manifest along when something real changed', async () => {
    const before = withManifest(files, '2026-08-10T00:00:00Z');
    const edited = [...files.slice(0, 2), { ...files[2], content: '# CLAUDE.md\nCHANGED.' }];
    const after = withManifest(edited, '2026-08-10T09:00:00Z');
    const manifestContent = before.find((f) => f.path === '.colaberry/manifest.json')!.content;

    const { impl } = githubStub();
    const result = await writeDocsToRepo(TARGET, after, manifestContent, { fetchImpl: impl });

    expect(result.committed).toBe(true);
    expect(result.changedPaths).toContain('CLAUDE.md');
    // The manifest rides along so it stays truthful about what is committed.
    expect(result.changedPaths).toContain('.colaberry/manifest.json');
  });

  it('changedFiles returns nothing when only the manifest differs', () => {
    const existing = Object.fromEntries(files.map((f) => [f.path, sha(f.content)]));
    const set = withManifest(files, 'any-time');
    expect(changedFiles(set, existing)).toEqual([]);
  });
});

// ── the student's own CLAUDE.md ─────────────────────────────────────────────
describe('CLAUDE.md belongs to the student', () => {
  /**
   * Students arrive with a CLAUDE.md that already carries their own conventions
   * — "we have lots of functionality baked into ours". This writer replaced the
   * whole file, so every republish silently deleted it. Their file is theirs;
   * we own a delimited block inside it and nothing else.
   */
  const THEIRS = '# CLAUDE.md\n\n## Our conventions\n- Run the linter first.\n- Never touch vendor/.\n';

  /** The commit flow, plus a readable CLAUDE.md on the contents endpoint. */
  function stubWithExistingClaudeMd(existing: string | null) {
    const { impl, calls, mock } = githubStub();
    const wrapped = jest.fn(async (url: any, init: any) => {
      if (String(url).includes('/contents/CLAUDE.md')) {
        return existing === null
          ? { ok: false, status: 404, json: async () => ({}), text: async () => 'Not Found' }
          : {
            ok: true,
            status: 200,
            json: async () => ({ content: Buffer.from(existing, 'utf8').toString('base64') }),
            text: async () => '',
          };
      }
      return (impl as any)(url, init);
    });
    return { impl: wrapped as unknown as typeof fetch, calls, mock };
  }

  /** The CLAUDE.md blob actually sent to GitHub. */
  const committedClaudeMd = (calls: Array<{ url: string; init: RequestInit }>): string => {
    const tree = calls.find((c) => c.url.endsWith('/git/trees'))!;
    const body = JSON.parse(String(tree.init.body));
    return body.tree.find((t: any) => t.path === 'CLAUDE.md').content;
  };

  it('keeps everything the student wrote and adds our block below it', async () => {
    const { impl, calls } = stubWithExistingClaudeMd(THEIRS);

    await writeDocsToRepo(TARGET, files, null, { fetchImpl: impl });

    const written = committedClaudeMd(calls);
    expect(written).toContain('Run the linter first.');
    expect(written).toContain('Never touch vendor/.');
    expect(written).toContain('COLABERRY:BEGIN');
    expect(written).toContain('Conventions.');            // our rendered content
    expect(written.indexOf('Our conventions')).toBeLessThan(written.indexOf('COLABERRY:BEGIN'));
  });

  it('writes our block alone when they have no CLAUDE.md', async () => {
    const { impl, calls } = stubWithExistingClaudeMd(null);

    await writeDocsToRepo(TARGET, files, null, { fetchImpl: impl });

    expect(committedClaudeMd(calls)).toContain('COLABERRY:BEGIN');
  });

  it('appends rather than clobbers when their file cannot be read', async () => {
    // A read failure must never be treated as "they had nothing".
    const { impl, calls } = githubStub();
    const failing = jest.fn(async (url: any, init: any) => {
      if (String(url).includes('/contents/CLAUDE.md')) throw new Error('network down');
      return (impl as any)(url, init);
    });

    await writeDocsToRepo(TARGET, files, null, { fetchImpl: failing as unknown as typeof fetch });

    expect(committedClaudeMd(calls)).toContain('COLABERRY:BEGIN');
  });

  it('does not read their file when nothing changed — the no-op stays silent', async () => {
    const { impl, mock } = stubWithExistingClaudeMd(THEIRS);

    await writeDocsToRepo(TARGET, files, manifestFor(files), { fetchImpl: impl });

    expect(mock).not.toHaveBeenCalled();
  });
});
