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
import type { ManifestRefs } from './adapters/manifestRefs';
import { requirementsNeedingCoverage } from './adapters/sbpAdapter';
import {
  requirementsWithoutStory,
  storiesWithoutTraceability as storiesMissingCitations,
  releasesWithoutUserVisibleWorkflow,
  type StoryLike,
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
   * The project's PUBLISHED build plan, or `null`.
   *
   * `null` is load-bearing and means the same three things `refs: null` means: no plan exists,
   * the project is not a student build at all, or the read failed. It NEVER means an empty
   * plan. Every measurement that reads this returns NOT_MEASURED on `null`, so a project whose
   * plan could not be read blocks on `not_assessed` rather than passing with no gaps found.
   *
   * It is resolved BEFORE `applyMeasurements` because `Measurement` is synchronous and pure —
   * the same reason `refs` is resolved here rather than inside a measurement.
   */
  plan: PlanLike | null;
}

/**
 * The part of a build plan these measurements read.
 *
 * Structural, not imported from `services/sbp`: the lifecycle coordinator stays ignorant of
 * SBP's plan model, which is the same reason `adapters/sbpAdapter.ts` declares its own `*Like`
 * shapes. SBP's `BuildPlan` satisfies this.
 */
export interface PlanLike {
  requirements?: ReadonlyArray<{ id: string; kind?: string | null; priority?: string | null }> | null;
  releases?: ReadonlyArray<{ key: string }> | null;
  stories?: ReadonlyArray<StoryLike> | null;
}

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
interface SourceLike { id: string; state?: unknown; provenanceKind?: unknown }

function readableSources(ctx: EvidenceContext): ReadonlyArray<SourceLike> | null {
  const list: unknown = ctx.refs?.sources;
  if (!Array.isArray(list)) return null;
  const readable = list.every((x) => x !== null
    && typeof x === 'object'
    && typeof (x as { id?: unknown }).id === 'string');
  return readable ? (list as ReadonlyArray<SourceLike>) : null;
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
    const plan = ctx.plan;
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
    const plan = ctx.plan;
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
    const plan = ctx.plan;
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

  // DELIBERATELY NOT `requirementCount: refs.sources.length`. `SourceRef` is documented as "a
  // requirement OR OTHER CAPTURED STATEMENT", so sources is a superset of requirements and
  // equating them would publish a count that means something slightly different from its name.
  // That is the shape of error this phase has been caught on repeatedly, and it is cheaper to
  // leave the field unassessed — where it BLOCKS — than to measure it approximately.
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
/**
 * The project's published build plan, or `null`.
 *
 * Mirrors `latestManifestRefs` below: module-private, dynamic import so nothing connects at
 * module load, raw SQL rather than importing SBP's `planStore` (which would couple the
 * coordinator to SBP's service layer), and `null` on ANY failure.
 *
 * STUDENT PROJECTS ONLY, and that is a fact about the product rather than a shortcut:
 * `build_plans.project_id` is a `projects` id. A delivery project has no SBP build plan to
 * read, so it returns `null` and every plan-derived measurement reports NOT_MEASURED for it.
 * That is the honest answer — the traceability of a delivery project is the Factory's contract,
 * not an SBP plan — and it must not be confused with "measured, no gaps".
 *
 * Reads the PUBLISHED plan, not the latest draft. A draft is a proposal nobody authorized, and
 * judging a stage's prerequisites against one would let an unapproved edit satisfy a gate.
 */
async function latestPublishedPlan(row: LifecycleRow): Promise<PlanLike | null> {
  if (row.student_project_id === null) return null;
  try {
    const { sequelize } = await import('../../config/database');
    const rows = await sequelize.query<{ plan_json: unknown }>(
      `SELECT plan_json
         FROM build_plans
        WHERE project_id = $1 AND status = 'published'
        ORDER BY version DESC
        LIMIT 1`,
      {
        bind: [row.student_project_id],
        type: (await import('sequelize')).QueryTypes.SELECT,
      },
    );
    const raw = rows[0]?.plan_json ?? null;
    // `plan_json` is JSONB and arrives parsed, but a string is possible if a writer ever stored
    // text. Parse defensively and fall back to null rather than throwing inside a gatherer whose
    // whole contract is that an unreadable input yields NOT_MEASURED.
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed === null || typeof parsed !== 'object') return null;
    return parsed as PlanLike;
  } catch {
    return null;
  }
}

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
  };

  return applyMeasurements(base, EVIDENCE_MEASUREMENTS, {
    row,
    refs: await latestManifestRefs(row),
    plan: await latestPublishedPlan(row),
  });
}
