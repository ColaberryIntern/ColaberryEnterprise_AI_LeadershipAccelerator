/**
 * The SEPARATE build gate. A pursuit approval is not a build authorization: solution-build work refuses to run
 * unless a named approver recorded a build_authorizations row with an explicit scope and resource limit, and the
 * row is not revoked. The gate is a pure refusal function (removable only by a code change), and authorizeBuild
 * validates the same invariants BEFORE it ever writes, so an empty authorization is never persisted.
 */
const findOne = jest.fn();
const create = jest.fn();
jest.mock('../../../models/BuildAuthorization', () => ({
  __esModule: true,
  default: { findOne: (...a: any[]) => findOne(...a), create: (...a: any[]) => create(...a) },
}));

import {
  assertBuildAuthorized, assertBuildAuthorizedForProject, authorizeBuild, BuildNotAuthorizedError,
} from '../buildAuthorization';

beforeEach(() => jest.clearAllMocks());

const full = { approver_identity_id: 'app-1', scope: 'proposal-solution', resource_limit: '2 agents / 8h', revoked_at: null };

describe('assertBuildAuthorized (pure refusal)', () => {
  it('passes a complete, non-revoked authorization', () => {
    expect(() => assertBuildAuthorized(full)).not.toThrow();
  });

  it.each([
    ['no_authorization', null],
    ['revoked', { ...full, revoked_at: new Date() }],
    ['missing_approver', { ...full, approver_identity_id: '  ' }],
    ['missing_scope', { ...full, scope: '' }],
    ['missing_resource_limit', { ...full, resource_limit: null }],
  ])('refuses with reason %s', (reason, auth) => {
    try { assertBuildAuthorized(auth as any); throw new Error('should have thrown'); }
    catch (e: any) { expect(e).toBeInstanceOf(BuildNotAuthorizedError); expect(e.reason).toBe(reason); }
  });
});

describe('assertBuildAuthorizedForProject', () => {
  it('refuses when the project has no live authorization', async () => {
    findOne.mockResolvedValue(null);
    await expect(assertBuildAuthorizedForProject('dp-1')).rejects.toBeInstanceOf(BuildNotAuthorizedError);
  });

  it('passes when a live authorization exists', async () => {
    findOne.mockResolvedValue({ get: () => full });
    await expect(assertBuildAuthorizedForProject('dp-1')).resolves.toBeUndefined();
  });
});

describe('authorizeBuild (validate-before-write)', () => {
  it('refuses to persist an authorization missing a resource limit', async () => {
    await expect(authorizeBuild({ deliveryProjectId: 'dp-1', approverIdentityId: 'app-1', scope: 's', resourceLimit: '' }))
      .rejects.toBeInstanceOf(BuildNotAuthorizedError);
    expect(create).not.toHaveBeenCalled();
  });

  it('writes a complete authorization and returns its id', async () => {
    create.mockResolvedValue({ id: 'ba-1' });
    const out = await authorizeBuild({ deliveryProjectId: 'dp-1', govQualificationId: 'q1', approverIdentityId: 'app-1', scope: 'proposal-solution', resourceLimit: '2 agents / 8h' });
    expect(out.id).toBe('ba-1');
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({ delivery_project_id: 'dp-1', approver_identity_id: 'app-1', scope: 'proposal-solution', resource_limit: '2 agents / 8h' });
  });
});
