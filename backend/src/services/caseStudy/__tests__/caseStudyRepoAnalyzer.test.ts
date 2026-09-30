/**
 * caseStudyRepoAnalyzer — T005 acceptance tests, part 1 of 2.
 *
 * This file: the injection SEAM (AC1), the seven-class failure vocabulary of
 * spec §29 (AC2), the token (AC5), the multi-repo `partial` rule (AC6), and one
 * requirement that is not in plan.md but is in the spec's privacy posture —
 * a PRIVATE repository's owner and name must never reach a log line.
 * Part 2 (`caseStudyRepoAnalyzerBounds.test.ts`) covers the bounds, determinism,
 * boundary inputs and persisted-tree reuse. They are split because CLAUDE.md
 * caps a file at 500 lines and one 900-line suite is not more honest than two.
 *
 * NO DATABASE, NO NETWORK, NO GLOBAL PATCHING OF `fetch`. The import graph
 * reaches zod, the GitHub client and the request-context helper — no model, no
 * Sequelize, no connection — so the suite passes with `DATABASE_URL` unset,
 * which is the only environment CI has (`backend/jest.ci.config.ts`). Every
 * request goes through an injected `fetchImpl`; `globalThis.fetch` is replaced
 * with a THROWING double in `beforeEach` and asserted untouched in `afterEach`,
 * so AC1 is enforced on every test in the file rather than on the one that
 * mentions it.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  analyzeRepository, analyzeRepositories, accessStatusForErrorClass, classifyThrown,
  CaseStudyRepoAnalysisError, isCaseStudyRepoAnalysisError,
} from '../caseStudyRepoAnalyzer';
import type {
  RepoAnalysisOutcome, RepoAnalysisSuccess, RepoAnalysisFailure,
} from '../caseStudyRepoAnalyzer';
import { opaqueRepoRef } from '../caseStudyRepoReader';
import { RepoConnectError } from '../../sbp/repoConnect/connectErrors';
import {
  makeGitHubFake, json, fileReply, abortError, repoPayload, treePayload, SENTINEL_TOKEN,
} from './githubFetchFake';

const SERVICE_DIR = path.join(__dirname, '..');
const readSource = (file: string): string => fs.readFileSync(path.join(SERVICE_DIR, file), 'utf8');

/** Comments are prose, not behaviour. A source scan that cannot tell them apart
 *  fails on a doc comment that merely NAMES the thing it forbids. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function ok(outcome: RepoAnalysisOutcome): RepoAnalysisSuccess {
  if (outcome.status === 'failed') {
    throw new Error(`expected an analysis, got failed (${outcome.error.error_class})`);
  }
  return outcome;
}

function failed(outcome: RepoAnalysisOutcome): RepoAnalysisFailure {
  if (outcome.status !== 'failed') throw new Error(`expected failed, got ${outcome.status}`);
  return outcome;
}

let logLines: string[] = [];
let logSpy: jest.SpyInstance;
let globalFetch: jest.Mock;
const realGlobalFetch = (globalThis as Record<string, unknown>).fetch;
const realToken = process.env.GITHUB_TOKEN;

beforeEach(() => {
  logLines = [];
  logSpy = jest.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logLines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
  });
  globalFetch = jest.fn(() => {
    throw new Error('globalThis.fetch was called — the fetchImpl seam was bypassed');
  });
  (globalThis as Record<string, unknown>).fetch = globalFetch;
  process.env.GITHUB_TOKEN = SENTINEL_TOKEN;
});

afterEach(() => {
  // AC1, enforced on every test in this file and not only the one that says so.
  expect(globalFetch).not.toHaveBeenCalled();
  logSpy.mockRestore();
  (globalThis as Record<string, unknown>).fetch = realGlobalFetch;
  if (realToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = realToken;
});

/* ── AC1 — the injected seam is the only way out ──────────────────────────── */

