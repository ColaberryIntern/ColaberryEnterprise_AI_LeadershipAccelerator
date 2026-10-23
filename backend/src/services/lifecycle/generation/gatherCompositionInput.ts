/**
 * THE CALLER THAT NEVER EXISTED: assemble a real project's records into a composition input.
 *
 * Design: `docs/project-lifecycle/readiness-and-approval-separation.md`. Session CC-20261021-h9v3.
 *
 * ## Why this module exists
 *
 * `operating_blueprint_manifests` has zero rows in production, and the reason is not a disabled
 * flag — `ENABLE_PROJECT_LIFECYCLE` is `true`. It is that `composeBlueprint` is PURE: every
 * collection it validates arrives in the request body, requirements included
 * (`blueprintPersistence.buildRefs` reads `input.project.requirements`, never a table). Something
 * has to read a project's records and build that body, and nothing did. There is no frontend
 * ("There is no frontend route yet", `projectLifecycleRoutes.ts`), no script, and no service; both
 * adapters had zero production callers.
 *
 * So the endpoint, the persister, the writer and both adapters were all correct and all
 * unreachable. This is the missing half.
 *
 * ## What it refuses to pretend
 *
 * The database does NOT hold everything composition needs. Four of the inputs are product
 * decisions rather than records — task-surface bindings, workspace-state declarations, control
 * policies, and a selected design, where `design === null` is a hard `DESIGN_NOT_SELECTED` with
 * no default — and three more are stated by the model rather than stored: agents, effort and the
 * declaration.
 *
 * This module therefore does not promise to gather them. It TYPES them as `AuthoredInputs` and
 * names the absent ones all at once, which is the same reason `composeBlueprint` runs every
 * surface check after generation already refused: a caller fixing a blueprint wants every blocker
 * in one pass, not one per round trip.
 *
 * Two inputs that LOOK authored are not, and taking them from the project is the point of doing
 * this here rather than in a caller:
 *   - `allocation` — `FactoryProject.allocation` is the same `AllocationRow[]` the generation
 *     input wants, so asking a caller to retype it invites a second, divergent copy.
 *   - `roleIds` — `validateControlSpec` checks policies against "roles a policy may name", and
 *     those roles are `project.roles`. Authoring this by hand is how every named role becomes
 *     unknown and the `controls` stage refuses for no real reason.
 */
import type { UnderstandingItem } from '../../delivery/projectUnderstanding';
import type {
  AllocationRow, ContractRequirement, ContractTrack, FactoryProject,
} from '../../factory/contracts/factoryContract';
import { type FactoryDocJson, reconstructFactoryProject } from '../../factory/factoryProjectView';
import type { SourceItem } from '../sourceIdentity';
import type { ScopedAgent } from './agentScoping';
import type { BlueprintCompositionInput } from './blueprintComposition';
import type { DeclarationSource } from './blueprintGeneration';
import type { ControlPolicy } from './controlSpecification';
import type { SelectionInput } from './designSelection';
import type { EffortAssessment, TargetAcceptance } from './effortMeasures';
import type { ReworkBounds } from './processValidation';
import type { HeadlessAcceptance, TaskSurfaceBinding } from './workspaceBindingTypes';
import type { WorkspaceStateDeclaration } from './workspaceStateChecks';

/**
 * Everything composition needs that NO table holds.
 *
 * `understanding` is in this list and is the one that deserves an explanation, because
 * `project_understandings` does store `UnderstandingItem[]`. That table has no
 * `delivery_project_id`: its keys are `lead_id` and `source`/`source_ref`, and the only link to a
 * built project is `build_handoff`, typed `unknown | null`. Joining through an untyped JSONB
 * column on a guess is how a blueprint gets filed against the wrong project, so the join is named
 * as the obstacle instead of invented. When `build_handoff` gains a contract, this field moves
 * out of `AuthoredInputs` and into the gathered half.
 */
export interface AuthoredInputs {
  understanding: ReadonlyArray<UnderstandingItem>;
  agents: ReadonlyArray<ScopedAgent>;
  effort: ReadonlyArray<EffortAssessment>;
  declaration: DeclarationSource;
  bindings: ReadonlyArray<TaskSurfaceBinding>;
  workspaceStates: ReadonlyArray<WorkspaceStateDeclaration>;
  policies: ReadonlyArray<ControlPolicy>;
  /** `null` is a REFUSAL, not a default. Required here so its absence is explicit. */
  design: SelectionInput | null;
  headlessAcceptance?: HeadlessAcceptance | null;
  reworkBounds?: ReworkBounds;
  targetAcceptance?: TargetAcceptance | null;
  priorIds?: ReadonlyMap<string, SourceItem>;
}

