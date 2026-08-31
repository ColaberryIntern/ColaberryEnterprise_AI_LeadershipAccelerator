import { evaluateReleaseGate, type ReleaseGateResult } from './releaseGate';
import { resolveProfile } from './profileResolution';
import { isReleaseCheck, type ReleaseCheckResult } from '../../modules/delivery/releaseChecks';

/**
 * releaseManagement — the first code path that consults Gate 13 and Gate 14.
 *
 * Both had zero production callers, and for the same reason as the quality gate:
 * `delivery_releases` did not exist, so there was **no release to ask about**.
 * `evaluateReleaseGate` and `resolveProfile` were complete, tested, and unreachable.
 *
 * ## A release is a record, not a deployment
 *
 * `releaseGate.ts` draws this line itself — `evaluateReleaseGate` answers *readiness* and
 * `assertDeploymentAuthorized` answers *may this be deployed*. Nothing here pushes code.
 * Creating a candidate records an intention and invites the gate to object.
 *
 * ## The profile comes from the project, not the request
 *
 * `delivery_profile_key` is a property of the project. Letting a caller pass one would
 * let them choose which mandatory checks apply to their own release — picking `sandbox`
 * for a government engagement is exactly the move the gate exists to prevent, and it
 * would look like a normal request.
 */

export type ReleaseRefusalReason =
  | 'no_profile_on_project'
  | 'profile_unresolvable'
  | 'unknown_check'
  | 'waiver_needs_reason'
  | 'not_ready'
  | 'already_approved';

export interface ReleaseRefusal {
  ok: false;
  reason: ReleaseRefusalReason;
  message: string;
  issues?: unknown[];
  gate?: ReleaseGateResult;
}

/**
 * Create a release candidate for a project.
 *
 * The profile is resolved at creation and **stored on the row**, so a later change to the
 * project's profile cannot silently re-interpret a release that was already judged. What
 * the gate applied is what the record says it applied.
 */
export async function createReleaseCandidate(input: {
  projectId: string;
  version: string;
  candidateSha?: string | null;
  actorIdentityId?: string | null;
  models: any;
}): Promise<{ ok: true; releaseId: string; profileKey: string } | ReleaseRefusal> {
  const { models } = input;

  const project = await models.DeliveryProject.findOne({ where: { id: input.projectId } });
  if (!project?.delivery_profile_key) {
    // Refused rather than defaulted. Guessing a profile would guess which checks are
    // mandatory, and the safe guess (the strictest) would block ordinary sandbox work
    // while the convenient guess would wave a regulated engagement through.
    return {
      ok: false,
      reason: 'no_profile_on_project',
      message: 'This project has no delivery profile, so there is no basis for release checks.',
    };
  }

  // Gate 13. Version 1 until engagements pin a version of their own — recorded here
  // rather than hidden so the assumption is visible when that changes.
  const resolution = resolveProfile({ profileKey: project.delivery_profile_key, pinnedVersion: 1 });
  if (!resolution.resolved) {
    return {
      ok: false,
      reason: 'profile_unresolvable',
      message: `The project's delivery profile could not be resolved.`,
      issues: resolution.issues,
    };
  }

  const existing = await models.DeliveryRelease.findOne({
    where: { delivery_project_id: input.projectId, version: input.version },
  });
  if (existing) {
    return { ok: true, releaseId: existing.id, profileKey: existing.profile_key };
  }

  const row = await models.DeliveryRelease.create({
    delivery_project_id: input.projectId,
    version: input.version,
    status: 'candidate',
    profile_key: project.delivery_profile_key,
    candidate_sha: input.candidateSha ?? null,
    check_results: [],
    waived_categories: [],
    created_by_identity_id: input.actorIdentityId ?? null,
  });

  return { ok: true, releaseId: row.id, profileKey: row.profile_key };
}

/**
 * Record one release check result.
 *
 * Replaces any prior result for the same check rather than appending: a check has one
 * current answer, and keeping both would leave the gate to pick between a pass and a fail
 * for the same thing. The history of attempts belongs in evidence, not here.
 */
export async function recordReleaseCheck(input: {
  releaseId: string;
  check: string;
  outcome: string;
  detail?: string | null;
  models: any;
}): Promise<{ ok: true; checkCount: number } | ReleaseRefusal> {
  const { models } = input;

  if (!isReleaseCheck(input.check)) {
    // Refused rather than stored. The gate reports an unknown check as a blocker, so
    // accepting it here would mean writing a row that permanently blocks the release.
    return {
      ok: false,
      reason: 'unknown_check',
      message: `'${input.check}' is not a known release check.`,
    };
  }

  const release = await models.DeliveryRelease.findOne({ where: { id: input.releaseId } });
  if (!release) {
    return { ok: false, reason: 'not_ready', message: 'No such release.' };
  }

  const results: ReleaseCheckResult[] = (release.check_results ?? []).filter(
    (r: ReleaseCheckResult) => r.check !== input.check,
  );
  results.push({
    check: input.check as ReleaseCheckResult['check'],
    outcome: input.outcome as ReleaseCheckResult['outcome'],
    detail: input.detail ?? null,
  });

  await release.update({ check_results: results });
  return { ok: true, checkCount: results.length };
}