describe('AC1 — the fetchImpl seam', () => {
  const SOURCES = [
    'caseStudyRepoAnalyzer.ts', 'caseStudyRepoReader.ts',
    'repoFactExtractors.ts', 'repoDependencySignatures.ts',
  ];

  it('no service source reaches for a global fetch', () => {
    for (const file of SOURCES) {
      const code = withoutComments(readSource(file));
      expect({ file, reachesGlobalFetch: /\bglobal(This)?\s*\.\s*fetch\b/.test(code) })
        .toEqual({ file, reachesGlobalFetch: false });
    }
    // Positive control: the seam this file proves is used actually exists.
    expect(withoutComments(readSource('caseStudyRepoAnalyzer.ts'))).toContain('fetchImpl');
  });

  it('no service source reads the platform token', () => {
    for (const file of SOURCES) {
      // Comments stripped: the analyzer's header says in prose that it never
      // reads GITHUB_TOKEN, and a scan that cannot tell prose from code would
      // fail on the very sentence promising the property.
      const code = withoutComments(readSource(file));
      expect({ file, readsToken: /GITHUB_TOKEN|process\.env/.test(code) })
        .toEqual({ file, readsToken: false });
    }
    // Positive control: the token IS read, exactly once, inside the client.
    const client = fs.readFileSync(
      path.join(SERVICE_DIR, '..', 'sbp', 'repoConnect', 'githubRepoClient.ts'), 'utf8',
    );
    expect(withoutComments(client)).toContain('process.env.GITHUB_TOKEN');
  });

  it('a whole analysis runs through the injected impl and never the global', async () => {
    const gh = makeGitHubFake({
      tree: json(treePayload([{ path: 'README.md', type: 'blob', size: 18 }])),
      file: () => fileReply('# Atlas'),
    });
    const result = ok(await analyzeRepository({ owner: 'acme', repo: 'atlas', fetchImpl: gh.impl }));

    expect(result.status).toBe('ok');
    expect(gh.urls.length).toBe(5); // metadata + commits + languages + tree + 1 body
    expect(result.facts.metadata.latestCommitSha).toBe('c0ffee0000000000000000000000000000000000');
    expect(result.facts.derived.deploymentUrl).toBe('https://atlas.example.com');
    // afterEach asserts the throwing global fetch was never called.
  });
});

/* ── AC2 — spec §29's seven classes, one test each ────────────────────────── */

