/**
 * The lifecycle stage machine — the thirteen stages and every legal transition between them.
 *
 * This is the vocabulary half of the lifecycle: no I/O, no database, no prerequisites. The
 * typed prerequisites live in `lifecyclePrerequisites.ts` and the command that applies a
 * transition lives in `lifecycleTransition.ts`, so each can be tested on its own.
 *
 * THE DEFAULT IS DENY. `LEGAL` is an allow-list: a pair absent from it is refused. That is
 * deliberately the same shape as `factoryApproval.ts`'s `LEGAL: Record<DocStatus, DocStatus[]>`,
 * which this repo already proved out — a table is auditable in a way a chain of `if`s is not.
 *
 * CONDITIONS ARE NOT STAGES. `blocked` / `failed` / `awaiting_input` / `needs_reapproval` are
 * recorded ALONGSIDE a stage, never instead of one, so the stage to resume FROM always survives.
 * A provider failure at `process_ready` leaves ('process_ready', 'failed'). If `failed` were a
 * stage, the resume point would be gone and recovery would mean guessing.
 *
 * Decision record: docs/project-lifecycle/architecture.md §3.
 */

export const LIFECYCLE_STAGES = [
  'discovery',
  'requirements_ready',
  'process_ready',
  'allocation_ready',
  'design_ready',
  'awaiting_blueprint_approval',
  'blueprint_approved',
  'planning',
  'plan_ready',
  'building',
  'release_review',
  'launch_ready',
  'operating',
] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

/**
 * A condition is an orthogonal annotation on a stage, not a stage.
 *
 * `needs_reapproval` is the one with teeth: it is set by any return edge that crosses
 * `blueprint_approved`, and it is what blocks downstream work that was authorized against a
 * revision which has since been superseded.
 */
export const LIFECYCLE_CONDITIONS = ['blocked', 'failed', 'awaiting_input', 'needs_reapproval'] as const;
export type LifecycleCondition = (typeof LIFECYCLE_CONDITIONS)[number];

/** The stage at which a project's implementation plan may first be authorized. */
export const AUTHORIZATION_STAGE: LifecycleStage = 'blueprint_approved';

/**
 * Stages at or beyond which an approved blueprint revision is a prerequisite. Work in any of
 * these was authorized against a specific revision, so a material change upstream must mark it
 * `needs_reapproval` rather than let it proceed on stale evidence.
 */
export const POST_APPROVAL_STAGES: ReadonlySet<LifecycleStage> = new Set<LifecycleStage>([
  'blueprint_approved', 'planning', 'plan_ready', 'building', 'release_review', 'launch_ready', 'operating',
]);

/** Forward edges: the single stage each stage may advance to. `operating` is steady state. */
export const ADVANCE: Readonly<Record<LifecycleStage, LifecycleStage | null>> = {
  discovery: 'requirements_ready',
  requirements_ready: 'process_ready',
  process_ready: 'allocation_ready',
  allocation_ready: 'design_ready',
  design_ready: 'awaiting_blueprint_approval',
  awaiting_blueprint_approval: 'blueprint_approved',
  blueprint_approved: 'planning',
  planning: 'plan_ready',
  plan_ready: 'building',
  building: 'release_review',
  release_review: 'launch_ready',
  launch_ready: 'operating',
  operating: null,
};

/**
 * Return edges, each with a reason. A return is not a failure — it is how a change gets made
 * without abandoning the project.
 *
 * `awaiting_blueprint_approval` returns to whichever stage OWNS the change, which is why it has
 * four of them: a reviewer saying "the allocation is wrong" should land at `allocation_ready`,
 * not at the start.
 *
 * `operating` returns to approval rather than being a dead end, because change after launch is
 * the normal case, not an exception.
 */
export const RETURN: Readonly<Record<LifecycleStage, ReadonlyArray<LifecycleStage>>> = {
  discovery: [],
  requirements_ready: ['discovery'],
  process_ready: ['requirements_ready'],
  allocation_ready: ['process_ready'],
  design_ready: ['allocation_ready'],
  awaiting_blueprint_approval: ['requirements_ready', 'process_ready', 'allocation_ready', 'design_ready'],
  blueprint_approved: ['awaiting_blueprint_approval'],
  planning: ['awaiting_blueprint_approval'],
  plan_ready: ['planning'],
  building: ['plan_ready'],
  release_review: ['building'],
  launch_ready: ['release_review'],
  operating: ['awaiting_blueprint_approval'],
};

/** The full allow-list, forward and return edges combined. Anything absent is refused. */
export const LEGAL: Readonly<Record<LifecycleStage, ReadonlyArray<LifecycleStage>>> =
  Object.fromEntries(
    LIFECYCLE_STAGES.map((s) => {
      const fwd = ADVANCE[s];
      return [s, fwd ? [fwd, ...RETURN[s]] : [...RETURN[s]]];
    }),
  ) as Record<LifecycleStage, ReadonlyArray<LifecycleStage>>;

export function isLifecycleStage(value: unknown): value is LifecycleStage {
  return typeof value === 'string' && (LIFECYCLE_STAGES as ReadonlyArray<string>).includes(value);
}

export function isLifecycleCondition(value: unknown): value is LifecycleCondition {
  return typeof value === 'string' && (LIFECYCLE_CONDITIONS as ReadonlyArray<string>).includes(value);
}

/**
 * Is this transition in the allow-list? Unknown stages are refused rather than throwing, so a
 * malformed stored value cannot crash a read path — the caller reports it as an illegal
 * transition, which is what it is.
 */
export function canTransition(from: unknown, to: unknown): boolean {
  if (!isLifecycleStage(from) || !isLifecycleStage(to)) return false;
  return LEGAL[from].includes(to);
}

/** A return edge moves backwards; an advance moves forwards. Used to decide reapproval. */
export function isReturnEdge(from: LifecycleStage, to: LifecycleStage): boolean {
  return RETURN[from].includes(to);
}

/**
 * Does this transition invalidate work that was authorized against an approved revision?
 *
 * True when leaving a post-approval stage by a return edge — i.e. the project had an approved
 * blueprint and is now going back to change something. The caller sets `needs_reapproval` so the
 * downstream work cannot quietly continue against the superseded revision. This is the policy
 * expression of the LC-13 lesson: regenerating a draft must not erase a pending human review,
 * and changed work must not slip through on stale evidence.
 *
 * Note what this deliberately EXCLUDES: a return edge that stays inside the post-approval band,
 * such as `plan_ready` → `planning` or `building` → `plan_ready`. Those are plan or build rework
 * against an approval that is still valid, so forcing reapproval there would train owners to
 * click through it — which is how an approval gate stops meaning anything.
 */
export function crossesApprovalBoundary(from: LifecycleStage, to: LifecycleStage): boolean {
  return POST_APPROVAL_STAGES.has(from) && isReturnEdge(from, to) && !POST_APPROVAL_STAGES.has(to);
}

/** Zero-based position, for rendering "stage 4 of 13" and for ordering comparisons. */
export function stageIndex(stage: LifecycleStage): number {
  return LIFECYCLE_STAGES.indexOf(stage);
}

/** Every stage before this one, i.e. the completed stages, for the lifecycle header. */
export function completedStages(stage: LifecycleStage): ReadonlyArray<LifecycleStage> {
  return LIFECYCLE_STAGES.slice(0, stageIndex(stage));
}
