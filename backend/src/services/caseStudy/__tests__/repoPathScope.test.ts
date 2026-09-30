import { isPathInScope, scopeTree } from '../repoPathScope';
import type { TreeRead } from '../caseStudyRepoReader';

/**
 * Scoping a repository to the part of it a Case Study is about.
 *
 * WHY IT EXISTS. The Case Study OS modelled one repository as one project, and
 * every disappointing figure it produced traced to that: a delivery span that
 * was really a monorepo's age, a test count that was really the platform's, a
 * stack listing Flask and PowerShell for a TypeScript feature. A scope makes one
 * repository able to yield many honest case studies.
 */

const tree = (paths: string[]): TreeRead => ({
  paths,
  sizes: new Map(paths.map((p, i) => [p, (i + 1) * 10])),
  truncated: false,
  source: 'github',
});

const REPO = [
  'backend/src/services/agents/corybrain/resolver.ts',
  'backend/src/services/agents/corybrain/rules.ts',
  'backend/src/services/agents/corybrain/__tests__/rules.test.ts',
  'backend/src/services/agents/openclaw/poster.ts',
  'backend/src/services/apiary/bees.ts',
  'frontend/src/pages/Home.tsx',
  'README.md',
];

describe('isPathInScope', () => {
  it('treats an empty scope as the whole repository', () => {
    // The default must stay "everything", or adding this feature would silently
    // narrow every existing Case Study to nothing.
    expect(isPathInScope('anything/at/all.ts', [])).toBe(true);
  });

  it('matches the directory named and everything beneath it', () => {
    const scope = ['backend/src/services/agents/corybrain'];
    expect(isPathInScope('backend/src/services/agents/corybrain/resolver.ts', scope)).toBe(true);
    expect(isPathInScope('backend/src/services/agents/corybrain', scope)).toBe(true);
  });

  it('matches at a SEGMENT boundary, not on a bare prefix', () => {
    // `backend/src/api` must not scope in `backend/src/apiary/...`. A bare
    // startsWith would include it, and that is the classic way a path filter
    // quietly over-collects — the figure looks fine and covers the wrong code.
    expect(isPathInScope('backend/src/apiary/bees.ts', ['backend/src/api'])).toBe(false);
    expect(isPathInScope('backend/src/api/routes.ts', ['backend/src/api'])).toBe(true);
  });

  it('ignores leading and trailing slashes and case', () => {
    for (const written of ['/backend/src/', 'backend/src', 'BACKEND/SRC/']) {
      expect(isPathInScope('backend/src/thing.ts', [written])).toBe(true);
    }
  });

  it('accepts a path matching any one of several prefixes', () => {
    const scope = ['backend/src/services/agents/corybrain', 'frontend/src/pages'];
    expect(isPathInScope('frontend/src/pages/Home.tsx', scope)).toBe(true);
    expect(isPathInScope('README.md', scope)).toBe(false);
  });
});

describe('scopeTree', () => {
  it('returns the tree untouched when no scope is set', () => {
    const t = tree(REPO);
    const scoped = scopeTree(t, []);
    expect(scoped.tree).toBe(t);
    expect(scoped.scopedPaths).toBe(REPO.length);
    expect(scoped.totalPaths).toBe(REPO.length);
  });

  it('narrows the tree to the scope, and keeps the sizes for what survives', () => {
    const scoped = scopeTree(tree(REPO), ['backend/src/services/agents/corybrain']);
    expect(scoped.tree.paths).toEqual([
      'backend/src/services/agents/corybrain/resolver.ts',
      'backend/src/services/agents/corybrain/rules.ts',
      'backend/src/services/agents/corybrain/__tests__/rules.test.ts',
    ]);
    // Sizes drive high-value file selection downstream; dropping them would make
    // a scoped analysis read different files than an unscoped one for no reason.
    expect(scoped.tree.sizes.size).toBe(3);
    expect(scoped.tree.sizes.get('backend/src/services/agents/corybrain/rules.ts')).toBe(20);
  });

  it('reports both counts, so a scope that matched nothing is visible', () => {
    // Once the tree is filtered, a typo and an empty feature look identical from
    // the facts alone. The pair of counts is the only thing that distinguishes
    // them.
    const scoped = scopeTree(tree(REPO), ['backend/src/services/agents/nosuchthing']);
    expect(scoped.scopedPaths).toBe(0);
    expect(scoped.totalPaths).toBe(REPO.length);
  });

  it('reports a scope that matched everything, which is not a scope', () => {
    const scoped = scopeTree(tree(REPO), ['']);
    // An empty-string prefix normalises away, leaving no scope at all rather
    // than a scope that happens to match all.
    expect(scoped.scope).toEqual([]);
    expect(scoped.scopedPaths).toBe(REPO.length);
  });

  it('preserves truncation and source, which describe the READ not the filter', () => {
    const t: TreeRead = { ...tree(REPO), truncated: true, source: 'persisted' };
    const scoped = scopeTree(t, ['backend']);
    // A truncated read stays truncated: narrowing what we look at does not make
    // the underlying read complete.
    expect(scoped.tree.truncated).toBe(true);
    expect(scoped.tree.source).toBe('persisted');
  });

  it('normalises the scope it reports back', () => {
    const scoped = scopeTree(tree(REPO), ['/Backend/SRC/', 'frontend/src/pages']);
    expect(scoped.scope).toEqual(['backend/src', 'frontend/src/pages']);
  });
});