/**
 * A recorded waiver.
 *
 * The reason travels WITH the waived check rather than in a parallel array, because two
 * arrays that must stay aligned eventually do not. Scenario D exists to catch exactly the
 * failure this shape prevents: the gate stopping for a reason nobody can see afterwards.
 */
export interface ReleaseWaiver {
  check: string;
  reason: string;
  waivedByIdentityId: string | null;
  waivedAt: string;
}

/** The gate takes check names; the record keeps the justification. */
function waivedCheckNames(release: any): string[] {
  return ((release.waived_categories ?? []) as ReleaseWaiver[]).map((w) =>
    typeof w === 'string' ? w : w.check,
  );
}

/**
 * Waive one mandatory check on a release.
 *
 * **A waiver without a reason is refused.** A gate that stops blocking is a governance
 * event, and one recorded with no justification is indistinguishable afterwards from the
 * gate simply not having applied - which is the failure mode scenario D is written to
 * detect. Requiring the reason at the only moment anybody knows it is cheaper than
 * reconstructing it later, when nobody does.
 */
export async function waiveReleaseCheck(input: {
  releaseId: string;
  check: string;
  reason: string;
  actorIdentityId?: string | null;
  models: any;
}): Promise<{ ok: true; waived: ReleaseWaiver[] } | ReleaseRefusal> {
  if (!isReleaseCheck(input.check)) {
    return { ok: false, reason: 'unknown_check', message: `'${input.check}' is not a known release check.` };
  }
  if (!input.reason || !input.reason.trim()) {
    return {
      ok: false,
      reason: 'waiver_needs_reason',
      message: 'A waiver must record why the check was waived.',
    };
  }

  const release = await input.models.DeliveryRelease.findOne({ where: { id: input.releaseId } });
  if (!release) return { ok: false, reason: 'not_ready', message: 'No such release.' };

  // Replaces any prior waiver of the same check, for the same reason recordReleaseCheck
  // replaces a prior result: one current answer per check.
  const existing = ((release.waived_categories ?? []) as ReleaseWaiver[]).filter(
    (w) => (typeof w === 'string' ? w : w.check) !== input.check,
  );
  const waived: ReleaseWaiver[] = [
    ...existing,
    {
      check: input.check,
      reason: input.reason.trim(),
      waivedByIdentityId: input.actorIdentityId ?? null,
      waivedAt: new Date().toISOString(),
    },
  ];

  await release.update({ waived_categories: waived });
  return { ok: true, waived };
}

/** Ask the gate about a release, without changing anything. */
export async function evaluateRelease(input: {
  releaseId: string;
  models: any;
}): Promise<{ ok: true; gate: ReleaseGateResult } | ReleaseRefusal> {
  const release = await input.models.DeliveryRelease.findOne({ where: { id: input.releaseId } });
  if (!release) return { ok: false, reason: 'not_ready', message: 'No such release.' };

  const gate = evaluateReleaseGate({
    profileKey: release.profile_key,
    results: (release.check_results ?? []) as ReleaseCheckResult[],
    waivedCategories: waivedCheckNames(release),
    // Deliberately the STORED approver, not the caller. Evaluating with the requester's
    // id would make the gate's approver_missing rule unreachable — every evaluation would
    // appear to have an approver simply because somebody asked.
    approvedByIdentityId: release.approved_by_identity_id,
    goalsScores: release.goals_scores as never,
  });

  return { ok: true, gate };
}

/**
 * Approve a release. **This is where a person is required.**
 *
 * The gate blocks with `approver_missing` when there is none, and its own comment says a
 * release is approved by a person and never by a pipeline. So approval sets the approver
 * FIRST, re-evaluates, and rolls it back if the gate still refuses — the alternative
 * being to evaluate with a hypothetical approver, which would answer a question about a
 * world that does not exist.
 */
export async function approveRelease(input: {
  releaseId: string;
  approverIdentityId: string;
  models: any;
}): Promise<{ ok: true; gate: ReleaseGateResult } | ReleaseRefusal> {
  const { models } = input;
  const release = await models.DeliveryRelease.findOne({ where: { id: input.releaseId } });
  if (!release) return { ok: false, reason: 'not_ready', message: 'No such release.' };

  if (release.status === 'approved') {
    // Idempotent rather than an error: a retried approval should not look like a second
    // person signing off.
    const gate = evaluateReleaseGate({
      profileKey: release.profile_key,
      results: (release.check_results ?? []) as ReleaseCheckResult[],
      waivedCategories: waivedCheckNames(release),
      approvedByIdentityId: release.approved_by_identity_id,
      goalsScores: release.goals_scores as never,
    });
    return { ok: true, gate };
  }

  const gate = evaluateReleaseGate({
    profileKey: release.profile_key,
    results: (release.check_results ?? []) as ReleaseCheckResult[],
    waivedCategories: waivedCheckNames(release),
    approvedByIdentityId: input.approverIdentityId,
    goalsScores: release.goals_scores as never,
  });

  if (!gate.ready) {
    // Nothing is written. A refused approval must leave no trace of an approver, or the
    // record would show a person signing off on something that never passed.
    return {
      ok: false,
      reason: 'not_ready',
      message: 'The release gate refuses this release.',
      gate,
    };
  }

  await release.update({
    status: 'approved',
    approved_by_identity_id: input.approverIdentityId,
    approved_at: new Date(),
  });

  return { ok: true, gate };
}
