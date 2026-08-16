/**
 * Where the Command Center is hosted, and when we are allowed to say so.
 *
 * The properties worth the most here are the repo shapes that break the obvious
 * formula, and the one rule this module lives under: NOTHING here may gate a
 * story. Every "we could not find it" answer has to be a quiet no-op that a
 * later push retries for free, never an error and never a blocker.
 */
const mockProjectFindByPk = jest.fn();

jest.mock('../../../../models/Project', () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => mockProjectFindByPk(...a) },
}));

import {
  derivePagesUrl, fetchPagesUrl, pagesResponds, recordPagesUrlIfLive,
} from '../pagesUrlService';

const PROJECT = '40a5cea6-ace8-4734-8220-7e62df2111e5';
const OLD_TOKEN = process.env.GITHUB_TOKEN;

/** A project row that records what was saved onto it. */
function projectRow(vars: Record<string, unknown> = {}) {
  return {
    project_variables: { ...vars },
    changed: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
  };
}

/** A fetch stand-in: `pages` is the API answer, `live` the set of URLs that respond 2xx. */
function githubFetch(opts: { pages?: unknown; pagesStatus?: number; live?: string[] } = {}) {
  const { pages, pagesStatus = 200, live = [] } = opts;
  return jest.fn(async (url: string, init?: any) => {
    const u = String(url);
    if (u.includes('api.github.com')) {
      return {
        ok: pagesStatus >= 200 && pagesStatus < 300 && pages !== undefined,
        status: pages === undefined ? 404 : pagesStatus,
        json: async () => pages,
      } as any;
    }
    const hit = live.some((l) => u === l);
    return { ok: hit, status: hit ? 200 : 404, json: async () => ({}) } as any;
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.GITHUB_TOKEN = 'test-token';
});
afterAll(() => { process.env.GITHUB_TOKEN = OLD_TOKEN; });

describe('derivePagesUrl — the repo shapes that break the formula', () => {
  it('uses the /repo/ path for an ordinary project repo', () => {
    expect(derivePagesUrl('ColaberryIntern', 'AcceleratorTesting'))
      .toBe('https://colaberryintern.github.io/AcceleratorTesting/');
  });

  it('serves a <owner>.github.io repo at the DOMAIN ROOT, not under its own name', () => {
    // The path form would be https://alice.github.io/alice.github.io/ — a 404
    // that never resolves, no matter how long you wait.
    expect(derivePagesUrl('alice', 'alice.github.io')).toBe('https://alice.github.io/');
  });

  it('matches the user-site repo case-insensitively', () => {
    // GitHub logins and repo names vary in case freely; hostnames do not.
    expect(derivePagesUrl('Alice', 'Alice.GitHub.IO')).toBe('https://alice.github.io/');
  });
});

describe('fetchPagesUrl — ask GitHub rather than guess', () => {
  it('returns the URL GitHub reports', async () => {
    const f = githubFetch({ pages: { html_url: 'https://colaberryintern.github.io/AcceleratorTesting/' } });
    expect(await fetchPagesUrl('ColaberryIntern', 'AcceleratorTesting', f))
      .toBe('https://colaberryintern.github.io/AcceleratorTesting/');
  });

  it('reports a CUSTOM DOMAIN, which no formula could have produced', async () => {
    const f = githubFetch({ pages: { html_url: 'https://command.example.com/', cname: 'command.example.com' } });
    expect(await fetchPagesUrl('alice', 'cc', f)).toBe('https://command.example.com/');
  });

  it('treats "Pages is not enabled" (404) as null, not as an error', async () => {
    expect(await fetchPagesUrl('alice', 'cc', githubFetch())).toBeNull();
  });

  it('returns null rather than throwing when the API call fails outright', async () => {
    const f = jest.fn(async () => { throw new Error('network down'); }) as unknown as typeof fetch;
    expect(await fetchPagesUrl('alice', 'cc', f)).toBeNull();
  });

  it('returns null when no platform token is configured', async () => {
    delete process.env.GITHUB_TOKEN;
    const f = githubFetch({ pages: { html_url: 'https://x.github.io/y/' } });
    expect(await fetchPagesUrl('alice', 'cc', f)).toBeNull();
  });
});

describe('pagesResponds', () => {
  it('is true only for a 2xx', async () => {
    expect(await pagesResponds('https://a.github.io/b/', githubFetch({ live: ['https://a.github.io/b/'] }))).toBe(true);
  });

  it('is FALSE for the styled 404 GitHub serves while a first build finishes', async () => {
    // That 404 is a perfectly good HTTP response. Recording it would put a link
    // in the portal that shows the student a 404 page.
    expect(await pagesResponds('https://a.github.io/b/', githubFetch({ live: [] }))).toBe(false);
  });

  it('is false rather than throwing on a timeout or network error', async () => {
    const f = jest.fn(async () => { throw new Error('aborted'); }) as unknown as typeof fetch;
    expect(await pagesResponds('https://a.github.io/b/', f)).toBe(false);
  });
});

describe('recordPagesUrlIfLive', () => {
  it('records the URL GitHub reported, once it answers', async () => {
    const row = projectRow();
    mockProjectFindByPk.mockResolvedValue(row);
    const url = 'https://colaberryintern.github.io/AcceleratorTesting/';

    const res = await recordPagesUrlIfLive(PROJECT, 'ColaberryIntern', 'AcceleratorTesting', {
      fetchImpl: githubFetch({ pages: { html_url: url }, live: [url] }),
    });

    expect(res).toMatchObject({ outcome: 'recorded', url, from_api: true });
    expect(row.project_variables).toEqual({ command_center_url: url });
    expect(row.save).toHaveBeenCalled();
  });

  it('PREFERS what GitHub reports over what we derived', async () => {
    // The custom domain is live; the derived URL is not. Deriving alone would
    // have concluded "not live yet" forever on a site that works.
    const row = projectRow();
    mockProjectFindByPk.mockResolvedValue(row);
    const custom = 'https://command.example.com/';

    const res = await recordPagesUrlIfLive(PROJECT, 'alice', 'cc', {
      fetchImpl: githubFetch({ pages: { html_url: custom }, live: [custom] }),
    });

    expect(res.url).toBe(custom);
    expect(row.project_variables.command_center_url).toBe(custom);
  });

  it('NEVER overwrites a URL that is already set', async () => {
    // Somebody may have set this by hand, or pointed it somewhere that is not
    // Pages at all. An automatic guess must not win an argument with a human.
    const row = projectRow({ command_center_url: 'https://set-by-hand.example.com/' });
    mockProjectFindByPk.mockResolvedValue(row);

    const res = await recordPagesUrlIfLive(PROJECT, 'alice', 'cc', {
      fetchImpl: githubFetch({ pages: { html_url: 'https://other.github.io/cc/' }, live: ['https://other.github.io/cc/'] }),
    });

    expect(res.outcome).toBe('already_set');
    expect(row.save).not.toHaveBeenCalled();
    expect(row.project_variables.command_center_url).toBe('https://set-by-hand.example.com/');
  });

  it('records NOTHING while a first build is still running, and does not give up', async () => {
    const row = projectRow();
    mockProjectFindByPk.mockResolvedValue(row);
    const url = 'https://a.github.io/cc/';

    const res = await recordPagesUrlIfLive(PROJECT, 'a', 'cc', {
      fetchImpl: githubFetch({ pages: { html_url: url }, live: [] }),   // enabled, not yet serving
    });

    // `not_live_yet` is the retry-me answer: every later push asks again free.
    expect(res.outcome).toBe('not_live_yet');
    expect(row.save).not.toHaveBeenCalled();
  });

  it('reports not_enabled for a repo with Pages off and nothing answering', async () => {
    // The private-repo-on-a-free-plan case lands here: the student was refused,
    // and this is a quiet no-op rather than an error anybody has to handle.
    const row = projectRow();
    mockProjectFindByPk.mockResolvedValue(row);

    const res = await recordPagesUrlIfLive(PROJECT, 'a', 'cc', { fetchImpl: githubFetch() });
    expect(res.outcome).toBe('not_enabled');
    expect(row.save).not.toHaveBeenCalled();
  });

  it('still records when the API could not be reached but the derived URL answers', async () => {
    const row = projectRow();
    mockProjectFindByPk.mockResolvedValue(row);
    const derived = 'https://a.github.io/cc/';

    const res = await recordPagesUrlIfLive(PROJECT, 'a', 'cc', {
      fetchImpl: githubFetch({ live: [derived] }),   // API 404s, site is up
    });

    expect(res).toMatchObject({ outcome: 'recorded', url: derived, from_api: false });
  });

  it('never throws when the database is unavailable', async () => {
    mockProjectFindByPk.mockRejectedValue(new Error('connection terminated'));
    const res = await recordPagesUrlIfLive(PROJECT, 'a', 'cc', { fetchImpl: githubFetch() });
    expect(res.outcome).toBe('error');
  });

  it('is a no-op for a project that does not exist', async () => {
    mockProjectFindByPk.mockResolvedValue(null);
    expect((await recordPagesUrlIfLive(PROJECT, 'a', 'cc', { fetchImpl: githubFetch() })).outcome)
      .toBe('no_project');
  });
});