/**
 * The authored fields a composition cannot proceed without.
 *
 * `design` is absent from this list ON PURPOSE even though it is required: a caller may legitimately
 * pass `design: null` to ask "what else is wrong first?", and composition reports
 * `DESIGN_NOT_SELECTED` itself. Listing it here too would report one problem under two names.
 */
export const REQUIRED_AUTHORED_FIELDS = [
  'understanding', 'agents', 'effort', 'declaration',
  'bindings', 'workspaceStates', 'policies',
] as const;

export interface GatheredProject {
  project: FactoryProject;
  /** The decomposition revision every pinned ref is read at. */
  documentVersion: number;
  trackType: string;
  approvalStatus: string;
  /**
   * WHETHER `source_blocks` WAS IN THE STORED DOCUMENT, read from the RAW doc_json before
   * reconstruction touches it.
   *
   * `reconstructFactoryProject` does `source_blocks: d.source_blocks ?? []`, which is correct for
   * a view model and WRONG as a composition input. `factoryToManifestRefs` distinguishes an
   * ABSENT `sourceBlocks` (coverage unmeasurable, recorded `null`, so the prerequisite keeps
   * blocking) from an EMPTY one (measured: no blocks, therefore none uncited, so coverage is
   * clean). Handing it `[]` for a document that never had the field laundries the first into the
   * second and reports source coverage as PASSED on a project nobody measured.
   *
   * So the flag is carried separately rather than read back off `project.source_blocks`, where
   * the two cases are already indistinguishable.
   */
  sourceBlocksPresent: boolean;
  counts: {
    requirements: number;
    sourceBlocks: number;
    processes: number;
    tasks: number;
    roles: number;
    assignments: number;
    allocation: number;
  };
}

export type LoadFailure =
  | { ok: false; reason: 'no_decomposition' };

/**
 * DISCRIMINATED ON BOTH SIDES, which the first version of this type was not.
 *
 * `GatheredProject | LoadFailure` reads fine and does not narrow: with no `ok` on the success
 * member, `if ('ok' in r && r.ok === false)` leaves the compiler holding the whole union
 * afterwards, so every caller needs a cast. A cast at a boundary whose entire job is to say
 * "loaded, or not" is the boundary failing to do that job.
 *
 * The TEST-FILE TYPECHECK caught this, not the build — the production code had papered over it
 * with precisely such a cast, which compiled.
 */
export type LoadResult = ({ ok: true } & GatheredProject) | LoadFailure;

/**
 * Load one delivery project's decomposition into a full `FactoryProject`.
 *
 * The queries and the track-selection rule are the ones `factoryRoutes` has always used: latest
 * version per track, preferring `solution_build` because that track carries the build, else the
 * newest row.
 *
 * IT IS A SECOND COPY, and saying so is the point. `factoryRoutes` still has its own, because
 * rewriting a working production read path is a wider change than this one needs to be, and
 * CLAUDE.md's extract-on-the-third-occurrence threshold is not met at two. The honest cost is
 * that the two can drift; what offsets it is a test here pinning the rule explicitly — including
 * that a newer row on another track does NOT win — so a drift is a visible test change rather
 * than a silent behaviour difference between the view and the blueprint. Extracting it for both
 * is the right move the moment a third caller appears.
 *
 * Models are lazy-loaded, following the `projectApprovalService` lesson that a module-level model
 * import drags ORM initialisation into every path that merely references this file.
 */
