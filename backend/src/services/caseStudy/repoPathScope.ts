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
 * The bound on how many prefixes one scope may carry.
 *
 * RAISED FROM 20 TO 40 ON 2026-09-02, deliberately and not to make anything pass.
 * The first real scope this feature was built for - the learning system behind the
 * "From AI Lessons to Verifiable AI Capability" case study - needs THIRTY file
 * paths, and it needs them at file granularity for an honest reason: the five
 * `services/cape/cape*` evidence files sit in a directory holding twenty more
 * services about placement, diagnostics and governance that the story is NOT
 * about. Prefixes match at segment boundaries, so there is no way to name those
 * five without also claiming the other twenty.
 *
 * So 20 was a guess ("far past any honest feature") that its own first real use
 * case disproved. The bound still exists, because an unbounded array on a write
 * path is a payload rather than a setting - 40 is still small enough that the
 * stored value cannot become one, and still small enough that a person can read
 * the list and check it.
 */
export const MAX_SCOPE_PREFIXES = 40;

/**
 * The canonical form of a scope, as it is STORED.
 *
 * Normalising on write rather than on read is deliberate: the value an admin
 * typed (`/Backend/SRC/`) and the value another admin typed (`backend/src`) are
 * the same scope, and if both are stored verbatim then two Case Studies that
 * scope identically produce different rows, different logs and different
 * snapshot bytes. Empty prefixes are dropped rather than kept, because an empty
 * prefix matches everything and a scope that matches everything is not a scope —
 * storing it would let a typo silently widen a Case Study back to the whole
 * monorepo while still LOOKING scoped in the admin UI.
 */
export function normaliseScope(scope: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of scope) {
    const prefix = normalise(raw);
    if (prefix === '' || seen.has(prefix)) continue;
    seen.add(prefix);
    out.push(prefix);
  }
  return out;
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
  const cleaned = normaliseScope(scope);
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
