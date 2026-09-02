import type { TreeRead } from './caseStudyRepoReader';

/**
 * Scoping a repository to the part of it a Case Study is actually about.
 *
 * WHY THIS EXISTS. The Case Study OS modelled one repository as one project. In
 * a monorepo where fifty features live, a case study about ONE of them inherited
 * the whole repository's stack, the whole repository's capabilities and the
 * whole repository's creation date. Every disappointing figure this produced
 * traced to that single assumption: a delivery span that was really the
 * monorepo's age, a test count that was really the platform's, a deployment
 * count that was really an unset field on the parent repo.
 *
 * A scope is a list of path prefixes. Everything a Case Study derives from the
 * repository — languages, frameworks, test files, CI, documents, file count —
 * is then computed over that subset and nothing else.
 *
 * PREFIXES, NOT GLOBS, DELIBERATELY. A glob engine would be a second language
 * inside a field an operator types by hand, with its own escaping rules and its
 * own silent misses; `backend/src/services/agents/corybrain` is unambiguous and
 * a person can check it by eye. If a scope ever needs `**` the answer is
 * probably that it should be two prefixes.
 */

/** Normalised for comparison: no leading slash, no trailing slash, lower case. */
function normalise(prefix: string): string {
  return prefix.trim().replace(/^\/+/, '').replace(/\/+$/, '').toLowerCase();
}

/**
 * Is this path inside the scope?
 *
 * A prefix matches the directory it names and everything beneath it, and it must
 * match at a SEGMENT boundary: `backend/src/api` does not scope in
 * `backend/src/apiary/thing.ts`, which a bare `startsWith` would wrongly include
 * and which is the classic way a path filter quietly over-collects.
 */
export function isPathInScope(path: string, scope: readonly string[]): boolean {
  if (scope.length === 0) return true;
  const p = path.replace(/^\/+/, '').toLowerCase();
  return scope.some((raw) => {
    const prefix = normalise(raw);
    if (prefix === '') return true;
    return p === prefix || p.startsWith(`${prefix}/`);
  });
}

export interface ScopedTree {
  readonly tree: TreeRead;
  /** Paths the repository holds in total, before scoping. */
  readonly totalPaths: number;
  /** Paths inside the scope. Equals `totalPaths` when no scope is set. */
  readonly scopedPaths: number;
  readonly scope: readonly string[];
}

/**
 * Narrow a tree read to the scope.
 *
 * Returns the counts on both sides, because a scope that matches nothing is a
 * typo and a scope that matches everything is not a scope — and neither is
 * visible from the facts alone once the tree has been filtered.
 */
export function scopeTree(tree: TreeRead, scope: readonly string[]): ScopedTree {
  const cleaned = scope.map(normalise).filter((s) => s.length > 0);
  if (cleaned.length === 0) {
    return { tree, totalPaths: tree.paths.length, scopedPaths: tree.paths.length, scope: [] };
  }

  const paths = tree.paths.filter((p) => isPathInScope(p, cleaned));
  const sizes = new Map<string, number>();
  for (const p of paths) {
    const size = tree.sizes.get(p);
    if (typeof size === 'number') sizes.set(p, size);
  }

  return {
    tree: { paths, sizes, truncated: tree.truncated, source: tree.source },
    totalPaths: tree.paths.length,
    scopedPaths: paths.length,
    scope: cleaned,
  };
}
