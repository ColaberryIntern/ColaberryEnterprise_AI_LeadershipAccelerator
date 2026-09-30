/**
 * caseStudyRepoAnalyzer — T005 acceptance tests, part 2 of 2.
 *
 * This file: the BOUNDS (AC3), DETERMINISM (AC4), the boundary inputs that must
 * degrade rather than throw, and persisted-tree reuse. Part 1
 * (`caseStudyRepoAnalyzer.test.ts`) covers the seam, the seven failure classes,
 * the token and the multi-repo `partial` rule. The split is CLAUDE.md's 500-line
 * ceiling, not a difference in rigour: both halves inject `fetchImpl`, install a
 * THROWING `globalThis.fetch`, and assert in `afterEach` that it was never
 * called, so nothing here can silently reach the network.
 *
 * NO DATABASE. No model or Sequelize import exists anywhere in the graph, so
 * this passes with `DATABASE_URL` unset — the only environment CI provides.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  analyzeRepository, persistedTreeFromConnection, isPersistedTreeFresh,
  DEFAULT_PERSISTED_TREE_MAX_AGE_MS,
} from '../caseStudyRepoAnalyzer';
import type {
  RepoAnalysisOutcome, RepoAnalysisSuccess, AnalyzeRepositoryInput,
} from '../caseStudyRepoAnalyzer';
import {
  MAX_CONTENT_FETCHES, MAX_FILE_BYTES, MAX_DEPENDENCIES, MAX_LIST_ITEMS,
  MAX_DOCUMENTS, MAX_DOCUMENT_EXCERPT_BYTES,
} from '../repoFactExtractors';
import {
  makeGitHubFake, json, fileReply, treePayload, repoPayload, SENTINEL_TOKEN,
} from './githubFetchFake';
import type { FakeRoutes, TreeEntry } from './githubFetchFake';

function ok(outcome: RepoAnalysisOutcome): RepoAnalysisSuccess {
  if (outcome.status === 'failed') {
    throw new Error(`expected an analysis, got failed (${outcome.error.error_class})`);
  }
  return outcome;
}

const run = (routes: FakeRoutes, extra: Partial<AnalyzeRepositoryInput> = {}) => {
  const gh = makeGitHubFake(routes);
  return analyzeRepository({
    owner: 'acme', repo: 'atlas', correlationId: 'cid-bounds', fetchImpl: gh.impl, ...extra,
  }).then((outcome) => ({ gh, outcome }));
};

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
  expect(globalFetch).not.toHaveBeenCalled();
  logSpy.mockRestore();
  (globalThis as Record<string, unknown>).fetch = realGlobalFetch;
  if (realToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = realToken;
});

/* ── AC3 — bounded fetching ───────────────────────────────────────────────── */

/** Rich in EVERY high-value category, so the global cap is what bites. */
const HIGH_VALUE_FIXTURE: readonly string[] = [
  'package.json', 'apps/web/package.json', 'apps/api/package.json', 'apps/jobs/package.json',
  'requirements.txt', 'svc/requirements.txt', 'svc/etl/requirements.txt',
  'pyproject.toml', 'go.mod', 'Cargo.toml', 'Api.csproj', 'Web.csproj', 'Jobs.csproj',
  'Dockerfile', 'Dockerfile.dev', 'Dockerfile.prod',
  'docker-compose.yml', 'docker-compose.prod.yml', 'compose.yaml',
  'README.md', 'CLAUDE.md', 'case-study.json', '.colaberry/plan.json', '.colaberry/manifest.json',
  'docs/REQUIREMENTS.md', 'docs/ARCHITECTURE.md',
  'docs/architecture/data.md', 'docs/architecture/runtime.md', 'docs/architecture/security.md',
  'docs/TRACEABILITY.md', 'docs/STORIES.md',
  '.github/workflows/ci.yml', '.github/workflows/deploy.yml', '.github/workflows/nightly.yml',
];