describe('AC2 — failure classification', () => {
  const analyse = (routes: Parameters<typeof makeGitHubFake>[0]) => {
    const gh = makeGitHubFake(routes);
    return analyzeRepository({ owner: 'acme', repo: 'atlas', correlationId: 'cid-class', fetchImpl: gh.impl })
      .then((outcome) => ({ gh, outcome }));
  };

  it('RepoNotFound — GitHub cannot see the repository', async () => {
    const { gh, outcome } = await analyse({ repo: { status: 404, body: '{"message":"Not Found"}' } });
    expect(failed(outcome).error.error_class).toBe('RepoNotFound');
    expect(gh.urls).toHaveLength(1); // a 4xx is terminal — no quota burned retrying
  });

  it('Unauthorized — the platform credential is rejected (401)', async () => {
    const { outcome } = await analyse({ repo: { status: 401, body: '{"message":"Bad credentials"}' } });
    expect(failed(outcome).error.error_class).toBe('Unauthorized');
  });

  it('Unauthorized — a 403 that is a genuine permission refusal', async () => {
    const { gh, outcome } = await analyse({
      repo: {
        status: 403,
        body: '{"message":"Must have admin rights to Repository."}',
        headers: { 'x-ratelimit-remaining': '4999' },
      },
    });
    expect(failed(outcome).error.error_class).toBe('Unauthorized');
    expect(gh.urls).toHaveLength(1); // not retried: it is not a rate limit
  });

  it('RateLimited — the OTHER 403, the one whose headers say the quota is spent', async () => {
    const { gh, outcome } = await analyse({
      repo: {
        status: 403,
        body: '{"message":"API rate limit exceeded"}',
        headers: { 'x-ratelimit-remaining': '0', 'retry-after': '60' },
      },
    });
    expect(failed(outcome).error.error_class).toBe('RateLimited');
    expect(gh.urls).toHaveLength(3); // retried to the client's cap, then given up on
  }, 15_000);

  it('RateLimited — a plain 429', async () => {
    const { outcome } = await analyse({ repo: { status: 429, body: '{"message":"Too Many Requests"}' } });
    expect(failed(outcome).error.error_class).toBe('RateLimited');
    expect(accessStatusForErrorClass('RateLimited')).toBe('rate_limited');
  }, 15_000);

  it('Timeout — the client aborts before GitHub answers', async () => {
    const { gh, outcome } = await analyse({ repo: { status: 0, throws: abortError() } });
    expect(failed(outcome).error.error_class).toBe('Timeout');
    expect(gh.urls).toHaveLength(1); // an abort is not retried
  });

  it('RepoEmpty — the commits endpoint answers 409', async () => {
    const { outcome } = await analyse({ commits: { status: 409, body: '{"message":"Git Repository is empty."}' } });
    expect(failed(outcome).error).toEqual({ error_class: 'RepoEmpty', message: 'repository has no commits' });
  });

  it('Unknown — metadata is valid JSON of entirely the wrong shape', async () => {
    const { outcome } = await analyse({ repo: json([{ not: 'a repository' }]) });
    expect(failed(outcome).error.error_class).toBe('Unknown');
  });

  it('MalformedManifest — a package.json body that is not JSON is an issue, not a crash', async () => {
    const { outcome } = await analyse({
      tree: json(treePayload([
        { path: 'package.json', type: 'blob', size: 40 },
        { path: 'README.md', type: 'blob', size: 8 },
      ])),
      file: (p) => fileReply(p === 'package.json' ? '{"dependencies": {,}' : '# Atlas'),
    });
    const result = ok(outcome);
    expect(result.status).toBe('partial');
    expect(result.issues).toEqual([
      { error_class: 'MalformedManifest', message: 'manifest is not valid JSON', path: 'package.json' },
    ]);
    // The sync continues on the evidence that DID parse.
    expect(result.facts.derived.hasReadme).toBe(true);
    expect(result.facts.accessStatus).toBe('read_only');
    expect(accessStatusForErrorClass('MalformedManifest')).toBe('connected');
  });

  it('folds the client vocabulary into exactly those seven classes', () => {
    expect(classifyThrown(new RepoConnectError('UpstreamTimeout', 'x'))).toBe('Timeout');
    expect(classifyThrown(new RepoConnectError('RateLimited', 'x'))).toBe('RateLimited');
    expect(classifyThrown(new RepoConnectError('Unauthorized', 'x'))).toBe('Unauthorized');
    expect(classifyThrown(new RepoConnectError('ConfigError', 'x'))).toBe('Unauthorized');
    expect(classifyThrown(new RepoConnectError('NoPushAccess', 'x'))).toBe('Unauthorized');
    expect(classifyThrown(new RepoConnectError('RepoNotFound', 'x'))).toBe('RepoNotFound');
    expect(classifyThrown(new RepoConnectError('RepoEmpty', 'x'))).toBe('RepoEmpty');
    expect(classifyThrown(new RepoConnectError('UpstreamError', 'x'))).toBe('Unknown');
    expect(classifyThrown({ name: 'AbortError' })).toBe('Timeout');
    expect(classifyThrown(new Error('boom'))).toBe('Unknown');
    expect(classifyThrown(undefined)).toBe('Unknown');
  });

  it('maps every class onto a persisted access_status', () => {
    expect(accessStatusForErrorClass('RepoNotFound')).toBe('unavailable');
    expect(accessStatusForErrorClass('Unauthorized')).toBe('unavailable');
    expect(accessStatusForErrorClass('Timeout')).toBe('unavailable');
    expect(accessStatusForErrorClass('RepoEmpty')).toBe('connected');
    expect(accessStatusForErrorClass('Unknown')).toBe('unknown');
  });

  it('a missing platform token is a classified Unauthorized, not a crash', async () => {
    delete process.env.GITHUB_TOKEN;
    const gh = makeGitHubFake();
    const outcome = await analyzeRepository({ owner: 'acme', repo: 'atlas', fetchImpl: gh.impl });
    expect(failed(outcome).error.error_class).toBe('Unauthorized');
    expect(gh.urls).toHaveLength(0); // it never got as far as a request
  });

  it('an input that is not a repository reference is programmer error and throws', async () => {
    await expect(analyzeRepository({ owner: 'acme/evil', repo: 'atlas' }))
      .rejects.toBeInstanceOf(CaseStudyRepoAnalysisError);
    await expect(analyzeRepository({ owner: 'acme', repo: '' })).rejects.toThrow(/invalid analyzer input/);
    const caught = await analyzeRepository({ owner: '../../etc', repo: 'passwd' }).catch((e) => e);
    expect(isCaseStudyRepoAnalysisError(caught)).toBe(true);
    expect(caught.error_class).toBe('Unknown');
  });
});

