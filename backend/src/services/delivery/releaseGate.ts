/**
 * releaseGate — may this release ship, and may anything deploy it? PURE, no I/O.
 *
 * Master plan §Gate 14, two sentences that govern this module:
 *
 *   > Deployment provider must be abstracted and human-approved by policy.
 *   > **This master plan does NOT authorize production deployment.**
 *
 * ## Readiness and authorization are different questions
 *
 * A release can be *ready* — every mandatory check passed, a human approved it — and still
 * not be *authorized to deploy*, because §20 withholds that authorization from this entire
 * body of work. Collapsing the two would mean the day someone implements a
 * `DeploymentProvider`, a ready release becomes a deployed one with nothing in between.
 *
 * So `evaluateReleaseGate` answers readiness, `assertDeploymentAuthorized` answers
 * authorization, and the second currently always refuses. Gate 8 declared
 * `DeploymentProvider` and deliberately left it unimplemented; this is the policy half of
 * that same control.
 */

import {
  mandatoryChecksFor,
  isReleaseCheck,
  type ReleaseCheck,
  type ReleaseCheckResult,
} from '../../modules/delivery/releaseChecks';
import {
  goalsGateFailures,
  type GoalsScores,
  type GoalsThreshold,
} from '../../modules/delivery/inpact';

export interface ReleaseGateInput {
  profileKey: string;
  results: readonly ReleaseCheckResult[];
  /** Categories waived on the record by the contract (Gate 13). */
  waivedCategories?: readonly string[];
  /** Who approved this release. A release is approved by a person, never by a pipeline. */
  approvedByIdentityId?: string | null;
  /** Ongoing-trust scores, assessed with the canonical book's GOALS definitions. */
  goalsScores?: GoalsScores | null;
  goalsThreshold?: GoalsThreshold | null;
}

export interface ReleaseBlocker {
  check: ReleaseCheck | '(release)';
  rule: string;
  detail: string;
}

export interface ReleaseGateResult {
  ready: boolean;
  mandatory: readonly ReleaseCheck[];
  passed: ReleaseCheck[];
  blockers: ReleaseBlocker[];
  /** Waived checks, surfaced so "ready" is never quietly cheaper than it looks. */
  waived: ReleaseCheck[];
}

/**
 * Evaluate release readiness.
 *
 * Returns every blocker rather than the first. Someone unblocking a release should see the
 * whole list, not discover it one CI run at a time.
 */
export function evaluateReleaseGate(input: ReleaseGateInput): ReleaseGateResult {
  const mandatory = mandatoryChecksFor(input.profileKey);
  const blockers: ReleaseBlocker[] = [];
  const passed: ReleaseCheck[] = [];
  const waived: ReleaseCheck[] = [];

  const add = (check: ReleaseBlocker['check'], rule: string, detail: string) =>
    blockers.push({ check, rule, detail });

  const byCheck = new Map<string, ReleaseCheckResult>();
  for (const result of input.results ?? []) {
    if (!isReleaseCheck(result.check)) {
      add('(release)', 'unknown_check', `'${result.check}' is not a release check.`);
      continue;
    }
    byCheck.set(result.check, result);
  }

  const waivedSet = new Set(input.waivedCategories ?? []);

  for (const check of mandatory) {
    // A waiver recorded at Gate 13 carries through to the release gate. It does NOT make
    // the check disappear — it moves it into `waived`, where the release notes can see it.
    if (waivedSet.has(check)) {
      waived.push(check);
      continue;
    }

    const result = byCheck.get(check);
    if (!result) {
      add(check, 'check_missing', `Mandatory check '${check}' has no recorded result.`);
      continue;
    }
    if (result.outcome === 'pass') {
      passed.push(check);
      continue;
    }
    add(
      check,
      result.outcome === 'not_run' ? 'check_not_run' : 'check_failed',
      `'${check}' recorded '${result.outcome}'` +
        `${result.detail ? `: ${result.detail}` : ''}. 'not_run' is not 'pass'.`,
    );
  }

  // A release is approved by a person. Every other blocker here can in principle be
  // satisfied by a machine; this one cannot, and that is the point of it.
  if (!input.approvedByIdentityId) {
    add('(release)', 'approver_missing', 'A release must record the person who approved it.');
  }

  // Ongoing trust, per the canonical book. An unscored dimension is a failure, not a pass —
  // `goalsGateFailures` already takes that line, so this composes it rather than restating.
  if (input.goalsThreshold) {
    const failures = goalsGateFailures(input.goalsScores ?? {}, input.goalsThreshold);
    for (const failure of failures) {
      add(
        '(release)',
        'goals_below_threshold',
        `GOALS '${failure.dimension}' is ${failure.actual ?? 'unscored'}, ` +
          `required ${failure.required}.`,
      );
    }
  }

  return { ready: blockers.length === 0, mandatory, passed, blockers, waived };
}

export interface DeploymentAuthorizationRefusal {
  rule: string;
  detail: string;
}

/**
 * May anything actually deploy this?
 *
 * **Always refuses.** Master plan §20 authorizes repository implementation and
 * local/test/staging-safe validation only. This is deliberately a function that cannot
 * currently return an authorization rather than a flag someone can flip in config: a
 * config flag is changed by whoever is in a hurry, whereas removing this refusal is a code
 * change with a review attached.
 *
 * Gate 8's `executionPolicy` records `production_deploy` as enforced by `no_provider` — the
 * absence of a `DeploymentProvider` implementation. This is the second layer: even with a
 * provider, policy still says no until §20 changes.
 */
export function assertDeploymentAuthorized(input: {
  release: ReleaseGateResult;
  approvedByIdentityId?: string | null;
}): DeploymentAuthorizationRefusal[] {
  const refusals: DeploymentAuthorizationRefusal[] = [];

  if (!input.release.ready) {
    refusals.push({
      rule: 'release_not_ready',
      detail: `Release has ${input.release.blockers.length} unresolved blocker(s).`,
    });
  }

  if (!input.approvedByIdentityId) {
    refusals.push({
      rule: 'human_approval_required',
      detail: 'Deployment must be approved by a named person, by policy (master plan §Gate 14).',
    });
  }

  // The unconditional one. Listed last so the specific problems above are visible too —
  // a caller fixing their release should not have to fix it twice.
  refusals.push({
    rule: 'not_authorized_by_plan',
    detail:
      'Master plan §20 does not authorize production deployment. This refusal is ' +
      'unconditional and is removed by a code change with a review, not by configuration.',
  });

  return refusals;
}