function tenThousandEntries(): TreeEntry[] {
  const entries: TreeEntry[] = HIGH_VALUE_FIXTURE.map((p) => ({ path: p, type: 'blob', size: 512 }));
  let i = 0;
  while (entries.length < 10_000) {
    entries.push({ path: `src/mod${Math.floor(i / 50)}/file${i % 50}.ts`, type: 'blob', size: 900 });
    i += 1;
  }
  return entries;
}

/** A NUL byte, spelled without putting a control character in this source file. */
const NUL = String.fromCharCode(0);

const smallBodies = (p: string) => fileReply(p.toLowerCase().endsWith('.json') ? '{}' : '# doc\n');

describe('AC3 — bounded fetching', () => {
  it('a 10,000-path repository costs at most MAX_CONTENT_FETCHES content requests', async () => {
    const entries = tenThousandEntries();
    expect(entries).toHaveLength(10_000);

    const { gh, outcome } = await run({ tree: json(treePayload(entries)), file: smallBodies });
    const result = ok(outcome);

    expect(gh.filePaths.length).toBeLessThanOrEqual(MAX_CONTENT_FETCHES);
    // ...and the cap really bit: this fixture is rich enough to want more.
    expect(gh.filePaths).toHaveLength(MAX_CONTENT_FETCHES);
    expect(new Set(gh.filePaths).size).toBe(MAX_CONTENT_FETCHES); // nothing fetched twice
    // Four metadata-class reads plus the capped bodies. Never a recursive walk.
    expect(gh.urls).toHaveLength(4 + MAX_CONTENT_FETCHES);
    expect(gh.countMatching('/git/trees/')).toBe(1);

    expect(result.facts.fileCount).toBe(10_000);
    expect(result.facts.filesRead).toHaveLength(MAX_CONTENT_FETCHES);
    // Manifests are fetched before prose, and prose before workflow bodies.
    expect(gh.filePaths).toContain('package.json');
    expect(gh.filePaths).not.toContain('.github/workflows/ci.yml');
  }, 30_000);

  it('a blob the tree already says is oversized is never fetched at all', async () => {
    const { gh, outcome } = await run({
      tree: json(treePayload([
        { path: 'README.md', type: 'blob', size: MAX_FILE_BYTES + 1 },
        { path: 'CLAUDE.md', type: 'blob', size: 64 },
      ])),
      file: () => fileReply('# small'),
    });
    const result = ok(outcome);

    expect(gh.filePaths).toEqual(['CLAUDE.md']);
    expect(result.facts.derived.hasReadme).toBe(true); // the PATH still proves it exists
    expect(result.facts.documents.map((d) => d.path)).toEqual(['CLAUDE.md']);
  });

  it('a file the tree did not size is truncated at MAX_FILE_BYTES, not loaded whole', async () => {
    const huge = 'a'.repeat(MAX_FILE_BYTES * 2 + 777);
    const { outcome } = await run({
      tree: json(treePayload([{ path: 'README.md', type: 'blob' }])),
      file: () => fileReply(huge),
    });
    const doc = ok(outcome).facts.documents[0];

    expect(doc.path).toBe('README.md');
    expect(doc.bytes).toBe(MAX_FILE_BYTES);
    expect(doc.bytes).toBeLessThan(huge.length);
    expect(Buffer.byteLength(doc.excerpt, 'utf8')).toBe(MAX_DOCUMENT_EXCERPT_BYTES);
  });

  it('keeps at most MAX_DOCUMENTS excerpts however much prose a repository ships', async () => {
    const prose = [
      'README.md', 'CLAUDE.md', 'docs/REQUIREMENTS.md', 'docs/ARCHITECTURE.md',
      'docs/architecture/data.md', 'docs/architecture/runtime.md',
      'docs/TRACEABILITY.md', 'docs/STORIES.md',
    ];
    const { gh, outcome } = await run({
      tree: json(treePayload(prose.map((p) => ({ path: p, type: 'blob', size: 200 })))),
      file: () => fileReply('# prose\n'),
    });

    expect(gh.filePaths).toHaveLength(prose.length); // all eight were read
    expect(ok(outcome).facts.documents).toHaveLength(MAX_DOCUMENTS); // only six are kept
  });

  it('caps the derived lists at MAX_DEPENDENCIES and MAX_LIST_ITEMS', async () => {
    const dependencies: Record<string, string> = {};
    for (let i = 0; i < 400; i += 1) dependencies[`pkg-${String(i).padStart(3, '0')}`] = '^1.0.0';
    const languages: Record<string, number> = {};
    for (let i = 0; i < 80; i += 1) languages[`Lang${String(i).padStart(2, '0')}`] = 1000 - i;

    const { outcome } = await run({
      languages: json(languages),
      tree: json(treePayload([{ path: 'package.json', type: 'blob', size: 100 }])),
      file: () => fileReply(JSON.stringify({ dependencies })),
    });
    const facts = ok(outcome).facts;

    expect(facts.derived.dependencies).toHaveLength(MAX_DEPENDENCIES);
    expect(facts.derived.languages).toHaveLength(MAX_LIST_ITEMS);
    // The raw GitHub breakdown is a metadata fact, not a derived list, so it is uncapped.
    expect(facts.metadata.languageBytes).toHaveLength(80);
    expect(facts.metadata.languageBytes[0]).toEqual({ name: 'Lang00', bytes: 1000 });
  });
});