/* ── AC5 — the token goes to GitHub and nowhere else ──────────────────────── */

describe('AC5 — the token never leaks', () => {
  it('reaches the Authorization header, and appears in no log line and no returned field', async () => {
    const gh = makeGitHubFake({
      tree: json(treePayload([
        { path: 'README.md', type: 'blob', size: 30 },
        { path: 'package.json', type: 'blob', size: 60 },
      ])),
      file: (p) => fileReply(p === 'package.json'
        ? '{"dependencies":{"express":"^4.19.0","pg":"^8.11.0"}}'
        : '# Atlas\n\nA claims triage copilot.\n'),
    });

    const result = ok(await analyzeRepository({
      owner: 'acme', repo: 'atlas', correlationId: 'cid-token', fetchImpl: gh.impl,
    }));

    // Non-vacuous: the token really was in play on every single request.
    expect(gh.authorizations).toHaveLength(6); // metadata, commits, languages, tree, 2 bodies
    expect(new Set(gh.authorizations)).toEqual(new Set([`Bearer ${SENTINEL_TOKEN}`]));

    // Non-vacuous: something really was logged.
    expect(logLines.length).toBeGreaterThan(0);
    for (const line of logLines) expect(line).not.toContain(SENTINEL_TOKEN);

    const serialised = JSON.stringify(result);
    expect(serialised).not.toContain(SENTINEL_TOKEN);
    expect(serialised).not.toContain('Bearer');
    expect(serialised).not.toContain('Authorization');
    expect(serialised).not.toContain('ghp_');
    // And the facts really were produced, so the assertion is not over an empty object.
    expect(result.facts.derived.frameworks).toEqual(['Express']);
    expect(result.facts.derived.databases).toEqual(['PostgreSQL']);
  });

  it('holds on the failure path too, where a naive handler would echo the request', async () => {
    const gh = makeGitHubFake({ repo: { status: 401, body: `{"message":"Bad credentials for ${SENTINEL_TOKEN}"}` } });
    const outcome = failed(await analyzeRepository({
      owner: 'acme', repo: 'atlas', correlationId: 'cid-token-fail', fetchImpl: gh.impl,
    }));

    expect(outcome.error.error_class).toBe('Unauthorized');
    expect(logLines.length).toBeGreaterThan(0);
    for (const line of logLines) expect(line).not.toContain(SENTINEL_TOKEN);
    expect(JSON.stringify(outcome)).not.toContain(SENTINEL_TOKEN);
  });
});

