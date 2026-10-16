/**
 * Lifecycle EVIDENCE: what a prerequisite predicate is allowed to believe, and why.
 *
 * Split out of `lifecycleStatus.ts` when that file reached 495 lines of 500 AND exactly 12
 * exports of 12 — both CLAUDE.md ceilings at once. The seam is the one its own residual note
 * named: evidence on this side, status/transition/approval on the other. Doing it BEFORE the
 * next change rather than at the ceiling is the entire point of recording a residual.
 *
 * The authority on any evidence object is its `assessedFields`, and "assessed" means MEASURED
 * ON THIS CALL — see `NOT_MEASURED`. A placeholder value with its field claimed assessed is a
 * gate bypass: every predicate would trust it and the NOT_ASSESSED refusal would become a pass.
 */
import type { LifecycleEvidence, EvidenceField } from './lifecyclePrerequisites';
import { REQUIREMENT_SOURCE_COLLECTIONS, type ManifestRefs } from './adapters/manifestRefs';
import { requirementsNeedingCoverage } from './adapters/sbpAdapter';
import {
  publishedPlanState,
  type PlanLike,
  type PublishedPlanState,
} from './lifecyclePlanReads';
import {
  requirementsWithoutStory,
  storiesWithoutTraceability as storiesMissingCitations,
  releasesWithoutUserVisibleWorkflow,
} from './storyTraceability';

export interface LifecycleRow {
  id: string;
  tenant_id: string;
  // The project ids. WITHOUT THESE the manifest holding the evidence cannot be located from
  // a row, which is why `EVIDENCE_MEASUREMENTS` sat empty: the signature could not reach the
  // data. Exactly one is set, enforced by the table CHECK.
  student_project_id: string | null;
  delivery_project_id: string | null;
  stage: string;
  condition: string | null;
  condition_reason: string | null;
}

/**
 * What a measurement is given. The ROW alone was not enough, which is why this exists.
 *
 * `Measurement` used to be `(row: LifecycleRow) => unknown`, and `LifecycleRow` is five columns:
 * id, tenant_id, stage, condition, condition_reason. **Not one of the ~25 fields on
 * `LifecycleEvidence` is derivable from those** — requirement provenance, process graphs,
 * allocation classes and approvals all live elsewhere. The map was empty because the signature
 * could not reach the data, not because nobody had got round to it.
 *
 * The evidence lives in the blueprint the `/compose` route validates and `manifestWriter`
 * persists as `operating_blueprint_manifests.refs_json`. So the I/O happens once, here, and each
 * measurement stays a PURE function of the result — which is what keeps them unit-testable with
 * a non-empty map, the property an earlier version of this file lost.
 */
export interface EvidenceContext {
  row: LifecycleRow;
  /** `null` when no manifest exists yet, or its refs could not be read. NOT an empty refs. */
  refs: ManifestRefs | null;
  /**
   * What `build_plans` says about this project's publication, or `null`.
   *
   * `null` is load-bearing and means the same three things `refs: null` means: nothing is
   * published, the project is not a student build at all, or the read failed. It NEVER means an
   * empty plan. Every measurement that reads this returns NOT_MEASURED on `null`, so a project
   * whose plan could not be read blocks on `not_assessed` rather than passing with no gaps.
   *
   * ONE FIELD, not a `plan` beside two integrity facts. Those three answers come from a single
   * query precisely so they cannot disagree, and splitting them across the context would put
   * the disagreement back — a context carrying a plan body from one read and a publication
   * count from another is a state the database was never in.
   *
   * Resolved BEFORE `applyMeasurements` because `Measurement` is synchronous and pure — the
   * same reason `refs` is resolved here rather than inside a measurement.
   */
  published: PublishedPlanState | null;
}

/**
 * `PlanLike` moved to `lifecyclePlanReads.ts` with the reader that produces it (P6-T5).
 * Re-exported so every consumer keeps its import path.
 */
export type { PlanLike } from './lifecyclePlanReads';

/**
 * What a measurement returns when it cannot measure THIS TIME.
 *
 * THIS CLOSES A FABRICATION PATH. `assessedFields` used to be `Object.keys(map)`, so a field was
 * claimed assessed because a function for it EXISTED — even on a call where that function had no
 * data and returned a placeholder. Every predicate would then trust the placeholder and the
 * NOT_ASSESSED refusal would silently become a pass: the exact gate bypass the T1.1
 * carry-forward named.
 *
 * "Assessed" now means MEASURED ON THIS CALL. A measurement that cannot see its data returns
 * this, the placeholder stands, and the field stays unassessed and therefore still blocking.
 */