/* ── AC4 — determinism ────────────────────────────────────────────────────── */

/** Freeze both clock reads the stack makes: `Date.now()` and `new Date()`. */
function freezeClock(iso: string): () => void {
  const fixed = new Date(iso).getTime();
  const now = jest.spyOn(Date, 'now').mockReturnValue(fixed);
  const toIso = jest.spyOn(Date.prototype, 'toISOString').mockReturnValue(iso);
  return () => { now.mockRestore(); toIso.mockRestore(); };
}

const DETERMINISM_ENTRIES: readonly TreeEntry[] = [
  { path: 'README.md', type: 'blob', size: 40 },
  { path: 'package.json', type: 'blob', size: 90 },
  { path: 'src/app.ts', type: 'blob', size: 300 },
  { path: 'src/__tests__/app.test.ts', type: 'blob', size: 120 },
  { path: '.github/workflows/ci.yml', type: 'blob', size: 200 },
  { path: 'Dockerfile', type: 'blob', size: 80 },
];

const determinismRoutes = (entries: readonly TreeEntry[] = DETERMINISM_ENTRIES): FakeRoutes => ({
  tree: json(treePayload(entries)),
  file: (p) => fileReply(
    p === 'package.json' ? '{"dependencies":{"express":"^4"},"devDependencies":{"jest":"^29"}}'
      : p === 'Dockerfile' ? 'FROM postgres:16\n'
        : '# Atlas\n',
  ),
});

