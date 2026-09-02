import { analyzeRepository } from '../caseStudyRepoAnalyzer';
import type { RepoAnalysisOutcome, RepoAnalysisSuccess } from '../caseStudyRepoAnalyzer';
import { makeGitHubFake, json, treePayload, fileReply, SENTINEL_TOKEN } from './githubFetchFake';

/**
 * A scope changes the FACTS, not just the file list.
 *
 * This is the assertion the whole feature exists for. `repoPathScope.test.ts`
 * proves the filter is correct in isolation; correct filtering is worth nothing
 * if the analyzer derives its stack, its test count and its file count from the
 * unfiltered tree anyway. So this runs the real analyzer twice over the same
 * fake repository — once whole, once scoped — and asserts the two disagree in
 * the ways they should.
 *
 * NO DATABASE, NO NETWORK: every request goes through an injected `fetchImpl`.
 */

const MONOREPO = [
  'backend/src/services/agents/corybrain/resolver.ts',
  'backend/src/services/agents/corybrain/rules.ts',
  'backend/src/services/agents/corybrain/__tests__/rules.test.ts',
  'backend/src/services/agents/corybrain/__tests__/resolver.test.ts',
  'backend/src/services/agents/openclaw/poster.ts',
  // Tests OUTSIDE the scope. Without these the whole-repo and scoped counts are
  // both 2 and the comparison below asserts nothing — the first version of this
  // fixture had exactly that hole.
  'backend/src/services/agents/openclaw/__tests__/poster.test.ts',
  'frontend/src/pages/__tests__/Home.test.tsx',
  'frontend/src/pages/Home.tsx',
  'frontend/src/pages/Home.css',
  'scripts/deploy.py',
  'scripts/legacy.rb',
  'README.md',
];

const realToken = process.env.GITHUB_TOKEN;
beforeEach(() => { process.env.GITHUB_TOKEN = SENTINEL_TOKEN; });
afterEach(() => {
  if (realToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = realToken;
});

function ok(outcome: RepoAnalysisOutcome): RepoAnalysisSuccess {
  if (outcome.status === 'failed') throw new Error(`failed: ${outcome.error.error_class}`);
  return outcome;
}

async function analyse(pathScope?: string[]): Promise<RepoAnalysisSuccess> {
  const gh = makeGitHubFake({
    tree: json(treePayload(MONOREPO.map((path) => ({ path, type: 'blob', size: 100 })))),
    // The languages API answers for the WHOLE repository and cannot be scoped.
    languages: json({ TypeScript: 90000, Python: 40000, Ruby: 20000 }),
  });
  return ok(await analyzeRepository({
    owner: 'acme', repo: 'monorepo', correlationId: 'cid-scope',
    fetchImpl: gh.impl,
    ...(pathScope ? { pathScope } : {}),
  }));
}

/**
 * Same repository, but the fake also serves file CONTENT — so the analyzer
 * actually fetches the files it selected and `filesRead` is populated.
 */
async function analyseWithFiles(pathScope?: string[]): Promise<RepoAnalysisSuccess> {
  // A README inside the scope and a package.json at the root: the scoped run
  // must read the first and never the second.
  const withManifest = [...MONOREPO, 'package.json', 'backend/src/services/agents/corybrain/README.md'];
  const gh = makeGitHubFake({
    tree: json(treePayload(withManifest.map((path) => ({ path, type: 'blob', size: 100 })))),
    languages: json({ TypeScript: 90000 }),
    file: () => fileReply('{"name":"x","dependencies":{}}'),
  });
  return ok(await analyzeRepository({
    owner: 'acme', repo: 'monorepo', correlationId: 'cid-scope-files',
    fetchImpl: gh.impl,
    ...(pathScope ? { pathScope } : {}),
  }));
}

describe('a path scope changes what the analyzer derives', () => {
  const SCOPE = ['backend/src/services/agents/corybrain'];

  it('counts only the files inside the scope', async () => {
    const whole = await analyse();
    const scoped = await analyse(SCOPE);
    expect(whole.facts.fileCount).toBe(MONOREPO.length);
    expect(scoped.facts.fileCount).toBe(4);
  });

  it('counts only the tests inside the scope', async () => {
    const whole = await analyse();
    const scoped = await analyse(SCOPE);
    // The monorepo's own test files must not be credited to a feature that
    // happens to live inside it — the failure that made a case study report
    // 1,247 test files for a change that shipped 945.
    expect(scoped.facts.derived.testFileCount).toBeLessThan(whole.facts.derived.testFileCount);
    expect(scoped.facts.derived.testFileCount).toBe(2);
  });

  it('drops the whole-repository language list when a scope is set', async () => {
    const whole = await analyse();
    const scoped = await analyse(SCOPE);
    // Unscoped, the languages API contributes Python and Ruby. Scoped, it must
    // not: blending a repository-wide answer into a scoped one is how a
    // TypeScript feature ends up listing Flask and PowerShell in its stack.
    expect(whole.facts.derived.languages).toEqual(expect.arrayContaining(['Python']));
    expect(scoped.facts.derived.languages).not.toEqual(expect.arrayContaining(['Python']));
    expect(scoped.facts.derived.languages).not.toEqual(expect.arrayContaining(['Ruby']));
  });

  it('leaves an unscoped analysis exactly as it was', async () => {
    // The feature must be invisible to every existing Case Study. If this
    // drifts, adding a scope silently rewrote records that never asked for one.
    const a = await analyse();
    const b = await analyse([]);
    expect(b.facts.fileCount).toBe(a.facts.fileCount);
    expect(b.facts.derived.languages).toEqual(a.facts.derived.languages);
    expect(b.facts.derived.testFileCount).toBe(a.facts.derived.testFileCount);
  });

  it('READS only files inside the scope, not merely counts them', async () => {
    // The hole this closes. Path-derived facts were scoped while file SELECTION
    // still ran over the whole tree, so a scoped case study would have fetched
    // the monorepo's root package.json and README and derived its frameworks,
    // dependencies and documents from them. A mutation reverting the selection
    // passed every other assertion here, because they all read path-derived
    // facts. This one reads what was actually fetched.
    const scoped = await analyseWithFiles(SCOPE);
    // Scoped, this reads NOTHING — and that is correct, not a gap. The
    // high-value selector looks for manifests and top-level documents, and a
    // source directory has none. The consequence is worth stating plainly: a
    // scope containing no manifest yields no dependency facts, because the
    // repository root's package.json is not the feature's fact.
    for (const path of scoped.facts.filesRead) {
      expect(path.toLowerCase().startsWith('backend/src/services/agents/corybrain/')).toBe(true);
    }
    // Non-vacuity: unscoped, the very files excluded above ARE read.
    const whole = await analyseWithFiles();
    expect(whole.facts.filesRead).toEqual(expect.arrayContaining(['package.json']));
  });

  it('reports a scope that matched nothing rather than an empty repository', async () => {
    const scoped = await analyse(['backend/src/services/agents/nosuchthing']);
    expect(scoped.facts.fileCount).toBe(0);
    // A typo and a genuinely empty feature look identical in the facts. The
    // issue is the only thing that tells them apart.
    const messages = scoped.issues.map((i) => i.message).join(' ');
    expect(messages).toContain('path scope matched 0 of 12 paths');
  });
});
