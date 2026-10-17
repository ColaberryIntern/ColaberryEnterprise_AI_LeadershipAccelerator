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
 * It also meant something concrete and sharp, and the prediction was correct. This header used
 * to say student `projects` rows do not register lifecycles yet (P6-T1b, blocked), so flipping
 * the flag would REFUSE EVERY STUDENT BUILD. P6-T1b has since landed: the hook is on the model
 * and, measured in production on 2026-10-14, ten of ten projects created after it shipped hold
 * exactly one lifecycle row each.
 *
 * BUT 62 PROJECTS PREDATE IT AND HOLD NO ROW. Refusing those would break every legacy build for
 * a rule that did not exist when they were created, which is why this gate stayed unwired from
 * the generator even after the flag went on. So `no_lifecycle` is no longer one verdict:
 *
 *   created BEFORE `STUDENT_REGISTRATION_LIVE_SINCE` -> `legacy_compatibility`, PERMITTED
 *   created ON OR AFTER                              -> `no_lifecycle`, REFUSED
 *
 * The second is not leniency lost. The hook sits on the MODEL, so after the cutoff a missing row
 * means a project was created outside the model entirely — the bypass LC-01 forbids. The cutoff
 * is the same constant `unregisteredStudentProjectsSince` uses to hunt those bypasses, so the
 * gate and the detector agree by construction rather than by coincidence.
 *
 * This is P8-T4's own clause: "old projects retain compatibility mode".
 *
 * AND THAT CLAUSE DID NOT WORK. Measured against production on 2026-10-17 by running this
 * function over all 72 real student projects: every one of the 62 legacy projects was REFUSED
 * `no_lifecycle`, logging `project_created_at: null`, rather than permitted. The compatibility
 * branch read `project.created_at`, which is `undefined` on a real `Project` instance — see
 * `projectCreationTime` below for why — and the `&&` guard turned that undefined into a silent
 * refusal. The protection everyone relied on to make arming this gate safe was dead code, and
 * arming it would have refused all 72 projects rather than the 10 the design intended.
 *
 * No test caught it because the `Project.findByPk` mock returned a plain object literal carrying
 * `created_at`: the shape of the TypeScript type rather than of the runtime instance. The test was
 * green, named "PERMITS a project that predates the registration hook", and certified a branch
 * that could not be taken. The mock now mimics a Sequelize instance, so it fails against the old
 * reader.
 *
 * The flag default is off and `enforcementDisabled` is reported rather than silently assumed, so
 * the dark period is visible in logs instead of being inferred from the absence of refusals.
 */
import { FLAGS } from '../../config/featureFlags';
import { readLifecycleEvidence, type LifecycleRow } from '../lifecycle/lifecycleEvidence';
import { prerequisiteGaps, blockingGaps } from '../lifecycle/lifecyclePrerequisites';
import { STUDENT_REGISTRATION_LIVE_SINCE } from '../lifecycle/projectLifecycleRegistration';

export type StoryAuthorizationReason =
  /** The flag is off. Every prior phase shipped behind it; nothing is enforced yet. */
  | 'enforcement_disabled'
  /** Measured: the `planning` stage has no blocking prerequisite gap. */
  | 'blueprint_approved'
  /**
   * No lifecycle row AND the project predates the registration hook. PERMITTED.
   *
   * P8-T4's compatibility clause. Distinct from `enforcement_disabled`, which is global and
   * temporary; this is per project and permanent for that project.
   */
  | 'legacy_compatibility'
  /**
   * No lifecycle row on a project created AFTER the hook shipped. REFUSED.
   *
   * Narrower than it was: this now means a project was created outside the model the hook sits
   * on, which is the bypass LC-01 forbids — not merely that registration had not shipped.
   */
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
 * The project's creation time, read the way Sequelize actually exposes it.
 *
 * `Project` is initialised with `timestamps: true, underscored: true`, so the Sequelize
 * ATTRIBUTE is `createdAt`, mapped to the `created_at` COLUMN. The model separately carries
 * `declare created_at: Date`, and `declare` is a TYPE-ONLY declaration that emits no runtime
 * property. `created_at` is also absent from the `Project.init()` attribute block. So
 * `project.created_at` type-checks as a `Date` and evaluates to `undefined` — `tsc` cannot see
 * the problem and 141 of this repo's 447 models carry the same declaration shape.
 *
 * Measured on a real production instance, 2026-10-17:
 *
 *   column created_at            2026-04-02T17:33:42.613Z
 *   project.created_at           undefined
 *   project.createdAt            Date(2026-04-02T17:33:42.613Z)
 *   'created_at' in attributes   false
 *   'createdAt'  in attributes   true
 *
 * Reads the Sequelize accessor first, then the camelCase attribute, then a snake_case property.
 * The last is for plain objects only; this gate's own tests deliberately use an instance-shaped
 * mock WITHOUT `created_at`, so they cannot pass on that fallback alone.
 */
function projectCreationTime(project: unknown): Date | null {
  const p = project as {
    get?: (key: string) => unknown;
    createdAt?: unknown;
    created_at?: unknown;
  };
  const candidate = (typeof p.get === 'function' ? p.get('createdAt') : undefined)
    ?? p.createdAt
    ?? p.created_at;

  if (candidate instanceof Date) return Number.isNaN(candidate.getTime()) ? null : candidate;
  if (typeof candidate === 'string' || typeof candidate === 'number') {
    const parsed = new Date(candidate);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
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
    // COMPATIBILITY MODE. A missing row means two different things either side of the cutoff, so
    // the project's own creation date decides, not a global switch. See the header.
    const { default: Project } = await import('../../models/Project');
    const project = await Project.findByPk(studentProjectId);

    if (!project) {
      // Absence of a project is absence of evidence. Permitting here would make the gate
      // bypassable by passing an id that does not exist.
      log('sbp_story_authorization_refused', 'failure', {
        project_id: studentProjectId, reason: 'no_lifecycle', error_class: 'ContractViolation',
        detail: 'project_not_found',
      });
      return { authorized: false, reason: 'no_lifecycle', gaps: ['project_not_found'] };
    }

    // Read through `projectCreationTime`, NOT `project.created_at`: that property is undefined on
    // a real Sequelize instance, which silently refused all 62 legacy projects. See the header.
    const createdAt = projectCreationTime(project);

    // `< cutoff`, never `<=`: the cutoff is the instant the hook went live, so a project created
    // AT it is covered by the hook and a missing row is already a bypass.
    if (createdAt && createdAt < STUDENT_REGISTRATION_LIVE_SINCE) {
      log('sbp_story_authorization_granted', 'success', {
        project_id: studentProjectId, reason: 'legacy_compatibility',
        project_created_at: createdAt.toISOString(),
        cutoff: STUDENT_REGISTRATION_LIVE_SINCE.toISOString(),
      });
      return { authorized: true, reason: 'legacy_compatibility', gaps: [] };
    }

    // `project_created_at: null` here now means the row genuinely has no creation time, rather
    // than the reader having looked at the wrong property. That distinction is why this log line
    // is the thing that exposed the defect: 62 refusals all carrying null is not a data pattern.
    log('sbp_story_authorization_refused', 'failure', {
      project_id: studentProjectId, reason: 'no_lifecycle', error_class: 'ContractViolation',
      project_created_at: createdAt ? createdAt.toISOString() : null,
      cutoff: STUDENT_REGISTRATION_LIVE_SINCE.toISOString(),
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
