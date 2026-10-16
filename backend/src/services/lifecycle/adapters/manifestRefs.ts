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
  /**
   * WHAT THE SOURCE-COVERAGE CHECK MEASURED, carried because the measurement cannot be redone
   * from the refs alone.
   *
   * `uncitedRequirementSourceBlocks` is one of the four things standing between a project and
   * `requirements_ready`, and it had NO measurement function at all — so every project blocked
   * on `not_assessed` at the first gate and the lifecycle could not turn. The reason it had
   * none is structural: the question is "which requirement source blocks does no business task
   * cite", and neither half of that is in a ref set. `sources` holds requirement POINTERS, not
   * the process document's source blocks; `businessTasks` is `PinnedRef[]`, which carries ids
   * and no `source_evidence`. The relation is in `FactoryProject`, which the composer has and
   * the evidence reader does not.
   *
   * So the answer is MEASURED WHERE THE DATA IS — at composition, by the shipped
   * `factoryValidate` SOURCE_COVERAGE rule — and recorded here. A measurement moved rather
   * than a second implementation of the same rule, which is what the lifecycle generation layer
   * already refused to do for this exact check (`generation/processValidation.ts` header).
   *
   * AN INLINE TYPE, NOT AN EXPORTED ONE. This file is at eleven of CLAUDE.md's twelve public
   * symbols and nothing outside needs to name the shape — the adapters build it structurally and
   * the measurement reads one field off it. Naming it would spend the last export on a type with
   * no second reader.
   *
   * ABSENT ON A LEGACY MANIFEST, and that is load-bearing. `refs_json` is JSONB, so a row
   * written before this field existed parses with `coverage` undefined. Every reader must treat
   * that as UNMEASURED rather than as an empty list: an empty list means "somebody looked and
   * every requirement block is cited", and a manifest written before anyone looked has not
   * earned that. The measurement checks `Array.isArray` for exactly this reason.
   */
  coverage: {
    /**
     * Source blocks classified `requirement` that no task's `source_evidence` cites.
     *
     * `null` MEANS NOBODY MEASURED; `[]` MEANS SOMEBODY LOOKED AND EVERY BLOCK IS CITED. The two
     * are the whole point of the field being nullable rather than defaulted, and they are the
     * same distinction `refs: null` and `published: null` carry one level up: a reader that
     * collapses them turns "not assessed" into "no gaps", which is the single bypass this
     * evidence path exists to refuse. A legacy manifest parses with `coverage` undefined, which
     * is ALSO not an array, so one `Array.isArray` check covers both.
     *
     * VACUOUS FOR `sbp`, AND THAT IS A STATED LIMITATION RATHER THAN A HIDDEN PASS. SBP has no
     * source-block layer and no business tasks: there are zero requirement blocks, so zero of
     * them are uncited, and `[]` is the literal answer to the question asked. What it means in
     * practice is that this particular gate does no work for a student project. The work is done
     * for them by `requirementsWithoutProvenance` at the same stage and by
     * `mustHaveRequirementsWithoutStory` at `plan_ready`, which is where an SBP requirement's
     * trace into the build actually lives. Recorded in
     * docs/project-lifecycle/backbone-adoption.md rather than left for a reader to infer.
     */
    uncitedRequirementBlocks: string[] | null;
  };
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
    // `null`, NOT `[]`. A skeleton has measured nothing, and `[]` here would make every ref set
    // that never reached a coverage check look like one that passed it.
    coverage: { uncitedRequirementBlocks: null },
  };
}

/**
 * The `SourceRef.source` values that hold REQUIREMENTS, as opposed to other captured statements.
 *
 * THIS IS WHAT MAKES `requirementCount` EXACT RATHER THAN APPROXIMATE. The field had no
 * measurement, and `lifecycleEvidence.ts` recorded why: `SourceRef` is documented as "a
 * requirement OR OTHER CAPTURED STATEMENT", so `sources.length` would publish a count meaning
 * something slightly different from its name, and "it is cheaper to leave the field unassessed —
 * where it BLOCKS — than to measure it approximately."
 *
 * That reasoning was about the TYPE's intent. What the two shipped adapters actually put in
 * `sources` is narrower: `factoryToManifestRefs` maps `input.requirements` only, and
 * `sbpToManifestRefs` maps `input.requirements` only. Neither has ever written a non-requirement
 * into the list. `source` records which collection each came from, so the superset can be
 * filtered out instead of guessed at — and a count over a filtered list is exact.
 *
 * THE FILTER IS ALL-OR-NOTHING AT THE CALL SITE, not per element. One source carrying an
 * unrecognised `source` means a collection exists that nobody has classified, and counting the
 * recognised subset would report a number that is quietly too low. Too low is the dangerous
 * direction here: `requirementCount > 0` is the predicate, so a subset count can only ever make
 * a project look readier than it is, never less ready.
 *
 * ASSERTED AGAINST BOTH ADAPTERS BY A TEST, in both directions. A set hand-maintained beside the
 * adapters would drift the first time one of them changed its `source` string, and the drift
 * would show up as a silently unassessed prerequisite rather than as a failure.
 */
export const REQUIREMENT_SOURCE_COLLECTIONS: ReadonlySet<string> = new Set<string>([
  'contract_requirements',      // factory: the compliance-matrix rows
  'build_plans#requirements',   // sbp: the student plan's requirements
]);

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
 * `agents`, `trackMappings` and `coverage` are deliberately absent: they are objects holding
 * arrays, not arrays, so they are not walkable by the `PinnedRef[]` loop below. `coverage` is
 * doubly so — it holds bare id STRINGS, not refs with an `id` field, so the loop would read
 * `r.id` off a string and find `undefined` on every element. The test asserts this set equals
 * exactly the ARRAY-valued top-level keys of a fresh `emptyRefs()`, so that carve-out is
 * measured rather than remembered.
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