export const NOT_MEASURED: unique symbol = Symbol('not measured');

type Measurement = (ctx: EvidenceContext) => unknown;

/**
 * The sources list, but ONLY if every element is readable.
 *
 * TWO HOLES THIS CLOSES, both found by mutation at the JSONB boundary, where `refs_json` is
 * cast `parsed as ManifestRefs` and nothing has checked its ELEMENTS:
 *
 *   `sources: [null]` threw "Cannot read properties of null" out of the reader, so a status
 *   read 500s on a malformed manifest instead of reporting "not measured".
 *
 *   a non-object or id-less element was counted silently, so a list of junk measured as
 *   "assessed, nothing wrong".
 *
 * ONE unreadable element makes the WHOLE list unmeasurable, not just that element. Measuring
 * the readable subset would report a provenance gap list that quietly omitted the rows nobody
 * could read — and a shorter gap list looks like better news, which is the wrong way to fail.
 */
interface SourceLike { id: string; state?: unknown; provenanceKind?: unknown; source?: unknown }

function readableSources(ctx: EvidenceContext): ReadonlyArray<SourceLike> | null {
  const list: unknown = ctx.refs?.sources;
  if (!Array.isArray(list)) return null;
  const readable = list.every((x) => x !== null
    && typeof x === 'object'
    && typeof (x as { id?: unknown }).id === 'string');
  return readable ? (list as ReadonlyArray<SourceLike>) : null;
}
/**
 * The published plan body, or `null`.
 *
 * Deliberately NOT `ctx.published?.plan`. Optional chaining would turn a context that forgot
 * the field entirely into a silent NOT_MEASURED, and this programme has already shipped one
 * absence test that passed because `undefined` was indistinguishable from "not supplied". A
 * missing field throws here, loudly, on the first measurement that reads it.
 */
function publishedPlan(ctx: EvidenceContext): PlanLike | null {
  return ctx.published === null ? null : ctx.published.plan;
}