/* ── AC6 — spec §29: one bad repository yields `partial` ──────────────────── */

describe('AC6 — a repository set survives one bad member', () => {
  const goodRoutes = {
    tree: json(treePayload([{ path: 'README.md', type: 'blob', size: 18 }])),
    file: () => fileReply('# Atlas'),
  };

  it('returns partial, keeps the good facts, and carries the failing class', async () => {
    const good = makeGitHubFake(goodRoutes);
    const bad = makeGitHubFake({ repo: { status: 404, body: '{"message":"Not Found"}' } });

    const set = await analyzeRepositories([
      { owner: 'acme', repo: 'atlas', fetchImpl: good.impl },
      { owner: 'acme', repo: 'ghost', fetchImpl: bad.impl },
    ], { correlationId: 'cid-set' });

    expect(set.status).toBe('partial');
    expect(set.analyzed).toHaveLength(1);
    expect(set.analyzed[0].repoName).toBe('atlas');
    expect(set.analyzed[0].derived.hasReadme).toBe(true);
    expect(set.failures).toEqual([{
      status: 'failed',
      repoOwner: 'acme',
      repoName: 'ghost',
      error: { error_class: 'RepoNotFound', message: 'repository metadata unavailable (RepoNotFound)' },
    }]);
  });

  it('a clean set is success and a set with nothing readable is failed', async () => {
    const a = makeGitHubFake(goodRoutes);
    const b = makeGitHubFake(goodRoutes);
    const clean = await analyzeRepositories([
      { owner: 'acme', repo: 'atlas', fetchImpl: a.impl },
      { owner: 'acme', repo: 'atlas2', fetchImpl: b.impl },
    ]);
    expect(clean.status).toBe('success');
    expect(clean.failures).toEqual([]);
    expect(clean.issues).toEqual([]);

    const dead1 = makeGitHubFake({ repo: { status: 404, body: '{}' } });
    const dead2 = makeGitHubFake({ repo: { status: 404, body: '{}' } });
    const dead = await analyzeRepositories([
      { owner: 'acme', repo: 'gone1', fetchImpl: dead1.impl },
      { owner: 'acme', repo: 'gone2', fetchImpl: dead2.impl },
    ]);
    expect(dead.status).toBe('failed');
    expect(dead.analyzed).toEqual([]);
    expect(dead.failures).toHaveLength(2);
  });

  it('a per-repo ISSUE (nothing failed outright) is still partial, and is attributed', async () => {
    const good = makeGitHubFake(goodRoutes);
    const flaky = makeGitHubFake({
      repo: json(repoPayload({ name: 'flaky', full_name: 'acme/flaky' })),
      tree: json(treePayload([{ path: 'package.json', type: 'blob', size: 20 }])),
      file: () => fileReply('not json at all'),
    });

    const set = await analyzeRepositories([
      { owner: 'acme', repo: 'atlas', fetchImpl: good.impl },
      { owner: 'acme', repo: 'flaky', fetchImpl: flaky.impl },
    ]);

    expect(set.status).toBe('partial');
    expect(set.failures).toEqual([]);
    expect(set.analyzed).toHaveLength(2);
    expect(set.issues).toEqual([{
      error_class: 'MalformedManifest', message: 'manifest is not valid JSON', path: 'package.json',
      repoOwner: 'acme', repoName: 'flaky',
    }]);
  });

  it('an input the analyzer rejects outright does not take the set down with it', async () => {
    const good = makeGitHubFake(goodRoutes);
    const set = await analyzeRepositories([
      { owner: 'acme/evil', repo: 'atlas' },
      { owner: 'acme', repo: 'atlas', fetchImpl: good.impl },
    ]);

    expect(set.status).toBe('partial');
    expect(set.analyzed).toHaveLength(1);
    expect(set.failures).toHaveLength(1);
    expect(set.failures[0].error.error_class).toBe('Unknown');
    expect(set.failures[0].repoOwner).toBe('acme/evil');
  });
});

