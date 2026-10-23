/**
 * The four hops the pipeline may advance by itself, and the reasons it may not advance anything
 * else. The decision half is pure; the write is a compare-and-swap.
 *
 * Design: `readiness-and-approval-separation.md` §3, with the DRI's answers of 2026-10-23 —
 * `operating` IS automatic (Q1: A) and there is no feature flag (Q2: B).
 *
 * ## Why this is a separate command and not a flag on `evaluateTransition`
 *
 * The obvious implementation is to call `evaluateTransition` with
 * `actorPermissions: [STAGE_PERMISSION[to]]` - the pipeline asserting it holds whatever the hop
 * needs. That works, and it is wrong: it makes a system identity pass a permission check by
 * claiming the permission, which is one careless argument away from claiming
 * `contract.approve`.
 *
 * This command instead cannot be pointed at an approval at all. `WORK_HOPS` is its entire
 * universe of reachable targets, and a target outside it is refused by structure rather than by
 * a conditional someone could invert. `evaluateTransition` keeps its permission check untouched,
 * and `readinessIsNeverSufficient.test.ts` keeps guarding it.
 *
 * ## The act must MATCH the hop
 *
 * Carrying `performedAct` is not enough - it has to be the permission that hop requires. Without
 * that, a caller could advance `building` by reporting it had done `project.write`. The pipeline
 * is claiming "I did the work this stage is made of", and the table is what makes that claim
 * checkable.
 *
 * ## What it still cannot skip
 *
 * Readiness. A work hop with unmet prerequisites is refused like any other. Automatic means
 * nobody has to click, not that the evidence stops mattering.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import { ADVANCE, type LifecycleStage } from './lifecycleStages';
import { STAGE_PERMISSION } from './lifecycleTransition';
import type { DeliveryPermission } from '../../modules/delivery/deliveryRoles';
import type { StageReadiness } from './lifecycleReadiness';

/**
 * The hops whose permission describes PERFORMING WORK rather than approving or reviewing it,
 * and which the build pipeline therefore actually performs.
 *
 * Derived from `STAGE_PERMISSION` at module load rather than hand-copied, so a change to that
 * table cannot leave this list quietly disagreeing with it. The four permissions below are the
 * non-approve, non-review ones; `releasesAreWork` records the DRI's Q1 answer explicitly.
 */
const WORK_PERMISSIONS: ReadonlySet<string> = new Set<string>([
  'project.write',   // submitting FOR approval is not approving - the code says so already
  'story.write',     // the pipeline writes the stories
  'story.execute',   // and executes them
  'release.deploy',  // and deploys. Q1: A - `operating` is automatic, because the approval that
                     // matters (release.approve -> launch_ready) happened the hop before.
]);

export const WORK_HOPS: ReadonlyMap<LifecycleStage, DeliveryPermission> = (() => {
  const out = new Map<LifecycleStage, DeliveryPermission>();
  for (const [stage, permission] of Object.entries(STAGE_PERMISSION) as Array<
    [LifecycleStage, DeliveryPermission]
  >) {
    if (WORK_PERMISSIONS.has(permission)) out.set(stage, permission);
  }
  return out;
})();

export type AutoAdvanceRefusal =
  | 'not_a_work_hop'      // the target is an approval or a review; a human owns it
  | 'act_does_not_match'  // the act reported is not the work this hop is made of
  | 'illegal_edge'        // not the forward hop from `from`
  | 'not_ready'           // prerequisites unmet
  | 'stage_moved';        // the CAS lost: something else advanced first

export interface AutoAdvanceDecision {
  allowed: boolean;
  from: LifecycleStage;
  to: LifecycleStage | null;
  refusal?: AutoAdvanceRefusal;
  message: string;
}

function no(
  refusal: AutoAdvanceRefusal,
  message: string,
  from: LifecycleStage,
  to: LifecycleStage | null,
): AutoAdvanceDecision {
  return { allowed: false, from, to, refusal, message };
}

/**
 * May the pipeline advance from `from`, having performed `performedAct`, given `readiness`?
 *
 * Pure. The write is `autoAdvance` below, which calls this first and refuses to proceed without
 * an allowed decision.
 */
export function mayAutoAdvance(input: {
  from: LifecycleStage;
  performedAct: string;
  readiness: StageReadiness;
}): AutoAdvanceDecision {
  const { from, performedAct, readiness } = input;
  const to = ADVANCE[from];

  if (!to) return no('illegal_edge', `${from} is the end of the chain.`, from, null);

  if (readiness.targetStage !== to) {
    return no(
      'illegal_edge',
      `Readiness was measured for ${readiness.targetStage}, not for ${to}.`,
      from,
      to,
    );
  }

  // THE STRUCTURAL REFUSAL. An approval or review hop is not in WORK_HOPS and therefore cannot
  // be reached from here at all, whatever the caller passes.
  const required = WORK_HOPS.get(to);
  if (!required) {
    return no(
      'not_a_work_hop',
      `Entering ${to} requires ${STAGE_PERMISSION[to]}, which a person holds. The pipeline `
      + 'does not advance approvals or reviews.',
      from,
      to,
    );
  }

  if (performedAct !== required) {
    return no(
      'act_does_not_match',
      `${to} is made of ${required}; the act reported was ${performedAct}.`,
      from,
      to,
    );
  }

  if (!readiness.satisfied) {
    return no(
      'not_ready',
      `${to} is not ready: ${readiness.blocking.length} thing(s) still missing.`,
      from,
      to,
    );
  }

  return { allowed: true, from, to, message: `Advanced to ${to} on recorded ${required}.` };
}

/**
 * Apply an automatic advance, if the decision allows it.
 *
 * The UPDATE is scoped to the stage we decided FROM, the same compare-and-swap
 * `requestTransition` uses: two callers cannot both apply a transition, and the loser updates
 * zero rows and is told the stage moved rather than overwriting it.
 */
export async function autoAdvance(input: {
  lifecycleStateId: string;
  from: LifecycleStage;
  performedAct: string;
  readiness: StageReadiness;
}): Promise<AutoAdvanceDecision> {
  const decision = mayAutoAdvance(input);
  if (!decision.allowed || !decision.to) return decision;

  const updated = await sequelize.query(
    `UPDATE project_lifecycle_states
        SET stage = :to, condition = NULL, condition_reason = NULL, updated_at = NOW()
      WHERE id = :id AND stage = :from`,
    {
      replacements: { id: input.lifecycleStateId, to: decision.to, from: input.from },
      type: QueryTypes.UPDATE,
    },
  );

  // Sequelize reports [results, rowCount] for UPDATE on Postgres; the count is what matters.
  const rowCount = Array.isArray(updated) ? Number(updated[1] ?? 0) : 0;
  if (rowCount !== 1) {
    return no(
      'stage_moved',
      `The project is no longer at ${input.from}; nothing was advanced.`,
      input.from,
      decision.to,
    );
  }

  return decision;
}