export const EVIDENCE_MEASUREMENTS: Partial<Record<EvidenceField, Measurement>> = {
  /**
   * Must-have requirements no story fulfils.
   *
   * Both halves of the judgement are borrowed rather than re-decided: which requirements NEED
   * coverage is `adapters/sbpAdapter.requirementsNeedingCoverage` (mirroring
   * `planContract.requiresStoryCoverage`), and which are covered is
   * `storyTraceability.requirementsWithoutStory`. Re-deciding either here would be a second
   * place to get it wrong, and the coverage predicate has already been wrong once.
   */
  mustHaveRequirementsWithoutStory: (ctx) => {
    const plan = publishedPlan(ctx);
    if (!plan || !Array.isArray(plan.requirements) || !Array.isArray(plan.stories)) return NOT_MEASURED;
    return requirementsWithoutStory(requirementsNeedingCoverage(plan.requirements), plan.stories);
  },

  /**
   * Stories citing no requirement, business task or blueprint revision.
   *
   * Assessable on a LEGACY plan, deliberately: `fulfills` has always existed, so a plan with no
   * `references` is still measurable for this and reporting it unassessable would block every
   * pre-2026-10-09 project for a gap it does not have.
   */
  storiesWithoutTraceability: (ctx) => {
    const plan = publishedPlan(ctx);
    if (!plan || !Array.isArray(plan.stories)) return NOT_MEASURED;
    return storiesMissingCitations(plan.stories);
  },

  /**
   * Releases demonstrating nothing a human can see.
   *
   * The one measurement here that can return NOT_MEASURED on a plan it CAN read: if no story
   * declares a workspace — every plan generated before P6-T3 — then nobody has looked, and
   * `releasesWithoutUserVisibleWorkflow` says so with `null`. Passing that through as `[]`
   * would turn "unmeasured" into "no gaps", which is the exact bypass `NOT_MEASURED` exists
   * to prevent — and it would do it on the rule that was written for a real student's
   * twelve unreachable services.
   */
  releasesWithoutUserVisibleWorkflow: (ctx) => {
    const plan = publishedPlan(ctx);
    if (!plan || !Array.isArray(plan.releases) || !Array.isArray(plan.stories)) return NOT_MEASURED;
    const failing = releasesWithoutUserVisibleWorkflow(plan.releases.map((r) => r.key), plan.stories);
    return failing === null ? NOT_MEASURED : failing;
  },

  /**
   * Requirements carrying no recorded provenance.
   *
   * An EXACT mapping, which is why it is one of only two here. `SourceRef.provenanceKind` is
   * documented as "`null` means unrecorded. Never inferred by an adapter.", so the field and the
   * data mean the same thing and no judgement is being smuggled in.
   */
  requirementsWithoutProvenance: (ctx) => {
    const sources = readableSources(ctx);
    if (sources === null) return NOT_MEASURED;
    // `?? null` ON PURPOSE. An ABSENT `provenanceKind` is a second representation of
    // "unrecorded", and treating only `null` as unrecorded returned an EMPTY gap list while
    // claiming the field assessed — so the provenance prerequisite PASSED on data that
    // recorded no provenance at all. That is the gate shape this task exists to close, and a
    // mutation found it still open at the JSONB boundary.
    return sources.filter((s) => (s.provenanceKind ?? null) === null).map((s) => s.id);
  },

  /**
   * Source blocks still genuinely undecided.
   *
   * `SOURCE_STATES` documents `open` as "genuinely undecided. NOT zero, and NOT a default." It is
   * the only state of the six that means unresolved, so this is a mapping rather than a guess.
   */
  unresolvedSourceBlocks: (ctx) => {
    const sources = readableSources(ctx);
    if (sources === null) return NOT_MEASURED;
    return sources.filter((s) => s.state === 'open').map((s) => s.id);
  },

  /**
   * Exactly one plan is published.
   *
   * `publishedCount === 1`, written as an equality rather than `> 0` on purpose: TWO published
   * rows is the failure `planStore.publishConcurrency.integration` demonstrates against the
   * shipped schema, and a `> 0` check would call that healthy. Zero is also a failure, and the
   * worse-reading one, because every consumer treats absence as "has not published yet".
   */
  publishedPlanIsSingular: (ctx) => (
    ctx.published === null ? NOT_MEASURED : ctx.published.publishedCount === 1
  ),

  /**
   * The published plan's stored hash still describes its stored content.
   *
   * NOT_MEASURED when nothing is published — `hashIntact` is `null` there, and the alternative
   * (reporting `true`) would launder "no plan" into "an intact plan", which is the exact
   * direction of bypass this gatherer exists to refuse. The zero case is already reported by
   * `publishedPlanIsSingular`, so nothing goes unsaid.
   */
  publishedPlanHashIntact: (ctx) => (
    ctx.published === null || ctx.published.hashIntact === null
      ? NOT_MEASURED
      : ctx.published.hashIntact
  ),

  /**
   * How many requirements have been captured.
   *
   * ## This field had no measurement, and the lifecycle could not turn because of it
   *
   * The note that stood here said: DELIBERATELY NOT `requirementCount: refs.sources.length`,
   * because `SourceRef` is documented as "a requirement OR OTHER CAPTURED STATEMENT", so sources
   * is a superset and equating them publishes a count meaning something other than its name —
   * "cheaper to leave the field unassessed, where it BLOCKS, than to measure it approximately."
   *
   * The reasoning was sound and the consequence was not measured. `requirements_ready` is the
   * FIRST gate, `blockingGaps` filters only `ADVISORY_RULES`, and no kind is advisory — so an
   * unassessed `requirementCount` blocks every project at stage one of thirteen, permanently.
   * The lifecycle shipped, deployed and activated in that state. "Unassessed because honest" is
   * the right answer only while something is on its way to measuring it.
   *
   * ## Why it can now be measured EXACTLY, not approximately
   *
   * The superset is a property of the TYPE's intent, not of the data. Both shipped adapters map
   * `input.requirements` and nothing else into `sources`, and `SourceRef.source` records which
   * collection each pointer came from. So the non-requirements can be FILTERED rather than
   * guessed at, and `REQUIREMENT_SOURCE_COLLECTIONS` is the one place that says which collections
   * those are — asserted against both adapters by a test, in both directions, so it cannot drift
   * into a silently shrinking filter.
   *
   * ALL-OR-NOTHING, and the direction is the reason. One unrecognised `source` means a collection
   * nobody has classified. Counting the recognised subset would under-report, and under-reporting
   * is the dangerous direction for a `> 0` predicate: a short count can only make a project look
   * LESS ready, but a count that silently excluded the only real requirement collection would
   * report zero and refuse a project that is in fact ready — a fabricated refusal, which this
   * file treats as the same class of defect as a fabricated pass.
   */
  requirementCount: (ctx) => {
    const sources = readableSources(ctx);
    if (sources === null) return NOT_MEASURED;
    const allClassified = sources.every(
      (s) => typeof s.source === 'string' && REQUIREMENT_SOURCE_COLLECTIONS.has(s.source),
    );
    if (!allClassified) return NOT_MEASURED;
    return sources.filter((s) => REQUIREMENT_SOURCE_COLLECTIONS.has(s.source as string)).length;
  },

  /**
   * Requirement source blocks that no business task cites.
   *
   * ## Measured at composition, read here
   *
   * This is the other field that had no measurement, and it could not have one: the question is
   * "which requirement source blocks does no task cite", and NEITHER half is in a ref set.
   * `sources` holds requirement pointers, not the process document's source blocks, and
   * `businessTasks` is `PinnedRef[]` — ids with no `source_evidence`. The relation lives on
   * `FactoryProject`, which the composer holds and this reader does not.
   *
   * So the measurement moved to where the data is, and `refs.coverage` carries the result. The
   * rule is `factoryValidate`'s shipped SOURCE_COVERAGE, not a second implementation of it.
   *
   * ## Three states, one check
   *
   * `null` is "nobody measured" (a skeleton ref set, or a factory input that supplied no source
   * blocks). `undefined` is a manifest written before the field existed. Both are NOT_MEASURED
   * and both therefore BLOCK, which is the whole doctrine of this file. `[]` is the measured
   * answer "every requirement block is cited", and only an adapter that actually looked writes
   * it. One `Array.isArray` separates the two groups.
   *
   * THE ELEMENTS ARE CHECKED, not just the container, for the same reason `readableSources`
   * checks its elements: `refs_json` is cast `parsed as ManifestRefs` at the JSONB boundary with
   * nothing having validated what is inside. A list of nulls would otherwise be reported as a
   * list of gap ids and rendered as `Source block null is a requirement but no task cites it.`
   */
  uncitedRequirementSourceBlocks: (ctx) => {
    const measured = ctx.refs?.coverage?.uncitedRequirementBlocks;
    if (!Array.isArray(measured)) return NOT_MEASURED;
    const readable = measured.every((id) => typeof id === 'string' && id.trim() !== '');
    // ONE unreadable element makes the WHOLE list unmeasurable, matching `readableSources`.
    // Returning the readable subset would publish a SHORTER gap list, and a shorter gap list
    // reads as better news.
    return readable ? [...measured] : NOT_MEASURED;
  },
};

