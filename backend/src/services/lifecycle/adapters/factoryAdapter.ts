/**
 * Factory → manifest references. Read-only, one-directional, no table merger.
 *
 * The Factory models a CONTRACT: proposal and solution-build tracks, a RACI vocabulary, evidence
 * states, canonical requirement ids shared across both tracks. The coordinator does not adopt any
 * of that — it points at it. This adapter is the only place that knows the Factory's shape, which
 * is what keeps the rest of the lifecycle ignorant of it.
 *
 * WHAT IT DELIBERATELY DOES NOT DO:
 *
 *   - It does not write. There is no store and no sequelize import in this file, so the rule
 *     "never add a coordinator column to contract_*" is structural rather than remembered.
 *   - It does not upgrade a state. An `evidence_state` of `planned` becomes a source state of
 *     `proposed`, never `confirmed`. Only a human act produces confirmation, and an adapter is
 *     not a human act.
 *   - It does not invent provenance. A requirement with no `source_document` carries
 *     `provenanceKind: null`, because null means unrecorded and the request forbids filling it in.
 *   - It does not generate the proposal track. `factoryDecomposeRun.ts:22` hardcodes
 *     `GEN_TRACK = 'solution_build'`, so only that document is ever produced. The adapter maps
 *     whatever tracks it is handed and never fabricates the missing one.
 *
 * Contract: docs/project-lifecycle/blueprint-contract.md. Seam: architecture.md §2.
 */
import type { SourceState } from '../sourceIdentity';
import { emptyRefs, type ManifestRefs, type PinnedRef, type SourceRef } from './manifestRefs';

/**
 * The Factory fields this adapter reads, named structurally rather than imported.
 *
 * Deliberately a local shape, not `import type { ContractRequirement } from '…/factoryContract'`:
 * a structural dependency means a Factory refactor cannot silently change the coordinator's
 * behaviour, and the adapter is the only thing that has to be updated when the Factory moves.
 */
export interface FactoryRequirementLike {
  canonical_req_id: string;
  evidence_state?: string | null;
  human_confirmed?: boolean | null;
  source_document?: string | null;
  amendment_version?: string | null;
  tracks?: ReadonlyArray<string> | null;
}

/**
 * `source_evidence` is the SOURCE_COVERAGE anchor, and it is read here rather than only its id.
 *
 * OPTIONAL, and the three cases are different. An ABSENT field means the caller did not supply
 * citations, so coverage is unmeasurable and must be reported as such. An EMPTY array means the
 * task cites nothing, which `factoryValidate`'s own comment calls "a validation error" — it is a
 * measured fact, not an absence. A populated array is the citation itself.
 */
export interface FactoryTaskLike { id: string; source_evidence?: ReadonlyArray<string> | null }
export interface FactoryProcessLike { id: string }
/** One addressable block of the source. Only the two fields coverage needs, named structurally. */
export interface FactorySourceBlockLike { id: string; kind?: string | null }
export interface FactoryAssignmentLike { role_id: string; responsibility?: string | null; executor?: { type?: string | null; id?: string | null } | null }

export interface FactoryAdapterInput {
  deliveryProjectId: string;
  /** The document revision these records were read at, pinned into every ref. */
  documentVersion: number | null;
  requirements: ReadonlyArray<FactoryRequirementLike>;
  processes?: ReadonlyArray<FactoryProcessLike>;
  tasks?: ReadonlyArray<FactoryTaskLike>;
  /**
   * The process document's source blocks, for the coverage measurement.
   *
   * ABSENT IS NOT EMPTY. Omitting this leaves `coverage.uncitedRequirementBlocks` unmeasurable,
   * and the adapter says so by omitting the field rather than writing `[]` — `[]` is the answer
   * "every requirement block is cited", which nobody has earned if nobody supplied the blocks.
   */
  sourceBlocks?: ReadonlyArray<FactorySourceBlockLike>;
  assignments?: ReadonlyArray<FactoryAssignmentLike>;
  /** canonical_req_id -> proposal section, from requirement_proposal_sections. */
  proposalSections?: ReadonlyArray<{ canonical_req_id: string; proposal_section_ref: string }>;
  /** canonical_req_id -> student story, from requirement_solution_stories. */
  solutionStories?: ReadonlyArray<{ canonical_req_id: string; student_task_story_id: string }>;
  /** Runtime agents that will operate the business process, if any have been scoped. */
  runtimeAgentIds?: ReadonlyArray<string>;
  /** Builder agents that write the software. A different population, kept apart on purpose. */
  builderAgentIds?: ReadonlyArray<string>;
}

/**
 * Map the Factory's `evidence_state` onto a lifecycle source state.
 *
 * The one-way-ness matters: nothing here produces `confirmed` except an explicit
 * `human_confirmed` flag, which is a record of a human act rather than an inference from it.
 * `unassessed` deliberately becomes `open` rather than anything more definite — the Factory's own
 * doctrine is that "don't know" is a value, not a guess, and flattening it to a default would
 * discard exactly the information it exists to carry.
 */
