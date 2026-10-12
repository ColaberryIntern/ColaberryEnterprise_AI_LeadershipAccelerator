/**
 * STAGE B's gate: may this project's refined requirements become AUTHORIZED stories?
 *
 * P6-T2's acceptance, in its own words: "requirements can be refined early while authorized
 * stories wait for an approved blueprint/design; asserted as two separately reachable states,
 * with a negative control showing a story cannot be authorized from a refined-but-unapproved
 * requirement set."
 *
 * `extractRequirements` is the refine-early half and needs nothing. This is the other half.
 *
 * ## It does not re-decide what "approved" means
 *
 * The question "is this project's blueprint approved, by an authorised human, against the
 * current revision" already has exactly one answer in this codebase: the `planning` stage's
 * prerequisites. Re-implementing any part of that here would be a second place for it to be
 * wrong, and the four rules it checks (`approval_missing`, `approval_self_approved`,
 * `approval_revision_moved`, `authority_revoked`) were each bought with a Phase 2 packet.
 *
 * So this module does three things and no more: find the lifecycle row, ask the predicate layer,
 * and translate the answer into a verdict a generation path can act on.
 *
 * ## THE CONSEQUENCE THAT MUST NOT BE DISCOVERED LATER
 *
 * Under enforcement, a project with NO lifecycle row is refused. That is the only honest answer
 * -- LC-01 requires that a new-project path "cannot bypass plan authorization", and a missing
 * lifecycle row is the absence of evidence, not evidence of approval.
 *
 * It also means something concrete and sharp: **student `projects` rows do not register
 * lifecycles yet** (P6-T1b, ticket L6.2, blocked). So flipping `ENABLE_PROJECT_LIFECYCLE` before
 * that lands would not merely under-enforce the gate. It would REFUSE EVERY STUDENT BUILD.
 *
 * That is a change of kind from how this risk was previously written down, which said
 * enforcement would "cover delivery projects only". With this gate in place the failure
 * direction inverts from permissive to total refusal, and P6-T1b stops being work that should
 * land before activation and becomes work that MUST.
 *
 * The flag default is off and `enforcementDisabled` is reported rather than silently assumed, so
 * the dark period is visible in logs instead of being inferred from the absence of refusals.
 */
import { FLAGS } from '../../config/featureFlags';
import { readLifecycleEvidence, type LifecycleRow } from '../lifecycle/lifecycleEvidence';
import { prerequisiteGaps, blockingGaps } from '../lifecycle/lifecyclePrerequisites';

export type StoryAuthorizationReason =
  /** The flag is off. Every prior phase shipped behind it; nothing is enforced yet. */
  | 'enforcement_disabled'
  /** Measured: the `planning` stage has no blocking prerequisite gap. */
  | 'blueprint_approved'
  /** No lifecycle row for this project. See the header: this is a refusal, and why. */
  | 'no_lifecycle'
  /** Measured: at least one blocking gap. `gaps` names them. */
  | 'blueprint_not_approved';

export interface StoryAuthorization {
  authorized: boolean;
  reason: StoryAuthorizationReason;
  /**
   * The blocking rules, named.
   *
   * Empty on every authorized verdict. On a refusal it is never empty for
   * `blueprint_not_approved`, because a refusal that cannot say what is missing sends the
   * student to an operator instead of to an action.
   */
  gaps: readonly string[];
}

function log(event: string, outcome: 'success' | 'failure', ctx: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'warn' : 'info',
    service: 'sbp-authorization',
    event,
    outcome,
    context: ctx,
  }));
}

/**
 * Whether stories may be authorized for this student project.
 *
 * NEVER THROWS for a missing project: a refusal is a verdict, not an exception, because the
 * caller has to be able to report it to the student rather than 500. A thrown error here would
 * be indistinguishable from the model being down.
 */
export async function storyAuthorizationFor(studentProjectId: string): Promise<StoryAuthorization> {
  if (!FLAGS.lifecycleEnforcement) {
    // Logged, not silent. "No refusals in the logs" must not be readable as "the gate passed
    // everything"; it currently means the gate was never consulted.
    log('sbp_story_authorization_skipped', 'success', {
      project_id: studentProjectId, reason: 'enforcement_disabled',
    });
    return { authorized: true, reason: 'enforcement_disabled', gaps: [] };
  }

  const { default: ProjectLifecycleState } = await import('../../models/ProjectLifecycleState');
  const row = await ProjectLifecycleState.findOne({ where: { student_project_id: studentProjectId } });
  if (!row) {
    log('sbp_story_authorization_refused', 'failure', {
      project_id: studentProjectId, reason: 'no_lifecycle', error_class: 'ContractViolation',
    });
    return { authorized: false, reason: 'no_lifecycle', gaps: ['lifecycle_unregistered'] };
  }

  const evidence = await readLifecycleEvidence(row as unknown as LifecycleRow);
  const blocking = blockingGaps(prerequisiteGaps('planning', evidence));
  if (blocking.length > 0) {
    const gaps = blocking.map((g) => g.rule);
    log('sbp_story_authorization_refused', 'failure', {
      project_id: studentProjectId, reason: 'blueprint_not_approved', gaps,
    });
    return { authorized: false, reason: 'blueprint_not_approved', gaps };
  }

  log('sbp_story_authorization_granted', 'success', {
    project_id: studentProjectId, reason: 'blueprint_approved',
  });
  return { authorized: true, reason: 'blueprint_approved', gaps: [] };
}

/** The error a generation path throws when it declines to author stories. */
export class StoryNotAuthorizedError extends Error {
  constructor(public readonly verdict: StoryAuthorization) {
    super(
      `stories are not authorized for this project (${verdict.reason}`
      + `${verdict.gaps.length ? ': ' + verdict.gaps.join(', ') : ''})`,
    );
    this.name = 'StoryNotAuthorizedError';
  }
}