/**
 * The fields a measurement EXISTS for. Not the same as the fields measured on a given call.
 *
 * Still derived from the map, so a field cannot be listed without a function behind it. But the
 * authority on any single evidence object is its own `assessedFields`, which records what was
 * actually measured that time — see `NOT_MEASURED`.
 */
export const ASSESSED_EVIDENCE_FIELDS: ReadonlySet<EvidenceField> =
  new Set(Object.keys(EVIDENCE_MEASUREMENTS) as EvidenceField[]);

/**
 * Overlay real measurements onto the placeholder snapshot, and report EXACTLY what was
 * measured.
 *
 * PURE AND EXPORTED so it can be driven with a NON-EMPTY map. The previous version inlined this
 * loop inside the reader and the only test for it iterated the real map, which is empty — so the
 * test body never executed and **deleting the whole loop left 850 of 850 tests green.** A
 * verifier found it. The comment I had written there claimed it "CANNOT be vacuously satisfied
 * by a non-empty map", which is a declared expectation, and this run allows two categories
 * only: tested or removed.
 *
 * `assessedFields` is computed FROM THE MAP ARGUMENT, at call time, not read from a module-load
 * snapshot. That is what makes the wiring isolatable: a test can inject one measurement and
 * watch both the value and the set change together. With a snapshot, substituting an empty set
 * was undetectable, because at an empty map the snapshot IS empty.
 */
export function applyMeasurements(
  base: LifecycleEvidence,
  map: Partial<Record<EvidenceField, Measurement>>,
  ctx: EvidenceContext,
): LifecycleEvidence {
  const out: Record<string, unknown> = { ...base };
  const assessed = new Set<EvidenceField>();
  for (const [field, take] of Object.entries(map)) {
    const value = (take as Measurement)(ctx);
    // NOT_MEASURED leaves the placeholder standing AND the field unassessed, so the
    // prerequisite keeps blocking. Writing the placeholder while claiming the field was
    // assessed is the gate bypass this symbol exists to prevent.
    if (value === NOT_MEASURED) continue;
    out[field] = value;
    assessed.add(field as EvidenceField);
  }
  out.assessedFields = assessed;
  return out as unknown as LifecycleEvidence;
}