export function evidenceStateToSourceState(
  evidenceState: string | null | undefined,
  humanConfirmed: boolean | null | undefined,
): SourceState {
  if (humanConfirmed === true) return 'confirmed';
  switch (evidenceState) {
    case 'demonstrated': return 'production_verified';
    case 'tested': return 'tested';
    case 'planned': return 'proposed';
    case 'assumption': return 'proposed';
    case 'missing': return 'open';
    case 'unassessed': return 'open';
    default: return 'heard';
  }
}

/**
 * Requirement source blocks no task cites. The `SOURCE_COVERAGE` question, keeping the ids.
 *
 * A task whose `source_evidence` is absent or null contributes NO citations rather than being
 * skipped. The difference matters: skipping it would be the same as treating a task that cites
 * nothing as a task that cites everything, and "cites nothing" is the violation
 * `factoryValidate` already calls an error.
 *
 * Only `kind === 'requirement'` is asked about. `context`, `constraint` and `out_of_scope` blocks
 * are legitimately uncited, and `unresolved` has its own rule (`SOURCE_CLASSIFICATION`) — folding
 * it in here would report one failure under two names.
 */
function uncitedRequirementBlocks(
  blocks: ReadonlyArray<FactorySourceBlockLike>,
  tasks: ReadonlyArray<FactoryTaskLike>,
): string[] {
  const cited = new Set<string>();
  for (const t of tasks) for (const id of t.source_evidence ?? []) cited.add(id);
  return blocks.filter((b) => b.kind === 'requirement' && !cited.has(b.id)).map((b) => b.id);
}

/** Translate Factory records into pinned references. Pure: same input, same output, no writes. */
export function factoryToManifestRefs(input: FactoryAdapterInput): ManifestRefs {
  const refs = emptyRefs('factory', input.deliveryProjectId);
  const rev = input.documentVersion ?? null;

  refs.sources = input.requirements.map((r): SourceRef => ({
    // The Factory's own canonical id, NOT re-minted: it must still resolve in the Factory, and
    // re-minting here would make the pointer dangle.
    id: r.canonical_req_id,
    revision: r.amendment_version ?? rev,
    source: 'contract_requirements',
    state: evidenceStateToSourceState(r.evidence_state, r.human_confirmed),
    // null means unrecorded. An empty string is treated as unrecorded too, rather than as a
    // document named "".
    provenanceKind: r.source_document && r.source_document.trim() ? r.source_document : null,
  }));

  // SOURCE COVERAGE, measured here because this is the only place that can see both halves.
  //
  // THE RULE IS NOT REIMPLEMENTED, IT IS THE SAME RULE. `factoryValidate`'s SOURCE_COVERAGE is
  // "every source block of kind 'requirement' must appear in at least one task's
  // `source_evidence`", and that is what this is, over the same two collections. The reason it
  // runs here rather than being read off `factoryValidate`'s issue list is that the issue list
  // is prose — a `ValidationIssue` carries `message`, and recovering ids by parsing the message
  // is the string-matching this programme keeps finding broken. `processValidation.ts` declined
  // to reimplement the rule's JUDGEMENT; this reuses the judgement and keeps the ids.
  //
  // `undefined` blocks vs `null`: unmeasurable, reported as such, so the prerequisite keeps
  // refusing. An EMPTY `sourceBlocks` array is different and is honoured — a project with no
  // source blocks genuinely has no uncited ones.
  refs.coverage = {
    uncitedRequirementBlocks: input.sourceBlocks === undefined
      ? null
      : uncitedRequirementBlocks(input.sourceBlocks, input.tasks ?? []),
  };

  const pin = (ids: ReadonlyArray<string>, source: string): PinnedRef[] =>
    ids.map((id) => ({ id, revision: rev, source }));

  refs.processes = pin((input.processes ?? []).map((p) => p.id), 'contract_process_documents#processes');
  refs.businessTasks = pin((input.tasks ?? []).map((t) => t.id), 'contract_process_documents#tasks');
  refs.assignments = (input.assignments ?? []).map((a) => ({
    id: `${a.role_id}:${a.responsibility ?? 'UNSPECIFIED'}`,
    revision: rev,
    source: 'contract_process_documents#assignments',
  }));

  refs.agents = {
    runtime: pin(input.runtimeAgentIds ?? [], 'runtime_agents'),
    builder: pin(input.builderAgentIds ?? [], 'builder_agents'),
  };

  // Government traceability, carried through unchanged. These two junction tables are exactly
  // the "proposal and solution-build tracks and their requirement mappings" the request
  // requires be preserved, so they are mapped verbatim rather than normalised into something else.
  refs.trackMappings = {
    proposalSections: (input.proposalSections ?? []).map((p) => ({
      canonicalReqId: p.canonical_req_id,
      sectionRef: p.proposal_section_ref,
    })),
    solutionStories: (input.solutionStories ?? []).map((s) => ({
      canonicalReqId: s.canonical_req_id,
      storyId: s.student_task_story_id,
    })),
  };

  return refs;
}