describe('AC4 — determinism', () => {
  it('two runs of the same fixture are byte-identical under different clocks and ids', async () => {
    const restore1 = freezeClock('2026-01-01T00:00:00.000Z');
    const first = ok((await run(determinismRoutes(), { correlationId: undefined })).outcome);
    restore1();

    const restore2 = freezeClock('2031-07-04T12:34:56.000Z');
    const second = ok((await run(determinismRoutes(), { correlationId: undefined })).outcome);
    restore2();

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));

    // Non-vacuous: the two runs really did happen at different times, under
    // different (randomly minted) correlation ids — and neither reached the facts.
    const logged = logLines.map((line) => JSON.parse(line));
    expect(logged).toHaveLength(2);
    expect(logged[0].timestamp).toBe('2026-01-01T00:00:00.000Z');
    expect(logged[1].timestamp).toBe('2031-07-04T12:34:56.000Z');
    expect(logged[0].correlation_id).not.toBe(logged[1].correlation_id);

    const serialised = JSON.stringify(first);
    expect(serialised).not.toContain('2026-01-01T00:00:00.000Z');
    expect(serialised).not.toContain('2031-07-04');
    expect(serialised).not.toContain(logged[0].correlation_id);
    // Only GitHub's own timestamps survive into the facts.
    expect(first.facts.metadata.pushedAt).toBe('2026-03-04T05:06:07Z');
  });

  it('a tree that arrives in a different order produces the same facts', async () => {
    const forward = ok((await run(determinismRoutes())).outcome);
    const backward = ok((await run(determinismRoutes([...DETERMINISM_ENTRIES].reverse()))).outcome);

    expect(JSON.stringify(backward)).toBe(JSON.stringify(forward));
    expect(forward.facts.derived.frameworks).toEqual(['Express']);
    expect(forward.facts.derived.databases).toEqual(['PostgreSQL']);
    expect(forward.facts.derived.testFrameworks).toEqual(['Jest']);
    expect(forward.facts.derived.ciProviders).toEqual(['github_actions']);
  });

  it('no fact-producing module reads a clock or a random number', () => {
    const dir = path.join(__dirname, '..');
    for (const file of ['repoFactExtractors.ts', 'repoDependencySignatures.ts']) {
      const src = fs.readFileSync(path.join(dir, file), 'utf8');
      expect({ file, clock: /\bDate\s*\.\s*now\b|new\s+Date\b/.test(src) }).toEqual({ file, clock: false });
      expect({ file, random: /\bMath\s*\.\s*random\b|randomUUID/.test(src) }).toEqual({ file, random: false });
    }
    const analyzer = fs.readFileSync(path.join(dir, 'caseStudyRepoAnalyzer.ts'), 'utf8');
    expect(/\bDate\s*\.\s*now\b/.test(analyzer)).toBe(false);
    // `new Date(suppliedValue)` parses a caller's value; `new Date()` would read a clock.
    expect(/new\s+Date\s*\(\s*\)/.test(analyzer)).toBe(false);
  });
});

/* ── Boundary inputs: degrade, never throw ────────────────────────────────── */

