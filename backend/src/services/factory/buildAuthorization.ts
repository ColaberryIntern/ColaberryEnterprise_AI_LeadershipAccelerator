/**
 * buildAuthorization — the SEPARATE build-authorization gate. Modeled on
 * services/delivery/releaseGate.assertDeploymentAuthorized: a pure refusal-returning function, not a config
 * flag. A pursuit approval (qualification) permits ONLY the approved proposal/RFI effort; before any
 * solution-build work runs, a named approver must have recorded a build_authorizations row with an explicit
 * scope and resource limit. Removing this refusal is a CODE change with a review attached — never a flag flip.
 * The autonomous builder stays parked: there is no autobuild service; this gate simply refuses unauthorized
 * builds at the generation/creation paths.
 */

export type BuildAuthReason =
  | 'no_authorization'
  | 'missing_approver'
  | 'missing_scope'
  | 'missing_resource_limit'
  | 'revoked';

export class BuildNotAuthorizedError extends Error {
  constructor(public reason: BuildAuthReason) {
    super(`solution build is not authorized: ${reason}`);
    this.name = 'BuildNotAuthorizedError';
  }
}

export interface BuildAuthorizationLike {
  approver_identity_id?: string | null;
  scope?: string | null;
  resource_limit?: string | null;
  revoked_at?: Date | null;
}

/**
 * PURE gate. Throws BuildNotAuthorizedError unless the authorization is present, not revoked, and carries a
 * named approver + a scope + a resource limit. Requiring all three makes "a build was authorized" a deliberate,
 * attributable act, not an empty row.
 */
export function assertBuildAuthorized(auth: BuildAuthorizationLike | null | undefined): void {
  if (!auth) throw new BuildNotAuthorizedError('no_authorization');
  if (auth.revoked_at) throw new BuildNotAuthorizedError('revoked');
  if (!auth.approver_identity_id || !String(auth.approver_identity_id).trim()) throw new BuildNotAuthorizedError('missing_approver');
  if (!auth.scope || !String(auth.scope).trim()) throw new BuildNotAuthorizedError('missing_scope');
  if (!auth.resource_limit || !String(auth.resource_limit).trim()) throw new BuildNotAuthorizedError('missing_resource_limit');
}

/** The current (non-revoked, newest) build authorization for a delivery project, or null. */
export async function loadBuildAuthorization(deliveryProjectId: string): Promise<BuildAuthorizationLike | null> {
  const { default: BuildAuthorization } = await import('../../models/BuildAuthorization');
  const row: any = await BuildAuthorization.findOne({
    where: { delivery_project_id: deliveryProjectId, revoked_at: null },
    order: [['created_at', 'DESC']],
  });
  return row ? (row.get ? row.get() : row) : null;
}

/** Assert a delivery project has a live build authorization; throws BuildNotAuthorizedError otherwise. */
export async function assertBuildAuthorizedForProject(deliveryProjectId: string): Promise<void> {
  assertBuildAuthorized(await loadBuildAuthorization(deliveryProjectId));
}

export interface AuthorizeBuildInput {
  deliveryProjectId: string;
  govQualificationId?: string | null;
  approverIdentityId: string;
  scope: string;
  rationale?: string | null;
  resourceLimit: string;
}

/**
 * Record a build authorization. Validates the same invariants the gate enforces BEFORE writing (an empty
 * authorization is never persisted), then creates the row. The approver is captured explicitly and is expected
 * to be a different person from the qualification reviewer (enforced at the route).
 */
export async function authorizeBuild(input: AuthorizeBuildInput): Promise<{ id: string }> {
  assertBuildAuthorized({
    approver_identity_id: input.approverIdentityId,
    scope: input.scope,
    resource_limit: input.resourceLimit,
  });
  const { default: BuildAuthorization } = await import('../../models/BuildAuthorization');
  const row: any = await BuildAuthorization.create({
    delivery_project_id: input.deliveryProjectId,
    gov_qualification_id: input.govQualificationId ?? null,
    approver_identity_id: input.approverIdentityId,
    scope: input.scope,
    rationale: input.rationale ?? null,
    resource_limit: input.resourceLimit,
  });
  return { id: row.id };
}
