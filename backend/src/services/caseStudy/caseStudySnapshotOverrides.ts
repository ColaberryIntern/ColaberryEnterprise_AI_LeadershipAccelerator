/**
 * caseStudySnapshotOverrides — apply a human's edits on top of generated
 * content, and record who made them.
 *
 * THIS IS THE MODULE THAT MAKES REVIEW WORTH DOING. A reviewer who corrects a
 * metric label, then watches the next repo sync silently overwrite it, stops
 * reviewing. So the build order is generate → THEN override, and the merge rule
 * is not a judgement call: `human_override` is index 0 of
 * `CASE_STUDY_PROVENANCE_PRECEDENCE` (spec §9), which makes it stronger than
 * every generated tier by construction rather than by convention.
 *
 * PURE. No clock — an override carries the instant the HUMAN made it, so
 * rebuilding the same snapshot a year later reproduces the same provenance.
 *
 * PATHS ARE UNTRUSTED INPUT. They arrive from the admin UI, so the parser
 * accepts only `identifier` and `[digits]` segments, refuses `__proto__`,
 * `constructor` and `prototype` outright, and never CREATES a missing parent —
 * an override whose parent section is absent is reported as ignored rather than
 * quietly conjuring a section nobody generated.
 */
import type { CaseStudySnapshotContent } from '../../types/caseStudy';
import type {
  CaseStudyProvenanceEntry, CaseStudyProvenancePath,
} from '../../types/caseStudyProvenance';
import type { CaseStudySnapshotOverride } from './caseStudySnapshotInput';

/** One step of a dotted path: an object key or an array index. */
export type SnapshotPathSegment =
  | { readonly kind: 'key'; readonly key: string }
  | { readonly kind: 'index'; readonly index: number };

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
/** Never navigable. A path is user input and these three keys reach Object.prototype. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * `heroMetrics[0].valueDisplay` ⇒ segments, or `null` if the path is not one we
 * are willing to walk. Returning null rather than throwing keeps one bad path
 * from failing an entire rebuild.
 */
export function parseProvenancePath(path: string): readonly SnapshotPathSegment[] | null {
  if (typeof path !== 'string' || path.length === 0 || path.endsWith('.')) return null;
  const segments: SnapshotPathSegment[] = [];
  let i = 0;
  let expectKey = true;

  while (i < path.length) {
    const ch = path[i];
    if (ch === '.') {
      if (segments.length === 0 || expectKey) return null;
      i += 1;
      expectKey = true;
      continue;
    }
    if (ch === '[') {
      const close = path.indexOf(']', i);
      if (close === -1 || expectKey) return null;
      const digits = path.slice(i + 1, close);
      if (!/^\d+$/.test(digits)) return null;
      segments.push({ kind: 'index', index: Number(digits) });
      i = close + 1;
      continue;
    }
    if (!expectKey) return null;
    let j = i;
    while (j < path.length && path[j] !== '.' && path[j] !== '[') j += 1;
    const key = path.slice(i, j);
    if (!IDENTIFIER.test(key) || FORBIDDEN_KEYS.has(key)) return null;
    segments.push({ kind: 'key', key });
    i = j;
    expectKey = false;
  }
  return expectKey ? null : segments;
}

/**
 * Write `value` at `segments`. Returns false — and changes nothing — when the
 * parent does not exist, when an array index is out of range (writing past the
 * end would punch `null` holes into the content), or when the target's container
 * is the wrong kind.
 */
function setAtPath(root: unknown, segments: readonly SnapshotPathSegment[], value: unknown): boolean {
  let cursor: any = root;
  for (let i = 0; i < segments.length - 1; i += 1) {
    const seg = segments[i];
    const next = seg.kind === 'key' ? cursor?.[seg.key] : cursor?.[seg.index];
    if (next === null || typeof next !== 'object') return false;
    cursor = next;
  }
  const last = segments[segments.length - 1];
  if (last.kind === 'index') {
    if (!Array.isArray(cursor) || last.index >= cursor.length) return false;
    cursor[last.index] = value;
    return true;
  }
  if (cursor === null || typeof cursor !== 'object' || Array.isArray(cursor)) return false;
  cursor[last.key] = value;
  return true;
}

/**
 * Clone through JSON deliberately: it normalises the draft to EXACTLY the value
 * that will be hashed, so an override can never land on a field that
 * serialization would have dropped anyway.
 */
function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export interface OverrideApplication {
  readonly content: CaseStudySnapshotContent;
  readonly entries: Readonly<Record<CaseStudyProvenancePath, CaseStudyProvenanceEntry>>;
  readonly applied: readonly CaseStudyProvenancePath[];
  readonly ignored: readonly CaseStudyProvenancePath[];
}

/**
 * Apply every override, oldest first, so that when two humans edited the same
 * path the LATER edit is the one that survives. Ordering is total (recordedAt,
 * then path, then actor) so the outcome cannot depend on array order — which
 * matters, because the outcome is hashed.
 */
export function applyOverrides(
  content: CaseStudySnapshotContent,
  overrides: readonly CaseStudySnapshotOverride[],
): OverrideApplication {
  if (overrides.length === 0) {
    return { content, entries: {}, applied: [], ignored: [] };
  }

  const draft = jsonClone(content) as CaseStudySnapshotContent;
  const entries: Record<CaseStudyProvenancePath, CaseStudyProvenanceEntry> = {};
  const applied: CaseStudyProvenancePath[] = [];
  const ignored: CaseStudyProvenancePath[] = [];

  const ordered = [...overrides].sort((a, b) => (
    a.recordedAt.localeCompare(b.recordedAt)
    || a.path.localeCompare(b.path)
    || a.actor.localeCompare(b.actor)
  ));

  for (const override of ordered) {
    const segments = parseProvenancePath(override.path);
    if (!segments || !setAtPath(draft, segments, override.value)) {
      if (!ignored.includes(override.path)) ignored.push(override.path);
      continue;
    }
    entries[override.path] = {
      tier: 'human_override',
      origin: { kind: 'human', actor: override.actor, note: override.note },
      recordedAt: override.recordedAt,
    };
    if (!applied.includes(override.path)) applied.push(override.path);
  }

  return {
    content: draft,
    entries,
    applied: [...applied].sort(),
    // A path can fail and then succeed — `situation.narrative` before
    // `situation` exists, then `situation` itself. If it ever landed, it is not
    // ignored, so the two lists stay disjoint and the report stays honest.
    ignored: ignored.filter((p) => !applied.includes(p)).sort(),
  };
}