describe('boundary repositories', () => {
  it('an empty repository is a classified RepoEmpty, not an exception', async () => {
    const viaStatus = await run({ commits: { status: 409, body: '{"message":"Git Repository is empty."}' } });
    expect(viaStatus.outcome.status).toBe('failed');

    const viaEmptyList = await run({ commits: json([]) });
    expect(viaEmptyList.outcome.status).toBe('failed');
    if (viaEmptyList.outcome.status === 'failed') {
      expect(viaEmptyList.outcome.error.error_class).toBe('RepoEmpty');
    }
  });

  it('a repository with no README still analyses', async () => {
    const { outcome } = await run({
      tree: json(treePayload([
        { path: 'src/app.ts', type: 'blob', size: 100 },
        { path: 'src/util.py', type: 'blob', size: 100 },
      ])),
    });
    const facts = ok(outcome).facts;
    expect(facts.derived.hasReadme).toBe(false);
    expect(facts.documents).toEqual([]);
    expect(facts.derived.languages).toEqual(expect.arrayContaining(['Python', 'TypeScript']));
  });

  it('a repository that is ONLY a README still analyses', async () => {
    const { gh, outcome } = await run({
      tree: json(treePayload([{ path: 'README.md', type: 'blob', size: 24 }])),
      file: () => fileReply('# Atlas\n\nJust a readme.\n'),
    });
    const facts = ok(outcome).facts;
    expect(gh.filePaths).toEqual(['README.md']);
    expect(facts.derived.hasReadme).toBe(true);
    expect(facts.derived.dependencies).toEqual([]);
    expect(facts.derived.frameworks).toEqual([]);
    expect(facts.documents).toHaveLength(1);
    expect(outcome.status).toBe('ok');
  });

  it('a binary blob is skipped silently — a repository with a PNG is not a failed analysis', async () => {
    const { outcome } = await run({
      tree: json(treePayload([{ path: 'README.md', type: 'blob', size: 200 }])),
      file: () => fileReply(`${NUL}PNG\r\n${'x'.repeat(50)}`),
    });
    const result = ok(outcome);
    expect(result.status).toBe('ok');
    expect(result.issues).toEqual([]);
    expect(result.facts.filesRead).toEqual([]);
    expect(result.facts.documents).toEqual([]);
  });

  it('a tree with zero blobs costs zero content requests', async () => {
    const { gh, outcome } = await run({
      tree: json(treePayload([
        { path: 'src', type: 'tree' }, { path: 'docs', type: 'tree' }, { path: 'sub', type: 'commit' },
      ])),
    });
    const facts = ok(outcome).facts;
    expect(gh.filePaths).toEqual([]);
    expect(facts.fileCount).toBe(0);
    expect(facts.filesRead).toEqual([]);
    expect(facts.treeSource).toBe('github');
  });

  it('a tree that could not be read is partial, with the facts metadata still proves', async () => {
    const { outcome } = await run({ tree: { status: 404, body: '{"message":"Not Found"}' } });
    const result = ok(outcome);
    expect(result.status).toBe('partial');
    expect(result.issues).toEqual([{ error_class: 'RepoNotFound', message: 'file tree unavailable' }]);
    expect(result.facts.treeSource).toBe('unavailable');
    expect(result.facts.fileCount).toBe(0);
    expect(result.facts.metadata.description).toBe('Claims triage copilot');
    expect(result.facts.accessStatus).toBe('read_only');
  });

  it('a truncated tree is reported as truncated rather than silently trusted', async () => {
    const { outcome } = await run({
      tree: json(treePayload([{ path: 'README.md', type: 'blob', size: 10 }], true)),
      file: () => fileReply('# Atlas'),
    });
    expect(ok(outcome).facts.treeTruncated).toBe(true);
  });

  it('metadata GitHub answered with almost nothing degrades to null facts', async () => {
    const { outcome } = await run({ repo: json({}) });
    const facts = ok(outcome).facts;
    expect(facts.repoOwner).toBe('acme');   // falls back to what the caller asked for
    expect(facts.repoName).toBe('atlas');
    expect(facts.metadata.defaultBranch).toBe('main');
    expect(facts.metadata.license).toBeNull();
    expect(facts.metadata.visibility).toBe('unknown');
    expect(facts.derived.deploymentUrl).toBeNull();
  });
});

/* ── Persisted-tree reuse ─────────────────────────────────────────────────── */