export async function loadFactoryProject(
  deliveryProjectId: string,
): Promise<LoadResult> {
  const { default: ContractProcessDocument } = await import('../../../models/ContractProcessDocument');
  const { default: ContractTrackModel } = await import('../../../models/ContractTrack');
  const { default: ContractRequirementModel } = await import('../../../models/ContractRequirement');

  const docs = await ContractProcessDocument.findAll({
    where: { delivery_project_id: deliveryProjectId },
    order: [['version', 'DESC']],
  });
  if (!docs.length) return { ok: false, reason: 'no_decomposition' };

  const latestByTrack = new Map<string, typeof docs[number]>();
  for (const d of docs) if (!latestByTrack.has(d.track_type)) latestByTrack.set(d.track_type, d);
  const chosen = latestByTrack.get('solution_build') ?? docs[0];

  const [trackRows, reqRows] = await Promise.all([
    ContractTrackModel.findAll({ where: { delivery_project_id: deliveryProjectId } }),
    ContractRequirementModel.findAll({ where: { delivery_project_id: deliveryProjectId } }),
  ]);

  const docJson = (chosen.doc_json ?? {}) as FactoryDocJson;
  // READ BEFORE RECONSTRUCTION. See `sourceBlocksPresent` above: once the project is built the
  // absent and empty cases are the same array.
  const sourceBlocksPresent = Array.isArray(docJson.source_blocks);

  const project = reconstructFactoryProject({
    deliveryProjectId,
    docJson,
    tracks: trackRows.map((r) => r.get({ plain: true }) as unknown as ContractTrack),
    requirements: reqRows.map((r) => r.get({ plain: true }) as unknown as ContractRequirement),
  });

  return {
    ok: true,
    project,
    documentVersion: Number(chosen.version),
    trackType: String(chosen.track_type),
    approvalStatus: String(chosen.status),
    sourceBlocksPresent,
    counts: {
      requirements: project.requirements.length,
      sourceBlocks: project.source_blocks.length,
      processes: project.processes.length,
      tasks: project.tasks.length,
      roles: project.roles.length,
      assignments: project.assignments.length,
      allocation: project.allocation.length,
    },
  };
}

/**
 * Every required authored field that was not supplied, in declaration order.
 *
 * ALL of them, never the first. A caller learning one missing field per attempt is the round-trip
 * pattern `composeBlueprint` already refuses by running all four surface checks after generation
 * has refused.
 *
 * An EMPTY ARRAY counts as supplied. That is deliberate and it is the absent/empty distinction
 * again: a project with no control policies is a measurable state that `validateControlSpec` is
 * entitled to judge, while an omitted field means nobody said. Treating `[]` as missing would
 * make "I checked, there are none" unsayable.
 */
export function missingAuthoredInputs(authored: Partial<AuthoredInputs>): string[] {
  return REQUIRED_AUTHORED_FIELDS.filter((f) => authored[f] === undefined || authored[f] === null);
}

export type GatherResult =
  | {
    ok: true;
    input: BlueprintCompositionInput;
    gathered: GatheredProject;
    /** Passed to `persistComposedBlueprint` only when true. See `sourceBlocksPresent`. */
    sourceBlocksPresent: boolean;
  }
  | LoadFailure
  | { ok: false; reason: 'missing_authored_inputs'; missing: string[] };

/**
 * Assemble a composition input for one delivery project.
 *
 * Loads first and checks the authored half second, so a caller with nothing authored still learns
 * whether the project has a decomposition at all — the cheaper fact, and the one that decides
 * whether authoring is even worth starting.
 */
export async function gatherCompositionInput(args: {
  deliveryProjectId: string;
  authored: Partial<AuthoredInputs>;
  correlationId?: string | null;
}): Promise<GatherResult> {
  const loaded = await loadFactoryProject(args.deliveryProjectId);
  if (!loaded.ok) return loaded;
  const gathered: GatheredProject = loaded;

  const missing = missingAuthoredInputs(args.authored);
  if (missing.length > 0) return { ok: false, reason: 'missing_authored_inputs', missing };

  const a = args.authored as AuthoredInputs;
  const input: BlueprintCompositionInput = {
    project: gathered.project,
    understanding: a.understanding,
    // FROM THE PROJECT, NOT THE CALLER. Same type, one source of truth.
    allocation: gathered.project.allocation as ReadonlyArray<AllocationRow>,
    agents: a.agents,
    effort: a.effort,
    declaration: a.declaration,
    bindings: a.bindings,
    workspaceStates: a.workspaceStates,
    policies: a.policies,
    // DERIVED, for the reason in the header: authoring this by hand makes every named role
    // unknown and refuses `controls` for no real reason.
    roleIds: new Set(gathered.project.roles.map((r) => r.id)),
    design: a.design,
    headlessAcceptance: a.headlessAcceptance ?? null,
    correlationId: args.correlationId ?? null,
    ...(a.reworkBounds === undefined ? {} : { reworkBounds: a.reworkBounds }),
    ...(a.targetAcceptance === undefined ? {} : { targetAcceptance: a.targetAcceptance }),
    ...(a.priorIds === undefined ? {} : { priorIds: a.priorIds }),
  };

  return { ok: true, input, gathered, sourceBlocksPresent: gathered.sourceBlocksPresent };
}
