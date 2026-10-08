/**
 * What changed between two blueprint revisions.
 *
 * THE KEYSPACE IS DERIVED FROM A RUNTIME OBJECT, and that is the whole point of this file's
 * shape. `refs_json` is declared `unknown` (`OperatingBlueprintManifest.ts:43`) and `ManifestRefs`
 * is an interface — erased at runtime — so "the manifest type's runtime shape" has no referent.
 * `emptyRefs(origin, projectId)` returns an object with every collection present by its own
 * documented contract ("Every array present, so shape is stable"), so walking its keys is the
 * only derivation that exists.
 *
 * A hand-written collection list would be a second vocabulary: add a collection to `ManifestRefs`
 * and the diff would silently stop reporting changes in it. Nobody could see that failure — the
 * compare screen would just look quiet.
 *
 * THE WALK GOES ONE LEVEL DEEP, which is load-bearing rather than decorative.
 * `INTEGRITY_CHECKED_LISTS` covers only the ARRAY-VALUED TOP-LEVEL keys, by its own comment, so a
 * diff built on it would ignore `agents.runtime`, `agents.builder` and both `trackMappings` lists.
 * Moving a process from a runtime agent to a builder agent is exactly the kind of change a
 * reviewer must be shown, and it lives entirely in those nested lists.
 */
import {
  emptyRefs,
  INTEGRITY_CHECKED_LISTS,
  type ManifestRefs,
  type PinnedRef,
  type RefOrigin,
} from './adapters/manifestRefs';

/**
 * How elements of a collection are identified.
 *
 * `pinned` elements are records with their own id and a revision, so the same id appearing on
 * both sides at different revisions is an EDIT. `tuple` elements (the track mappings) are value
 * pairs with no id and no revision, so their identity IS their value and an edit is
 * indistinguishable from a remove plus an add. Calling one rule by the other's name would either
 * report every unchanged mapping as revised or hide a real requirement re-pointing.
 */
export type ElementIdentity = 'pinned' | 'tuple' | 'indeterminate';

/** One collection's worth of change: ids, not counts, because a count is not actionable. */
export interface CollectionDiff {
  /** Dotted path into the ref object, e.g. `sources` or `agents.runtime`. */
  collection: string;
  identity: ElementIdentity;
  added: string[];
  removed: string[];
  /** Same identity, different pinned revision. Always empty for `tuple` collections. */
  revised: string[];
}

