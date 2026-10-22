/**
 * READINESS: whether a stage's prerequisites are satisfied, and a fingerprint of the evidence
 * that says so. Pure — no I/O, no database, no permissions, no writes.
 *
 * Design: `docs/project-lifecycle/readiness-and-approval-separation.md` §4 and §9 step 1.
 *
 * ## What this is for
 *
 * Nineteen projects carry a lifecycle record in production and NONE has ever advanced past
 * `discovery`, while ten of them have already shipped a published plan. The stage is inert
 * because advancing it has always required a human to go and look, and nothing told anyone
 * there was anything to look at. This module computes the "there is something to look at" half.
 *
 * ## What it deliberately does NOT do
 *
 * - **It does not advance anything.** `evaluateTransition` checks the actor's permission and
 *   returns early before prerequisites are consulted at all, so readiness cannot move a project
 *   even if every field here were forced true. `readinessIsNeverSufficient.test.ts` pins that,
 *   and both mutations against it were measured before this file existed.
 * - **It does not classify hops as automatic.** Which hops a pipeline may advance is a decision
 *   on the design's §8 Q1, still open. `requiredPermission` is reported here because it is a
 *   FACT from `STAGE_PERMISSION`; what that permission means for automation is not decided here.
 * - **It does not re-implement the predicates.** `prerequisiteGaps` is the only authority on
 *   whether a stage is satisfied, and a test pins this module's answer to it across a matrix of
 *   evidence states so the two cannot drift.
 *
 * ## The fingerprint, and why the canonicalisation is generic
 *
 * `evidenceFingerprint` exists so an approval granted on one measurement can be compared against
 * a later one — the same mechanism `blueprintApproval.ts` already uses with `content_sha256`,
 * feeding the `needs_reapproval` condition the stage machine already defines.
 *
 * It walks the object rather than listing fields. A hand-listed canonicaliser goes stale the
 * moment a field is added to `LifecycleEvidence`, and it fails in the worst direction: the new
 * field is simply absent from the hash, so evidence that changed fingerprints as unchanged and
 * a stale approval reads as current. The same reasoning as `evidenceFixture.ts` deriving
 * `assessedFields` from its own keys.
 *
 * Sets and arrays are SORTED before hashing. For `assessedFields` that is required — iteration
 * order is an implementation detail. For the id lists (`requirementsWithoutProvenance` and the
 * rest) it is a deliberate statement that the ORDER of offending ids carries no meaning, only
 * the membership; two measurements that found the same problems in a different order are the
 * same measurement.
 */
import { createHash } from 'crypto';
import {
  prerequisiteGaps,
  satisfied as prerequisitesSatisfied,
  blockingGaps,
  notAssessedGaps,
  advisoryGaps,
  type LifecycleEvidence,
  type PrerequisiteGap,
} from './lifecyclePrerequisites';
import { ADVANCE, LIFECYCLE_STAGES, type LifecycleStage } from './lifecycleStages';
import { STAGE_PERMISSION } from './lifecycleTransition';
import type { DeliveryPermission } from '../../modules/delivery/deliveryRoles';

export interface StageReadiness {
  targetStage: LifecycleStage;
  /** Exactly `satisfied(prerequisiteGaps(targetStage, evidence))`. Never computed another way. */
  satisfied: boolean;
  /** Everything missing, so a surface can show WHY rather than only THAT. */
  blocking: PrerequisiteGap[];
  /** The subset nobody has measured. Blocks like any other gap; separated for the surface. */
  notAssessed: PrerequisiteGap[];
  advisory: PrerequisiteGap[];
  /** sha256 over the evidence this verdict was computed from. */
  evidenceSha256: string;
  /**
   * The permission a caller must hold to enter this stage, from `STAGE_PERMISSION`. Reported as
   * a fact for a surface to render — holding it is checked by `evaluateTransition`, not here.
   */
  requiredPermission: DeliveryPermission;
}

/** JSON-able shape with a deterministic key order, Sets and arrays sorted. */
function canonical(value: unknown): unknown {
  if (value instanceof Set) {
    return [...value].map(String).sort();
  }
  if (Array.isArray(value)) {
    // Sorted on the SERIALISED element, so nested shapes order deterministically too.
    return value.map(canonical).sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonical((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  // `undefined` would vanish from JSON.stringify and make two different objects hash alike.
  return value === undefined ? null : value;
}

export function canonicalEvidence(evidence: LifecycleEvidence): string {
  return JSON.stringify(canonical(evidence));
}

export function evidenceFingerprint(evidence: LifecycleEvidence): string {
  return createHash('sha256').update(canonicalEvidence(evidence)).digest('hex');
}

/** Readiness for one target stage. */
export function readinessFor(
  targetStage: LifecycleStage,
  evidence: LifecycleEvidence,
): StageReadiness {
  const gaps = prerequisiteGaps(targetStage, evidence);
  return {
    targetStage,
    satisfied: prerequisitesSatisfied(gaps),
    blocking: blockingGaps(gaps),
    notAssessed: notAssessedGaps(gaps),
    advisory: advisoryGaps(gaps),
    evidenceSha256: evidenceFingerprint(evidence),
    requiredPermission: STAGE_PERMISSION[targetStage],
  };
}

/**
 * Readiness for every stage that is the target of a forward hop — the twelve a project can
 * advance INTO. `discovery` is excluded because nothing advances into it; a project starts there.
 */
export function readinessAcross(evidence: LifecycleEvidence): StageReadiness[] {
  const targets: LifecycleStage[] = [];
  for (const from of LIFECYCLE_STAGES) {
    const to = ADVANCE[from];
    if (to) targets.push(to);
  }
  return targets.map((target) => readinessFor(target, evidence));
}

/** The next stage a project at `from` could advance into, with its readiness. */
export function nextHopReadiness(
  from: LifecycleStage,
  evidence: LifecycleEvidence,
): StageReadiness | null {
  const to = ADVANCE[from];
  return to ? readinessFor(to, evidence) : null;
}
