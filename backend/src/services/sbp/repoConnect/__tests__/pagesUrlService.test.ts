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

// M1-T2 (Gov Proposal Studio): the gov demo auto-publish reaches into the capture module (dynamic import).
// Mocked so the recorded-branch gov logic is observable without a GovBuildDemo table. Defaults: host allowed,
// nothing set yet, write resolves. Non-gov tests never enter the block, so this mock is inert for them.
const mockSetGovBuildDemo = jest.fn().mockResolvedValue(undefined);
const mockGetGovBuildDemo = jest.fn().mockResolvedValue(null);
const mockIsAllowedDemoUrl = jest.fn().mockReturnValue(true);
jest.mock('../../../factory/proposal/captureStoryArtifact', () => ({
  setGovBuildDemo: (...a: any[]) => mockSetGovBuildDemo(...a),
  getGovBuildDemo: (...a: any[]) => mockGetGovBuildDemo(...a),
  isAllowedDemoUrl: (...a: any[]) => mockIsAllowedDemoUrl(...a),
}));

import {
  derivePagesUrl, fetchPagesUrl, pagesResponds, recordPagesUrlIfLive,
} from '../pagesUrlService';
import { CONNECTED_DEMO_DIR } from '../../connectedDemoStory';

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

// ── M1-T2: gov connected-demo auto-publish on the recorded branch ───────────

/**
 * When a GOV project's Command Center URL is first recorded, the connected demo URL
 * (<command_center_url>demo/) must auto-publish to Build Evidence — once, honouring a
 * human-set URL, respecting the host allowlist, and never throwing. A non-gov project
 * must be entirely unaffected.
 */
describe('gov connected-demo auto-publish (M1-T2)', () => {
  const GOV_SITE = 'https://colaberryintern.github.io/AcceleratorTesting/';
  const govRow = () => projectRow({ kind: 'gov', gov_delivery_project_id: 'dp-9' });
  const recordGov = (row: any) => {
    mockProjectFindByPk.mockResolvedValue(row);
    return recordPagesUrlIfLive(PROJECT, 'ColaberryIntern', 'AcceleratorTesting', {
      fetchImpl: githubFetch({ pages: { html_url: GOV_SITE }, live: [GOV_SITE] }),
    });
  };

  it('publishes <command_center_url>demo/ to the gov demo store when the host is allowed and none is set', async () => {
    mockGetGovBuildDemo.mockResolvedValueOnce(null);
    mockIsAllowedDemoUrl.mockReturnValueOnce(true);
    const res = await recordGov(govRow());
    expect(res.outcome).toBe('recorded');                               // the Command Center write still happens
    expect(mockSetGovBuildDemo).toHaveBeenCalledTimes(1);
    expect(mockSetGovBuildDemo).toHaveBeenCalledWith('dp-9', { demoUrl: `${GOV_SITE}${CONNECTED_DEMO_DIR}` });
  });

  it('SKIPS the write when a demo URL was already set by hand (never overwrites a human)', async () => {
    mockGetGovBuildDemo.mockResolvedValueOnce({ demoUrl: 'https://set-by-hand.example.com/', captureRoot: null, storyCapturePaths: {} });
    const res = await recordGov(govRow());
    expect(res.outcome).toBe('recorded');
    expect(mockSetGovBuildDemo).not.toHaveBeenCalled();
  });

  it('SKIPS the write when the demo host is not on the allowlist', async () => {
    mockGetGovBuildDemo.mockResolvedValueOnce(null);
    mockIsAllowedDemoUrl.mockReturnValueOnce(false);                    // e.g. github.io not yet in GOV_DEMO_HOST_ALLOWLIST
    const res = await recordGov(govRow());
    expect(res.outcome).toBe('recorded');
    expect(mockSetGovBuildDemo).not.toHaveBeenCalled();
  });

  it('does NOTHING for a non-gov project — the student path is untouched', async () => {
    const res = await recordGov(projectRow());                         // no kind:'gov'
    expect(res.outcome).toBe('recorded');
    expect(mockSetGovBuildDemo).not.toHaveBeenCalled();
    expect(mockGetGovBuildDemo).not.toHaveBeenCalled();
  });

  it('NEVER throws out of the recorded branch even if the demo write fails', async () => {
    mockGetGovBuildDemo.mockResolvedValueOnce(null);
    mockIsAllowedDemoUrl.mockReturnValueOnce(true);
    mockSetGovBuildDemo.mockRejectedValueOnce(new Error('demo store down'));
    const res = await recordGov(govRow());
    expect(res.outcome).toBe('recorded');                              // the failure is swallowed, URL still recorded
  });
});

// ── where IN the site it looks ──────────────────────────────────────────────

