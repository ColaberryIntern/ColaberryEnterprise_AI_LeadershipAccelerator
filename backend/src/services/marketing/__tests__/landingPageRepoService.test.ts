import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const run = promisify(execFile);

/**
 * The master copy of a landing page, in git.
 *
 * Against a REAL repo in a temp directory, not a mocked `execFile`. The whole value of this
 * service is that git actually ends up with a readable history, and a mock would assert that we
 * called the commands we decided to call - which is the one thing never in doubt.
 */

let repoRoot: string;

async function loadService(overrides: Record<string, unknown> = {}) {
  jest.resetModules();
  jest.doMock('../../../config/env', () => ({
    env: {
      ...jest.requireActual('../../../config/env').env,
      landingPageRepoPath: repoRoot,
      landingPageRepoRemote: '',
      ...overrides,
    },
  }));
  return require('../landingPageRepoService');
}

const CONTENT = { sections: [{ type: 'hero', headline: 'Ship an AI project in six weeks' }] };

function input(over: Record<string, unknown> = {}) {
  return {
    brandSlug: 'colaberry-training',
    pageSlug: 'six-week-build',
    pageName: 'Six-week build',
    content: CONTENT,
    actorEmail: 'ali@colaberry.com',
    ...over,
  } as never;
}

async function gitIn(args: string[]): Promise<string> {
  const { stdout } = await run('git', ['-C', repoRoot, ...args]);
  return String(stdout).trim();
}

beforeEach(async () => {
  repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'lp-repo-'));
});
afterEach(async () => {
  await fs.rm(repoRoot, { recursive: true, force: true });
});

describe('the archive is a real git repo', () => {
  it('creates the repo on first publish and commits the page', async () => {
    const { commitPublishedPage } = await loadService();
    const r = await commitPublishedPage(input());

    expect(r.ok).toBe(true);
    expect(r.repoPath).toBe('colaberry-training/six-week-build.json');
    expect(r.commit).toMatch(/^[0-9a-f]{40}$/);

    // The thing that matters: git has it, and it reads back.
    const tracked = await gitIn(['ls-files']);
    expect(tracked.split('\n')).toContain('colaberry-training/six-week-build.json');
  });

  it('writes the content as readable JSON, so a diff between revisions means something', async () => {
    const { commitPublishedPage } = await loadService();
    await commitPublishedPage(input());

    const onDisk = await fs.readFile(path.join(repoRoot, 'colaberry-training', 'six-week-build.json'), 'utf8');
    expect(JSON.parse(onDisk)).toEqual(CONTENT);
    expect(onDisk).toContain('\n  "sections"');   // pretty-printed, not one line
    expect(onDisk.endsWith('\n')).toBe(true);
  });

  it('names the page and the publisher in the commit message', async () => {
    const { commitPublishedPage } = await loadService();
    await commitPublishedPage(input());

    const msg = await gitIn(['log', '-1', '--pretty=%B']);
    expect(msg).toContain('Publish Six-week build (/lp/colaberry-training/six-week-build)');
    expect(msg).toContain('Published by: ali@colaberry.com');
  });

  it('keeps a history across edits - the point of using git at all', async () => {
    const { commitPublishedPage } = await loadService();
    await commitPublishedPage(input());
    await commitPublishedPage(input({
      content: { sections: [{ type: 'hero', headline: 'Reviewed by a mentor' }] },
    }));

    const commits = (await gitIn(['log', '--pretty=%H', '--', 'colaberry-training/six-week-build.json'])).split('\n');
    expect(commits).toHaveLength(2);
    const previous = await gitIn(['show', `${commits[1]}:colaberry-training/six-week-build.json`]);
    expect(JSON.parse(previous)).toEqual(CONTENT);
  });

  it('separates brands by directory', async () => {
    const { commitPublishedPage } = await loadService();
    await commitPublishedPage(input());
    await commitPublishedPage(input({ brandSlug: 'ai-flotation', pageSlug: 'intake' }));

    const tracked = (await gitIn(['ls-files'])).split('\n');
    expect(tracked).toContain('colaberry-training/six-week-build.json');
    expect(tracked).toContain('ai-flotation/intake.json');
  });

  it('re-publishing an unedited page succeeds without an empty commit', async () => {
    const { commitPublishedPage } = await loadService();
    const first = await commitPublishedPage(input());
    const second = await commitPublishedPage(input());

    expect(second.ok).toBe(true);
    expect(second.commit).toBe(first.commit);
    expect((await gitIn(['log', '--pretty=%H'])).split('\n')).toHaveLength(2); // README + the page
  });
});

describe('slugs are operator input, so they cannot escape the repo', () => {
  it.each([
    ['../../etc', 'six-week-build'],
    ['colaberry-training', '../../../etc/passwd'],
    ['colaberry-training', 'a/b'],
    ['', 'six-week-build'],
    ['UPPER', 'six-week-build'],
  ])('refuses brand=%s page=%s without writing anything', async (brandSlug, pageSlug) => {
    const { commitPublishedPage } = await loadService();
    const r = await commitPublishedPage(input({ brandSlug, pageSlug }));

    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/safe path segment/);
    // Nothing created at all - not even the repo.
    await expect(fs.readdir(repoRoot)).resolves.toEqual([]);
  });
});

describe('it never derails a publish', () => {
  it('returns a failure rather than throwing when the path is unusable', async () => {
    const { commitPublishedPage } = await loadService({ landingPageRepoPath: '' });
    const r = await commitPublishedPage(input());

    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/LANDING_PAGE_REPO_PATH is not set/);
    expect(r.commit).toBeNull();
  });

  it('reports a failure instead of raising, whatever git says', async () => {
    // A file where the repo directory should be: mkdir fails, and the caller must still get a
    // result object rather than an exception mid-publish.
    const blocked = path.join(repoRoot, 'blocked');
    await fs.writeFile(blocked, 'not a directory', 'utf8');
    const { commitPublishedPage } = await loadService({ landingPageRepoPath: blocked });

    const r = await commitPublishedPage(input());
    expect(r.ok).toBe(false);
    expect(r.error).not.toBeNull();
  });
});

describe('pushed is only true when it really was', () => {
  it('is false when no remote is configured - a local repo is history, not a backup', async () => {
    const { commitPublishedPage } = await loadService();
    const r = await commitPublishedPage(input());
    expect(r.pushed).toBe(false);
  });

  it('stays false, and the commit still stands, when the push fails', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { commitPublishedPage } = await loadService({
      landingPageRepoRemote: path.join(repoRoot, 'no-such-remote'),
    });

    const r = await commitPublishedPage(input());

    expect(r.ok).toBe(true);
    expect(r.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(r.pushed).toBe(false);
    expect(err.mock.calls.map((c) => String(c[0])).join('\n')).toContain('landing_page_repo_push_failed');
    err.mockRestore();
  });
});
