/**
 * Linked views: selecting a record reveals its connected records in the same project.
 *
 * ── WHAT THE MANIFEST ACTUALLY CARRIES, MEASURED ─────────────────────────────
 * The plan says this traversal "uses the references the manifest writer populates in
 * `refs_json`". It does — but `refs_json` holds far fewer EDGES than that sentence implies, and
 * building a traversal on the assumption would have produced a view that silently showed nothing:
 *
 *   - `FactoryTaskLike` and `FactoryProcessLike` are `{ id: string }`. There is NO process→task
 *     edge in the manifest to traverse. Same for surfaces, policies and design decisions.
 *   - `SbpStoryLike.release_id` exists on the ADAPTER INPUT and is dropped: `sbpToManifestRefs`
 *     flattens releases and stories into one `downstream` list, so the story→release edge does
 *     not survive into the manifest. Recorded as a carried-forward obligation rather than
 *     worked around here, because adding it changes T1's manifest contract and its content hash.
 *
 * So exactly THREE joins are real, and this module implements those three and nothing else. A
 * fourth would have to be invented, and an invented edge on a review screen is worse than a
 * blank one: a reviewer would act on it.
 *
 * ── CO-MEMBERSHIP IS NOT A CONNECTION ────────────────────────────────────────
 * Two refs sitting in the same collection are not connected; they are merely the same kind.
 * Presenting a collection listing as "connected records" is the empty shell this task's negative
 * control exists to forbid — it looks like an answer and contains no information.
 *
 * ── THREE DIFFERENT KINDS OF NOTHING ─────────────────────────────────────────
 * "No connected records" has three causes here, and they lead to different actions, so they are
 * three different answers rather than one empty list. This is the same distinction
 * `ProjectLifecycleHeader` draws between `unmet` and `not_assessed`:
 *
 *   1. The entity is not in this manifest at all.
 *   2. The manifest schema records no edge of that kind — a STRUCTURAL gap. Nothing anyone
 *      enters into the product will ever populate it.
 *   3. The collection is empty because no adapter writes it yet — a MEASUREMENT gap. `surfaces`,
 *      `policies` and `designDecisions` are in this state today, which a test pins by running
 *      both real adapters and recording which collections come back populated.
 */
import { diffableCollections } from './blueprintRevisionDiff';

/**
 * The six view kinds, taken from the spec's own sentence rather than from this module.
 *
 * Quoted here so the assertion runs in both directions: a kind the spec names going missing is
 * as much a regression as a seventh kind appearing, and deriving the list from the registry under
 * test would only ever catch the second.
 */
export const SPEC_NAMED_VIEW_KINDS = [
  'requirements', 'workflow', 'allocation', 'workspaces', 'controls', 'design',
] as const;

export type ViewKind = (typeof SPEC_NAMED_VIEW_KINDS)[number];

/**
 * Which ref collections each view shows.
 *
 * A view can draw on more than one collection: `workflow` is processes AND the business tasks
 * inside them, and `allocation` is the assignments plus both agent populations — which stay in
 * separate collections because conflating a runtime agent with a builder agent is the error
 * `AgentRefs` was shaped to prevent.
 */
export const VIEW_KINDS: Readonly<Record<ViewKind, readonly string[]>> = {
  requirements: ['sources'],
  workflow: ['processes', 'businessTasks'],
  allocation: ['assignments', 'agents.runtime', 'agents.builder'],
  workspaces: ['surfaces'],
  controls: ['policies'],
  design: ['designDecisions'],
};

/**
 * Collections deliberately NOT shown as a view, each with the reason.
 *
 * Present so the coverage assertion can run both ways: every collection in the ref vocabulary is
 * either bound to a view or listed here. A collection added to `ManifestRefs` and bound to
 * neither is a record no screen in the product can show, and nothing else would catch it.
 */