/* ── Private repository identity must not reach stdout ────────────────────── */

describe('a private repository is never named in a log line', () => {
  const OWNER = 'northwind-mutual';
  const NAME = 'northwind-claims-triage';

  const privateRepo = (extra: Record<string, unknown> = {}) => json(repoPayload({
    private: true, name: NAME, full_name: `${OWNER}/${NAME}`, owner: { login: OWNER },
    homepage: null, ...extra,
  }));

  const mentions = (): string[] => logLines.filter((l) => l.includes(OWNER) || l.includes(NAME));

  it('a clean private analysis logs an opaque handle instead of the identity', async () => {
    const gh = makeGitHubFake({
      repo: privateRepo(),
      tree: json(treePayload([{ path: 'README.md', type: 'blob', size: 12 }])),
      file: () => fileReply('# Internal'),
    });

    const result = ok(await analyzeRepository({
      owner: OWNER, repo: NAME, correlationId: 'cid-private', fetchImpl: gh.impl,
    }));

    expect(result.facts.metadata.visibility).toBe('private');
    expect(logLines).toHaveLength(1);       // non-vacuous: something WAS logged
    expect(mentions()).toEqual([]);
    const logged = JSON.parse(logLines[0]);
    expect(logged.context.repo_ref).toBe(opaqueRepoRef(OWNER, NAME));
    expect(logged.context.owner).toBeUndefined();
    expect(logged.context.repo).toBeUndefined();
  });

  it('a private repository that FAILS is not named either', async () => {
    const gh = makeGitHubFake({
      repo: privateRepo(),
      commits: { status: 409, body: '{"message":"Git Repository is empty."}' },
    });

    const outcome = failed(await analyzeRepository({
      owner: OWNER, repo: NAME, correlationId: 'cid-private-fail', fetchImpl: gh.impl,
    }));

    expect(outcome.error.error_class).toBe('RepoEmpty');
    expect(logLines).toHaveLength(1);
    expect(mentions()).toEqual([]);
    // The identity still reaches the CALLER — it is stdout that must not have it.
    expect(outcome.repoOwner).toBe(OWNER);
    expect(outcome.repoName).toBe(NAME);
  });

  it('unknown visibility fails closed and is treated as private', async () => {
    const gh = makeGitHubFake({
      repo: json({ name: 'ledger-x', owner: { login: 'zenith-group' }, default_branch: 'main' }),
    });

    const result = ok(await analyzeRepository({
      owner: 'zenith-group', repo: 'ledger-x', correlationId: 'cid-unknown', fetchImpl: gh.impl,
    }));

    expect(result.facts.metadata.visibility).toBe('unknown');
    expect(logLines.filter((l) => l.includes('zenith-group') || l.includes('ledger-x'))).toEqual([]);
  });

  it('a PUBLIC repository is still named — the gate is visibility, not a blanket erasure', async () => {
    const gh = makeGitHubFake();
    ok(await analyzeRepository({ owner: 'acme', repo: 'atlas', correlationId: 'cid-public', fetchImpl: gh.impl }));

    const logged = JSON.parse(logLines[0]);
    expect(logged.context.owner).toBe('acme');
    expect(logged.context.repo).toBe('atlas');
    expect(logged.context.repo_ref).toBeUndefined();
  });

  it('the opaque handle is stable, case-insensitive, and does not contain the identity', () => {
    const ref = opaqueRepoRef(OWNER, NAME);
    expect(ref).toBe(opaqueRepoRef(OWNER.toUpperCase(), NAME.toUpperCase()));
    expect(ref).toMatch(/^[0-9a-f]{16}$/);
    expect(ref).not.toContain(OWNER);
    expect(ref).not.toContain(NAME);
    expect(opaqueRepoRef(OWNER, 'other-repo')).not.toBe(ref);
  });
});
