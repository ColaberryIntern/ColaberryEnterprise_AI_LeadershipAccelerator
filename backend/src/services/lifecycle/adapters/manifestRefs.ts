/**
 * The shape an adapter produces: PINNED REFERENCES into existing domain records.
 *
 * This is the seam that keeps the coordinator from becoming a second database. An adapter reads
 * a domain model it does not own and returns pointers — ids plus the revision they were read at.
 * It never returns copies of the domain data, and it never writes to the domain's tables.
 *
 * THE DIRECTION IS ONE-WAY, BY CONSTRUCTION. These adapters are pure functions returning plain
 * data. They have no store, no sequelize import and no write path, so "the coordinator must not
 * add a column to contract_* or build_*" is not a rule anyone has to remember — there is nothing
 * here that could.
 *
 * WHY POINTERS AND NOT COPIES. A second mutable copy immediately raises the question of which
 * one is right, and the request is explicit: "prefer normalized existing records plus an
 * immutable manifest that references exact revisions. Avoid duplicating all data into a second
 * mutable truth store." The manifest answers "what exactly was approved" by pinning revisions;
 * the domain tables stay the source of their own data.
 *
 * Contract: docs/project-lifecycle/blueprint-contract.md §1-2.
 */
import type { SourceState } from '../sourceIdentity';

/** Which engine a set of references came from. The two are never merged. */
export type RefOrigin = 'factory' | 'sbp';

/** One pinned reference: what it is, where it lives, and the revision it was read at. */
export interface PinnedRef {
  /** The domain's own id. Not re-minted, so it still resolves in the domain. */
  id: string;
  /** The revision of that record this manifest was built against. `null` when unversioned. */
  revision: string | number | null;
  /** The table or collection it lives in, for a reader tracing the pointer back. */
  source: string;
}

/** A requirement or other captured statement, with its state and provenance carried intact. */
export interface SourceRef extends PinnedRef {
  state: SourceState;
  /** `null` means unrecorded. Never inferred by an adapter. */
  provenanceKind: string | null;
}

/**
 * Agent references, with builder and runtime kept in SEPARATE fields rather than one list.
 *
 * The request is explicit that these must not be conflated: "keep builder-agent and runtime-agent
 * IDs separate" and "do not overload `owner_agent` with both the coding agent and the runtime
 * employee". Two fields make that structural instead of a naming convention.
 */
export interface AgentRefs {
  /** Agents that will RUN the business process once it is live. */
  runtime: PinnedRef[];
  /** Agents that BUILD the software. A different population entirely. */
  builder: PinnedRef[];
}

/** Government track traceability, which the request requires be preserved as-is. */
export interface TrackMappingRefs {
  /** canonical_req_id -> proposal section refs. */
  proposalSections: Array<{ canonicalReqId: string; sectionRef: string }>;
  /** canonical_req_id -> student build story refs. */
  solutionStories: Array<{ canonicalReqId: string; storyId: string }>;
}

export interface ManifestRefs {
  origin: RefOrigin;
  /** The project these refs belong to, in the origin's own identity space. */
  projectId: string;
  sources: SourceRef[];
  processes: PinnedRef[];
  businessTasks: PinnedRef[];
  assignments: PinnedRef[];
  agents: AgentRefs;
  /** Workspace/action map entries, or explicit headless markers. */
  surfaces: PinnedRef[];
  /** Typed control policies. */
  policies: PinnedRef[];
  /** Design decisions and the visual-contract revision selected. */
  designDecisions: PinnedRef[];
  /** Downstream implementation references: releases, stories, tasks. */
  downstream: PinnedRef[];
  /** Present only for origins that have tracks. Empty arrays, never omitted, so a reader can
   *  tell "no mappings" from "this origin has no concept of mappings". */
  trackMappings: TrackMappingRefs;
}

/** An empty ref set for a given origin and project. Every array present, so shape is stable. */
export function emptyRefs(origin: RefOrigin, projectId: string): ManifestRefs {
  return {
    origin,
    projectId,
    sources: [],
    processes: [],
    businessTasks: [],
    assignments: [],
    agents: { runtime: [], builder: [] },
    surfaces: [],
    policies: [],
    designDecisions: [],
    downstream: [],
    trackMappings: { proposalSections: [], solutionStories: [] },
  };
}

/** Tables an adapter must never claim to have written. Asserted by a test over the module text. */
export const DOMAIN_TABLES_ADAPTERS_MUST_NOT_WRITE: ReadonlyArray<string> = [
  'contract_tracks',
  'contract_requirements',
  'contract_process_documents',
  'contract_process_reviews',
  'requirement_proposal_sections',
  'requirement_solution_stories',
  'build_plans',
  'build_intake',
  'student_tasks',
];

export interface RefIntegrityReport {
  ok: boolean;
  /** Ids appearing in more than one ref list, which would make a pointer ambiguous. */
  collisions: string[];
  /** Refs whose id is empty or whitespace. */
  malformed: string[];
  /** Agent ids appearing in BOTH runtime and builder — the conflation the request forbids. */
  agentNamespaceCollisions: string[];
}

/**
 * The top-level ref collections `checkRefIntegrity` actually walks.
 *
 * EXPORTED so a test can hold it against the shape `emptyRefs()` really returns. It was an
 * inline literal inside the function, hand-maintained against `ManifestRefs` with nothing
 * connecting them — so adding a collection to the interface left the integrity check silently
 * skipping it, and the check went on passing while its coverage shrank. That is the
 * producer-with-no-consumer failure this repo names, one level down: not a function nobody
 * calls, but a check that stops covering what it claims to.
 *
 * `agents` and `trackMappings` are deliberately absent: they are objects holding arrays, not
 * arrays, so they are not walkable by the `PinnedRef[]` loop below. The test asserts this set
 * equals exactly the ARRAY-valued top-level keys of a fresh `emptyRefs()`, so that carve-out
 * is measured rather than remembered.
 */
export const INTEGRITY_CHECKED_LISTS = [
  'sources', 'processes', 'businessTasks', 'assignments',
  'surfaces', 'policies', 'designDecisions', 'downstream',
] as const satisfies ReadonlyArray<keyof ManifestRefs>;

/**
 * Check a ref set for the ways a pointer can be wrong.
 *
 * Collision detection is per-list-pair rather than global: the same id legitimately appears as
 * both a source and a track mapping's `canonicalReqId`, because those are the same requirement
 * seen from two angles. What must not happen is one id standing for two different *things*.
 */
export function checkRefIntegrity(refs: ManifestRefs): RefIntegrityReport {
  const malformed: string[] = [];
  const seen = new Map<string, string>(); // id -> which list claimed it
  const collisions: string[] = [];

  const lists: Array<[string, PinnedRef[]]> = INTEGRITY_CHECKED_LISTS.map(
    (k) => [k, refs[k] as PinnedRef[]],
  );

  for (const [listName, list] of lists) {
    for (const r of list) {
      if (!r.id || !String(r.id).trim()) { malformed.push(`${listName}:<empty>`); continue; }
      const prior = seen.get(r.id);
      if (prior && prior !== listName) collisions.push(r.id);
      else seen.set(r.id, listName);
    }
  }

  const runtimeIds = new Set(refs.agents.runtime.map((a) => a.id));
  const agentNamespaceCollisions = refs.agents.builder
    .map((a) => a.id)
    .filter((id) => runtimeIds.has(id));

  return {
    ok: malformed.length === 0 && collisions.length === 0 && agentNamespaceCollisions.length === 0,
    collisions: [...new Set(collisions)],
    malformed,
    agentNamespaceCollisions: [...new Set(agentNamespaceCollisions)],
  };
}