export interface RevisionDiff {
  collections: CollectionDiff[];
  /** True when any collection reports any change. */
  changed: boolean;
  /**
   * Collections the vocabulary declares that this diff could NOT read on one side or the other —
   * absent, not an array, or holding a mix of element kinds. NOT the same as "unchanged": a
   * reviewer must never read silence as agreement.
   */
  unreadable: string[];
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Every collection to diff, as dotted paths, derived by walking a fresh ref object.
 *
 * Both levels are walked because a nested object in this vocabulary exists precisely to keep two
 * populations apart (`agents.runtime` vs `agents.builder`), and that distinction is the thing a
 * reviewer is reading the diff for.
 */
export function diffableCollections(origin: RefOrigin = 'sbp'): string[] {
  const shape = emptyRefs(origin, 'keyspace-probe') as unknown as Record<string, unknown>;
  const paths: string[] = [];
  for (const [key, value] of Object.entries(shape)) {
    if (Array.isArray(value)) { paths.push(key); continue; }
    if (!isPlainObject(value)) continue;
    for (const [inner, innerValue] of Object.entries(value)) {
      if (Array.isArray(innerValue)) paths.push(`${key}.${inner}`);
    }
  }
  return paths;
}

/**
 * Collections this diff covers that the integrity check does not.
 *
 * Not a tautology: `INTEGRITY_CHECKED_LISTS` is documented as equal to the array-valued TOP-LEVEL
 * keys, so this returns the nested collections — the ones a top-level-only diff would drop. A
 * test enumerates the result rather than counting it, so adding a nested collection to the
 * vocabulary shows up as a changed list instead of a changed number.
 */
export function uncoveredCollections(origin: RefOrigin = 'sbp'): string[] {
  const covered = new Set<string>(INTEGRITY_CHECKED_LISTS);
  return diffableCollections(origin).filter((p) => !covered.has(p));
}

/** Read a dotted path. `undefined` means the manifest did not record it at all. */
function readPath(root: Record<string, unknown>, path: string): unknown {
  const [head, tail] = path.split('.');
  const top = root[head];
  if (tail === undefined) return top;
  return isPlainObject(top) ? top[tail] : undefined;
}

const hasStringId = (v: unknown): v is PinnedRef =>
  isPlainObject(v) && typeof v.id === 'string' && v.id.length > 0;

/**
 * Classify a list's elements.
 *
 * A MIXED list is `indeterminate`, not "mostly pinned". Picking the majority rule would silently
 * drop the minority elements from the diff, and a manifest with one malformed ref would compare
 * as if that ref did not exist.
 */
function classify(list: unknown[]): ElementIdentity {
  if (list.length === 0) return 'tuple';
  const pinned = list.filter(hasStringId).length;
  if (pinned === list.length) return 'pinned';
  if (pinned === 0) return list.every(isPlainObject) ? 'tuple' : 'indeterminate';
  return 'indeterminate';
}

/** A tuple element's identity IS its value: its keys in a stable order. */
function tupleKey(v: unknown): string {
  if (!isPlainObject(v)) return JSON.stringify(v);
  return JSON.stringify(Object.keys(v).sort().map((k) => [k, v[k]]));
}

const revisionOf = (v: unknown): string =>
  String((isPlainObject(v) ? v.revision : undefined) ?? null);

/**
 * Diff one collection. Returns `null` when the collection cannot be compared.
 *
 * An absent side is unreadable rather than empty. A manifest that omits `agents` is not a project
 * with no agents — it is a manifest nobody can compare, and reporting it as "no agent changes"
 * would put a reviewer's name on an approval of something they were never shown.
 */
function diffCollection(
  collection: string,
  before: unknown,
  after: unknown,
): CollectionDiff | null {
  if (!Array.isArray(before) || !Array.isArray(after)) return null;

  const identity = classify([...before, ...after]);
  if (identity === 'indeterminate') return null;

  const keyOf = identity === 'pinned' ? (v: unknown) => (v as PinnedRef).id : tupleKey;
  const a = new Map(before.map((v) => [keyOf(v), v]));
  const b = new Map(after.map((v) => [keyOf(v), v]));

  return {
    collection,
    identity,
    added: [...b.keys()].filter((k) => !a.has(k)),
    removed: [...a.keys()].filter((k) => !b.has(k)),
    // Only `pinned` elements carry a revision. For tuples an edit already shows as a
    // remove plus an add, and inventing a `revised` entry would double-report it.
    revised: identity === 'pinned'
      ? [...b.keys()].filter((k) => a.has(k) && revisionOf(a.get(k)) !== revisionOf(b.get(k)))
      : [],
  };
}

/**
 * Compare two revisions' refs.
 *
 * Both sides are `unknown` because that is what `refs_json` is declared as. Nothing here trusts
 * the declared type: a row written before a collection existed, or hand-edited, reaches this
 * function with exactly the same static type as a well-formed one.
 */
export function diffRevisions(
  before: unknown,
  after: unknown,
  origin: RefOrigin = 'sbp',
): RevisionDiff {
  const b = isPlainObject(before) ? before : {};
  const a = isPlainObject(after) ? after : {};

  const collections: CollectionDiff[] = [];
  const unreadable: string[] = [];

  for (const path of diffableCollections(origin)) {
    const d = diffCollection(path, readPath(b, path), readPath(a, path));
    if (d === null) { unreadable.push(path); continue; }
    collections.push(d);
  }

  return {
    collections,
    changed: collections.some(
      (c) => c.added.length > 0 || c.removed.length > 0 || c.revised.length > 0,
    ),
    unreadable,
  };
}

/**
 * Whether two revisions differ materially.
 *
 * UNREADABLE COUNTS AS MATERIAL. "I could not compare it" is not "nothing changed", and this is
 * the predicate a caller would use to decide whether re-approval is needed — the one place where
 * treating an unreadable manifest as unchanged would wave a change past a reviewer.
 */
export function hasMaterialChange(
  before: unknown,
  after: unknown,
  origin: RefOrigin = 'sbp',
): boolean {
  const d = diffRevisions(before, after, origin);
  return d.changed || d.unreadable.length > 0;
}

export type { ManifestRefs };