export const COLLECTIONS_NOT_SHOWN: Readonly<Record<string, string>> = {
  downstream: 'Releases and stories are implementation work, not a business view. They are the '
    + 'TARGET of a requirement connection, reached through trackMappings, not a view of their own.',
  'trackMappings.proposalSections': 'An edge carrier, not a collection of records.',
  'trackMappings.solutionStories': 'An edge carrier, not a collection of records.',
};

/** The join rules that exist. Three, because three edges exist. */
export type JoinRule = 'track_proposal_section' | 'track_solution_story' | 'assignment_role';

export interface ConnectedGroup {
  /** What the connected records ARE. Not a ViewKind: a proposal section is not one of the six. */
  target: 'proposal_sections' | 'downstream_stories' | 'delivery_role';
  via: JoinRule;
  ids: string[];
}

export type UnlinkedReason =
  | { kind: 'entity_not_in_manifest'; detail: string }
  | { kind: 'no_edge_recorded'; detail: string };

export interface LinkedRecords {
  entity: { id: string; viewKind: ViewKind; collection: string } | null;
  groups: ConnectedGroup[];
  /** Why there is nothing, when there is nothing. Never a bare empty list. */
  unlinked: UnlinkedReason | null;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/** Read a dotted path out of a refs object. */
function readPath(root: unknown, path: string): unknown[] {
  if (!isPlainObject(root)) return [];
  const [head, tail] = path.split('.');
  const top = root[head];
  const value = tail === undefined ? top : (isPlainObject(top) ? top[tail] : undefined);
  return Array.isArray(value) ? value : [];
}

/** Which view shows a given collection, or null when none does. */
export function viewKindFor(collection: string): ViewKind | null {
  for (const kind of SPEC_NAMED_VIEW_KINDS) {
    if (VIEW_KINDS[kind].includes(collection)) return kind;
  }
  return null;
}

/**
 * Collections in the ref vocabulary bound to neither a view nor the exclusion list.
 *
 * The keyspace comes from `diffableCollections()` — the same derived walk of `emptyRefs` the
 * revision diff uses — so the views and the diff cannot disagree about what collections exist.
 * A second hand-kept list here would be the drift this phase has already corrected three times.
 */
export function unboundCollections(): string[] {
  return diffableCollections().filter(
    (c) => viewKindFor(c) === null
      && !Object.prototype.hasOwnProperty.call(COLLECTIONS_NOT_SHOWN, c),
  );
}

/** Locate an id in the manifest, with the collection that held it. */
function locate(refs: unknown, entityId: string): { collection: string; viewKind: ViewKind } | null {
  for (const collection of diffableCollections()) {
    const hit = readPath(refs, collection).some(
      (r) => isPlainObject(r) && r.id === entityId,
    );
    if (!hit) continue;
    const viewKind = viewKindFor(collection);
    // A hit in an excluded collection is a real record with no view; reported as not-in-manifest
    // for view purposes rather than silently labelled with a view it has no place in.
    if (viewKind !== null) return { collection, viewKind };
  }
  return null;
}

/** The role prefix of a composite assignment id, if it names a role the registry knows. */
export function roleOfAssignmentId(
  assignmentId: string,
  isKnownRole: (role: string) => boolean,
): string | null {
  // `factoryAdapter` mints these as `${role_id}:${responsibility ?? 'UNSPECIFIED'}`. The
  // responsibility is free text and may contain colons, so only the FIRST segment is a candidate
  // — and it is confirmed against the role registry rather than trusted. An unvalidated split
  // would turn any id containing a colon into a fabricated role link.
  const colon = assignmentId.indexOf(':');
  // `< 0`, not `<= 0`. A LEADING colon is refused by the validation below, not here: it yields an
  // empty candidate and `isKnownRole('')` is false. The stricter bound survived a mutation
  // because no input could distinguish the two, so it is gone rather than left standing as a
  // guard nothing can show doing any work. This test only keeps `indexOf` from returning -1 and
  // turning the slice into a confusing "all but the last character".
  if (colon < 0) return null;
  const candidate = assignmentId.slice(0, colon);
  return isKnownRole(candidate) ? candidate : null;
}

/**
 * An id, or null when the value is not one.
 *
 * `String()` was here instead, and it fabricated edges: `String(undefined)` is the string
 * 'undefined', so a mapping missing its target and a ref missing its id both became the same
 * non-empty string and MATCHED. The traversal then reported a connection between two records
 * that do not exist. Every id crossing this boundary goes through here, because `refs_json` is
 * declared `unknown` and nothing upstream guarantees a string.
 */
const asId = (v: unknown): string | null =>
  (typeof v === 'string' && v.length > 0 ? v : null);

const idsOf = (rows: unknown[]): string[] =>
  rows.filter(isPlainObject)
    .map((r) => asId(r.id))
    .filter((id): id is string => id !== null);

/**
 * The records connected to one entity.
 *
 * `isKnownRole` is injected rather than imported so this stays pure and so the role registry is
 * one definition — `deliveryRoles.isKnownDeliveryRole` — passed in by the caller.
 */
export function connectedRecords(
  refs: unknown,
  entityId: string,
  isKnownRole: (role: string) => boolean,
): LinkedRecords {
  const at = locate(refs, entityId);
  if (at === null) {
    return {
      entity: null,
      groups: [],
      unlinked: {
        kind: 'entity_not_in_manifest',
        detail: `No record with id ${entityId} appears in any collection this blueprint shows.`,
      },
    };
  }

  const groups: ConnectedGroup[] = [];

  if (at.viewKind === 'requirements') {
    const sections = readPath(refs, 'trackMappings.proposalSections')
      .filter(isPlainObject)
      .filter((m) => m.canonicalReqId === entityId)
      // A mapping with no `sectionRef` is dropped, not reported as a section called 'undefined'.
      // This join has nothing to check its targets against, so the guard is the only thing
      // between a malformed mapping and a fabricated edge on a reviewer's screen.
      .map((m) => asId(m.sectionRef))
      .filter((ref): ref is string => ref !== null);
    if (sections.length > 0) {
      groups.push({ target: 'proposal_sections', via: 'track_proposal_section', ids: sections });
    }

    // The story ids a requirement maps to, kept only where the manifest also carries the story
    // as a downstream ref. A mapping pointing at a story this blueprint does not contain is a
    // dangling edge, and showing it would send a reviewer looking for a record that is not there.
    const mapped = readPath(refs, 'trackMappings.solutionStories')
      .filter(isPlainObject)
      .filter((m) => m.canonicalReqId === entityId)
      .map((m) => asId(m.storyId))
      .filter((id): id is string => id !== null);
    const present = new Set(idsOf(readPath(refs, 'downstream')));
    const stories = mapped.filter((id) => present.has(id));
    if (stories.length > 0) {
      groups.push({ target: 'downstream_stories', via: 'track_solution_story', ids: stories });
    }
  }

  if (at.collection === 'assignments') {
    const role = roleOfAssignmentId(entityId, isKnownRole);
    if (role !== null) {
      groups.push({ target: 'delivery_role', via: 'assignment_role', ids: [role] });
    }
  }

  if (groups.length > 0) return { entity: { id: entityId, ...at }, groups, unlinked: null };

  return {
    entity: { id: entityId, ...at },
    groups: [],
    // NAMES THE CAUSE. A bare empty list here would read as "this record stands alone", which
    // for most kinds is not what the manifest says — it says nothing either way.
    unlinked: {
      kind: 'no_edge_recorded',
      detail: `This blueprint records no connections for a ${at.viewKind} record. `
        + 'The manifest pins which records exist, and the only edges it carries today are '
        + 'requirement-to-proposal-section, requirement-to-story, and assignment-to-role.',
    },
  };
}