describe('persisted file_tree_json reuse', () => {
  const FILE_TREE_JSON = {
    sha: 'abc',
    tree: [
      { path: 'README.md', type: 'blob', size: 12 },
      { path: 'src', type: 'tree' },
      { path: 'src/app.ts', type: 'blob', size: 200 },
    ],
    truncated: false,
  };

  it('adapts github_connections.file_tree_json, keeping blobs only', () => {
    const tree = persistedTreeFromConnection(FILE_TREE_JSON, '2026-08-01T00:00:00Z');
    expect(tree?.paths).toEqual(['README.md', 'src/app.ts']);
    expect(tree?.sizes?.get('src/app.ts')).toBe(200);
    expect(tree?.truncated).toBe(false);
    expect(tree?.fetchedAtMs).toBe(new Date('2026-08-01T00:00:00Z').getTime());
  });

  it('returns null for anything that is not a usable tree', () => {
    expect(persistedTreeFromConnection(null)).toBeNull();
    expect(persistedTreeFromConnection(undefined)).toBeNull();
    expect(persistedTreeFromConnection({})).toBeNull();
    expect(persistedTreeFromConnection({ tree: [] })).toBeNull();
    expect(persistedTreeFromConnection({ tree: [{ path: 'src', type: 'tree' }] })).toBeNull();
    expect(persistedTreeFromConnection('{"tree":[]}')).toBeNull();
    expect(persistedTreeFromConnection(FILE_TREE_JSON, 'not a date')?.fetchedAtMs).toBeNull();
    expect(persistedTreeFromConnection(FILE_TREE_JSON, null)?.fetchedAtMs).toBeNull();
  });

  it('freshness is the caller\'s decision, and the boundary is inclusive', () => {
    const now = 1_800_000_000_000;
    const aged = (ageMs: number) => ({ paths: ['README.md'], fetchedAtMs: now - ageMs });

    expect(isPersistedTreeFresh(aged(0), now)).toBe(true);
    expect(isPersistedTreeFresh(aged(DEFAULT_PERSISTED_TREE_MAX_AGE_MS - 1), now)).toBe(true);
    expect(isPersistedTreeFresh(aged(DEFAULT_PERSISTED_TREE_MAX_AGE_MS), now)).toBe(true);
    expect(isPersistedTreeFresh(aged(DEFAULT_PERSISTED_TREE_MAX_AGE_MS + 1), now)).toBe(false);
    expect(isPersistedTreeFresh(aged(-1), now)).toBe(false);           // clock skew is not freshness
    expect(isPersistedTreeFresh(aged(60_000), now, 1_000)).toBe(false); // the caller may be stricter
    expect(isPersistedTreeFresh({ paths: [], fetchedAtMs: now }, now)).toBe(false);
    expect(isPersistedTreeFresh({ paths: ['x'], fetchedAtMs: null }, now)).toBe(false);
    expect(isPersistedTreeFresh(null, now)).toBe(false);
    expect(isPersistedTreeFresh(undefined, now)).toBe(false);
  });

  it('a FRESH persisted tree removes the tree request entirely', async () => {
    const now = Date.now();
    const persisted = persistedTreeFromConnection(FILE_TREE_JSON, new Date(now - 60_000));
    expect(isPersistedTreeFresh(persisted, now)).toBe(true);

    const { gh, outcome } = await run(
      // Wired to fail loudly if it is called: it must not be.
      { tree: { status: 500, body: 'the tree endpoint must not be reached' }, file: () => fileReply('# Atlas') },
      { persistedTree: persisted },
    );
    const facts = ok(outcome).facts;

    expect(gh.countMatching('/git/trees/')).toBe(0);
    expect(gh.urls).toHaveLength(4); // metadata + commits + languages + 1 body
    expect(facts.treeSource).toBe('persisted');
    expect(facts.fileCount).toBe(2);
    expect(facts.derived.hasReadme).toBe(true);
    expect(outcome.status).toBe('ok');
  });

  it('a STALE persisted tree sends the caller back to GitHub', async () => {
    const now = Date.now();
    const persisted = persistedTreeFromConnection(
      FILE_TREE_JSON, new Date(now - DEFAULT_PERSISTED_TREE_MAX_AGE_MS - 1),
    );
    expect(isPersistedTreeFresh(persisted, now)).toBe(false);

    const { gh, outcome } = await run(
      {
        tree: json(treePayload([{ path: 'README.md', type: 'blob', size: 12 }])),
        file: () => fileReply('# Atlas'),
      },
      { persistedTree: isPersistedTreeFresh(persisted, now) ? persisted : null },
    );

    expect(gh.countMatching('/git/trees/')).toBe(1);
    expect(ok(outcome).facts.treeSource).toBe('github');
  });

  it('a persisted tree and a live tree of the same content derive the same facts', async () => {
    const entries = FILE_TREE_JSON.tree;
    const routes: FakeRoutes = { file: () => fileReply('# Atlas') };
    const now = Date.now();

    const live = ok((await run({ ...routes, tree: json(treePayload(entries)) })).outcome);
    const cached = ok((await run(
      { ...routes, tree: { status: 500, body: 'must not be reached' } },
      { persistedTree: persistedTreeFromConnection(FILE_TREE_JSON, new Date(now)) },
    )).outcome);

    expect({ ...cached.facts, treeSource: 'github' }).toEqual(live.facts);
  });

  it('a repository payload with a non-default branch still reads that branch', async () => {
    const { gh } = await run({ repo: json(repoPayload({ default_branch: 'trunk' })) });
    expect(gh.urls.some((u) => u.includes('/git/trees/trunk?recursive=1'))).toBe(true);
  });
});