/**
 * The refs of the newest manifest for this project, or `null`.
 *
 * `null` on ANY of: no project id, no manifest row, no `refs_json`, unparseable JSON, or a
 * query that throws. Every one of those means the same thing to a caller — the evidence could
 * not be read — and the measurements above turn that into NOT_MEASURED, which leaves the
 * prerequisite BLOCKING rather than passing on a placeholder.
 *
 * The throw is caught and LOGGED with an `error_class`, not swallowed. CLAUDE.md forbids the
 * silent catch, and the honest answer here really is `null`: a status read should report "not
 * measured" rather than 500, because a project with no blueprint yet is the NORMAL case, not
 * an error.
 */
async function latestManifestRefs(row: LifecycleRow): Promise<ManifestRefs | null> {
  const projectId = row.student_project_id ?? row.delivery_project_id;
  if (projectId === null) return null;
  const column = row.student_project_id === null ? 'delivery_project_id' : 'student_project_id';

  try {
    const { sequelize } = await import('../../config/database');
    const rows = await sequelize.query<{ refs_json: unknown }>(
      `SELECT refs_json
         FROM operating_blueprint_manifests
        WHERE tenant_id = $1 AND ${column} = $2
        ORDER BY revision DESC
        LIMIT 1`,
      {
        bind: [row.tenant_id, projectId],
        type: (await import('sequelize')).QueryTypes.SELECT,
      },
    );
    const raw = rows[0]?.refs_json ?? null;
    if (raw === null) return null;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed === null || typeof parsed !== 'object') return null;
    // NO SHAPE CHECK HERE ANY MORE. One lived here and survived mutation, because it sits
    // behind a database query and no test could reach it. Amendment 4 gives two options and
    // "untestable where it is" is not one of them, so the check moved INTO the measurements,
    // which take a plain context a test can hand a malformed object to directly.
    return parsed as ManifestRefs;
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'backend',
      event: 'lifecycle_evidence_refs_unavailable',
      outcome: 'partial',
      error_class: e?.name ?? 'UnclassifiedError',
      context: { lifecycle_id: row.id, measured: false },
    }));
    return null;
  }
}

export async function readLifecycleEvidence(row: LifecycleRow): Promise<LifecycleEvidence> {
  // Placeholders for everything unmeasured. Their VALUES carry no meaning — `assessedFields`
  // is the authority, and a predicate that reads one of these without consulting it is a bug
  // (one such bug shipped in attempt 1 and a verifier found it in `blueprint_approved`).
  const base: LifecycleEvidence = {
    // Overwritten by `applyMeasurements` from the map it is handed. An empty set here rather
    // than the module snapshot, so the two cannot agree by coincidence.
    assessedFields: new Set<EvidenceField>(),
    tenantId: row.tenant_id,
    requirementCount: 0,
    requirementsWithoutProvenance: [],
    uncitedRequirementSourceBlocks: [],
    unresolvedSourceBlocks: [],
    processesWithoutTasks: [],
    graphHasStart: false,
    graphHasEnd: false,
    unreachableTasks: [],
    unboundedReworkLoops: [],
    tasksWithoutExecutionClass: [],
    tasksWithoutAccountableHuman: [],
    agentTasksAccountableForThemselves: [],
    tasksUnmappedToSurface: [],
    screensWithoutRationale: [],
    selectedDesignRef: null,
    manifestContentHash: null,
    unknownAllocationCount: 0,
    effortCoverageDisclosed: false,
    proposedBy: null,
    approval: null,
    currentManifestRevision: null,
    actorStillAuthorized: true,
    mustHaveRequirementsWithoutStory: [],
    storiesWithoutTraceability: [],
    releasesWithoutUserVisibleWorkflow: [],
    // Placeholders that BLOCK if they are ever trusted: `false` for both, so a measurement
    // that failed to run leaves `launch_ready` refusing rather than permitting. `assessedFields`
    // is the authority either way — this is the second line of defence, not the first.
    publishedPlanIsSingular: false,
    publishedPlanHashIntact: false,
  };

  return applyMeasurements(base, EVIDENCE_MEASUREMENTS, {
    row,
    refs: await latestManifestRefs(row),
    published: await publishedPlanState(row),
  });
}