/**
 * THE PRODUCTION FAILURE THIS PINS.
 *
 * A Command Center was genuinely published and answered 200 at
 * `https://colaberryintern.github.io/AcceleratorTesting/command-center/index.html`.
 * This module asked GitHub for `html_url`, got the SITE root, probed only that,
 * received the 404 a repo with no root `index.html` correctly serves, and
 * logged `sbp_pages_not_live` — a false statement about a live site.
 * `command_center_url` stayed NULL and the portal header link never rendered.
 *
 * The authoritative fix is the convention in the prompt (pinned in
 * `__tests__/commandCenterLocation.test.ts`). These tests hold the other half:
 * the probe must actually visit the documented location, must not call a live
 * site dead because it looked in one place, and must say which places it looked.
 */
describe('probing the site — the D2 defect', () => {
  const SITE = 'https://colaberryintern.github.io/AcceleratorTesting/';
  const UNDER = `${SITE}command-center/`;

  it('records the documented location when it is the one that answers', async () => {
    const row = projectRow();
    mockProjectFindByPk.mockResolvedValue(row);

    const res = await recordPagesUrlIfLive(PROJECT, 'ColaberryIntern', 'AcceleratorTesting', {
      fetchImpl: githubFetch({ pages: { html_url: SITE }, live: [SITE] }),
    });

    expect(res).toMatchObject({ outcome: 'recorded', url: SITE });
    expect(row.project_variables.command_center_url).toBe(SITE);
  });

  it('finds a Command Center one directory down instead of calling a live site dead', async () => {
    // Exactly the repo from the rehearsal: no root index.html, a working page
    // under command-center/. Before this fix the outcome was `not_live_yet` and
    // the student got no link, forever.
    const row = projectRow();
    mockProjectFindByPk.mockResolvedValue(row);

    const res = await recordPagesUrlIfLive(PROJECT, 'ColaberryIntern', 'AcceleratorTesting', {
      fetchImpl: githubFetch({ pages: { html_url: SITE }, live: [UNDER] }),
    });

    expect(res.outcome).toBe('recorded');
    // The address recorded is the one that actually answers — a link to the
    // root would put the student back in front of the 404.
    expect(res.url).toBe(UNDER);
    expect(row.project_variables.command_center_url).toBe(UNDER);
  });

  it('PREFERS the documented root when both answer, so the convention wins', async () => {
    const row = projectRow();
    mockProjectFindByPk.mockResolvedValue(row);

    const res = await recordPagesUrlIfLive(PROJECT, 'ColaberryIntern', 'AcceleratorTesting', {
      fetchImpl: githubFetch({ pages: { html_url: SITE }, live: [SITE, UNDER] }),
    });

    expect(res.url).toBe(SITE);
  });

  it('names every URL it tried when it reports a site as not live', async () => {
    // "Not live" was the lie. It is only checkable if the log says what was
    // asked — a claim about one URL dressed up as a claim about the site.
    const row = projectRow();
    mockProjectFindByPk.mockResolvedValue(row);
    const logs = jest.spyOn(console, 'log').mockImplementation(() => {});

    try {
      const res = await recordPagesUrlIfLive(PROJECT, 'ColaberryIntern', 'AcceleratorTesting', {
        fetchImpl: githubFetch({ pages: { html_url: SITE }, live: [] }),
      });

      const events = logs.mock.calls
        .map(([line]) => { try { return JSON.parse(String(line)); } catch { return null; } })
        .filter((e): e is any => e !== null);
      const notLive = events.find((e) => e.event === 'sbp_pages_not_live');

      // Anti-vacuity: without this the assertions below run against `undefined`
      // and an optional-chained read would quietly prove nothing.
      expect(notLive).toBeDefined();
      expect(notLive.context.probed).toEqual([SITE, UNDER]);
      expect(res.probed).toEqual([SITE, UNDER]);
    } finally {
      logs.mockRestore();
    }
  });

  it('probes below a CUSTOM DOMAIN too, not just the derived github.io shape', async () => {
    const row = projectRow();
    mockProjectFindByPk.mockResolvedValue(row);
    const custom = 'https://command.example.com/';

    const res = await recordPagesUrlIfLive(PROJECT, 'alice', 'cc', {
      fetchImpl: githubFetch({ pages: { html_url: custom }, live: [`${custom}command-center/`] }),
    });

    expect(res).toMatchObject({ outcome: 'recorded', url: `${custom}command-center/`, from_api: true });
  });

  it('still reports not_enabled when nothing answers anywhere it looked', async () => {
    // The private-repo-on-a-free-plan case must stay a quiet no-op. Widening
    // the probe list must not turn "no hosting" into an error anybody handles.
    const row = projectRow();
    mockProjectFindByPk.mockResolvedValue(row);

    const res = await recordPagesUrlIfLive(PROJECT, 'a', 'cc', { fetchImpl: githubFetch() });

    expect(res.outcome).toBe('not_enabled');
    expect(res.probed.length).toBeGreaterThan(1);
    expect(row.save).not.toHaveBeenCalled();
  });
});
