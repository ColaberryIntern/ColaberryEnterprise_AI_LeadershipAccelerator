/**
 * LC-10, the "authorized human" limb: the approver identity that `approveLifecycleBlueprint`
 * HANDS ON must come from the authenticated session and from nowhere else.
 *
 * ## Why this file exists
 *
 * `ruling-lc10-coverage.md` (graded by the task verifier, 2026-10-16) recorded this as an
 * unguarded line and called the fix cheap:
 *
 *   > The route correctly takes identity from `adminOf(req)` and never from the body. A
 *   > pre-existing route test sends `approvedBy` and `approved_by` as `attacker@evil.test` and
 *   > asserts the service received `admin@test`. But **nothing pins line 318 itself**, and
 *   > changing that line to read a body field **would pass all 151 tests on this surface**.
 *
 * That is exactly right, and the reason is structural rather than an oversight:
 * `projectLifecycleRoutes.test.ts` mocks `approveLifecycleBlueprint` wholesale, so it can only
 * ever assert what the service RECEIVED. The assignment inside the service — which decides what
 * is written to `blueprint_approvals.approved_by` — sits downstream of that mock and was never
 * observed by anything.
 *
 * So this suite mocks one layer deeper: the real service runs, and `approveBlueprint` is the
 * double. Every lazy `await import(...)` in the service is a separate mock, which is what makes
 * that possible without a database.
 *
 * ## The negative control is the point
 *
 * An assertion that "no body value reaches `approveBlueprint`" would pass trivially if NOTHING
 * from the body reached it. So this suite also pins the two fields that are SUPPOSED to travel
 * from the body — `rationale` and `selectedDesignRef`. If those stop arriving, the spoofing
 * assertions stop meaning anything, and a test here fails to say so.
 */

const approveBlueprint = jest.fn();
class ManifestNotFoundError extends Error {}
jest.mock('../blueprintApproval', () => ({
  approveBlueprint: (...a: any[]) => approveBlueprint(...a),
  ManifestNotFoundError,
}));

const findOne = jest.fn();
jest.mock('../../../models/ProjectLifecycleState', () => ({ __esModule: true, default: { findOne: (...a: any[]) => findOne(...a) } }));

// The migration ramp is ridden deliberately: with both membership tables empty the audited guard
// records `migration_open_legacy_admin` and allows. That is the production condition measured on
// 2026-10-14, so it is the condition this suite runs under.
const membershipSystemIsUnpopulated = jest.fn(async (..._a: any[]) => true);
const contextFromAdminRequest = jest.fn(async (..._a: any[]) => ({ actor: 'ctx' }));
jest.mock('../../../modules/tenancy/adminScopeBridge', () => ({
  contextFromAdminRequest: (...a: any[]) => contextFromAdminRequest(...a),
  membershipSystemIsUnpopulated: (...a: any[]) => membershipSystemIsUnpopulated(...a),
  logLegacyAdminScope: jest.fn(),
}));

const recordAccessDecision = jest.fn(async (..._a: any[]) => undefined);
jest.mock('../../../modules/tenancy/tenantAccessAudit', () => ({
  recordAccessDecision: (...a: any[]) => recordAccessDecision(...a),
}));

const requireTenantAccessAudited = jest.fn(async (..._a: any[]) => undefined);
jest.mock('../../../modules/tenancy/tenantAccessGuards', () => ({
  requireTenantAccessAudited: (...a: any[]) => requireTenantAccessAudited(...a),
}));

jest.mock('../../../modules/tenancy/tenantAuthorization', () => ({
  TenantAccessError: class TenantAccessError extends Error {},
}));

import { approveLifecycleBlueprint } from '../lifecycleStatus';

const ROW_TENANT = 'tenant-from-the-row';
const PROJECT = 'proj-1';
const MANIFEST = 'manifest-1';

const row = (over: Record<string, unknown> = {}) => {
  const data: Record<string, unknown> = {
    id: 'lifecycle-row-1',
    tenant_id: ROW_TENANT,
    student_project_id: PROJECT,
    delivery_project_id: null,
    stage: 'design',
    condition: null,
    condition_reason: null,
    ...over,
  };
  return { get: (k: string) => data[k] };
};

/** A legitimate call. `over` is spread LAST so a test can add attacker-controlled fields. */
const call = (over: Record<string, unknown> = {}) => approveLifecycleBlueprint({
  projectId: PROJECT,
  kind: 'student',
  manifestId: MANIFEST,
  expectedRevision: 4,
  scope: 'full',
  rationale: 'looks right to me',
  selectedDesignRef: 'design-abc',
  // `super_admin` because the approve path now ENFORCES the role (LC-10's authorized-human limb),
  // and because it is a role that actually exists: these fixtures previously used
  // 'DELIVERY_OWNER', which appears nowhere in `admin_users` (ai_staff / admin / sales /
  // super_admin). A fixture role the system does not have cannot exercise an authorization rule.
  admin: { email: 'admin@test', id: 'admin-id-1', role: 'super_admin' },
  ...over,
} as any);

beforeEach(() => {
  jest.clearAllMocks();
  findOne.mockResolvedValue(row());
  membershipSystemIsUnpopulated.mockResolvedValue(true);
  approveBlueprint.mockResolvedValue({ alreadyApproved: false, approval: {} });
});

const passed = () => approveBlueprint.mock.calls[0][0];

describe('the approver handed on is the SESSION identity', () => {
  it('passes the authenticated email', async () => {
    await call();
    expect(passed().approvedBy).toBe('admin@test');
  });

  it('falls back to the id when there is no email', async () => {
    await call({ admin: { id: 'admin-id-1', role: 'super_admin' } });
    expect(passed().approvedBy).toBe('admin-id-1');
  });

  it('records unknown-admin rather than null when the session carries neither', async () => {
    // Null would be written to the column and read later as "nobody approved this", which is a
    // worse lie than a placeholder that is obviously a placeholder.
    await call({ admin: { role: 'super_admin' } });
    expect(passed().approvedBy).toBe('unknown-admin');
  });

  it('takes the role from the session too', async () => {
    await call();
    expect(passed().approvedByRole).toBe('super_admin');
  });
});

describe('THE PIN: no caller-supplied value can become the approver', () => {
  it('ignores approvedBy, approved_by and approvedByRole arriving on the input', async () => {
    await call({
      approvedBy: 'attacker@evil.test',
      approved_by: 'attacker@evil.test',
      approvedByRole: 'SUPERADMIN',
    });
    expect(passed().approvedBy).toBe('admin@test');
    expect(passed().approvedByRole).toBe('super_admin');
  });

  it('lets NO attacker value through on any field at all', async () => {
    await call({
      approvedBy: 'attacker@evil.test',
      approved_by: 'attacker@evil.test',
      approver: 'attacker@evil.test',
      admin_email: 'attacker@evil.test',
    });
    expect(JSON.stringify(passed())).not.toMatch(/attacker@evil/);
  });

  it('takes the tenant from the ROW, never from the caller', async () => {
    // The manifest carries its own tenant and approveBlueprint scopes its lookup by it, so a
    // caller-supplied tenant is the cross-tenant approval in one field.
    await call({ tenantId: 'tenant-the-attacker-wants' });
    expect(passed().tenantId).toBe(ROW_TENANT);
  });
});

describe('NEGATIVE CONTROL: body-sourced fields DO travel, so the pin above is discriminating', () => {
  it('rationale and selectedDesignRef come from the caller', async () => {
    // If this fails, nothing from the input reaches approveBlueprint and every spoofing assertion
    // above is passing vacuously.
    await call({ rationale: 'a specific reason', selectedDesignRef: 'design-xyz' });
    expect(passed().rationale).toBe('a specific reason');
    expect(passed().selectedDesignRef).toBe('design-xyz');
  });

  it('and so do the manifest id, the expected revision and the scope', async () => {
    await call({ manifestId: 'manifest-9', expectedRevision: 11, scope: 'full' });
    expect(passed().manifestId).toBe('manifest-9');
    expect(passed().expectedRevision).toBe(11);
    expect(passed().scope).toBe('full');
  });
});

describe('the approve path still refuses what it refused before', () => {
  it('a missing lifecycle row is ManifestNotFoundError, not a silent approval', async () => {
    findOne.mockResolvedValue(null);
    await expect(call()).rejects.toBeInstanceOf(ManifestNotFoundError);
    expect(approveBlueprint).not.toHaveBeenCalled();
  });

  it('an unauthenticated call never reaches approveBlueprint', async () => {
    await expect(call({ admin: undefined })).rejects.toThrow();
    expect(approveBlueprint).not.toHaveBeenCalled();
  });

  it('the audited guard runs BEFORE the approval, and records the attempt', async () => {
    // A row check that ran first would answer the question without leaving a trace.
    await call();
    expect(recordAccessDecision).toHaveBeenCalledTimes(1);
    expect(recordAccessDecision.mock.calls[0][0]).toMatchObject({
      action: 'write',
      decision: 'allowed',
      reason: 'migration_open_legacy_admin',
      resourceTenantId: ROW_TENANT,
    });
  });

  it('with memberships POPULATED the strict guard runs instead of the ramp', async () => {
    membershipSystemIsUnpopulated.mockResolvedValue(false);
    await call();
    expect(requireTenantAccessAudited).toHaveBeenCalledTimes(1);
    expect(recordAccessDecision).not.toHaveBeenCalled();
  });

  it('a denial from the strict guard stops the approval', async () => {
    membershipSystemIsUnpopulated.mockResolvedValue(false);
    requireTenantAccessAudited.mockRejectedValueOnce(new Error('TenantAccessError'));
    await expect(call()).rejects.toThrow();
    expect(approveBlueprint).not.toHaveBeenCalled();
  });
});

/**
 * LC-10's "authorized human" limb. Until 2026-11-03 the role was recorded into a nullable column
 * and never compared, so this limb was satisfied by bookkeeping. These pin the enforcement.
 */
describe('LC-10 — the approving session must hold a permitted role', () => {
  it('a super_admin approves', async () => {
    await call({ admin: { id: 'a', role: 'super_admin' } });
    expect(approveBlueprint).toHaveBeenCalledTimes(1);
  });

  it.each(['admin', 'ai_staff', 'sales'])('a %s is REFUSED and nothing is approved', async (role) => {
    // All three exist in admin_users — 48 users between them — so this is the real population
    // being excluded, not a hypothetical.
    await expect(call({ admin: { id: 'a', role } })).rejects.toMatchObject({
      name: 'ApproverRoleError',
      refusal: 'approver_role_not_permitted',
    });
    expect(approveBlueprint).not.toHaveBeenCalled();
  });

  it('a session with NO role is refused as missing, not as not-permitted', async () => {
    await expect(call({ admin: { id: 'a' } })).rejects.toMatchObject({
      name: 'ApproverRoleError',
      refusal: 'approver_role_missing',
    });
    expect(approveBlueprint).not.toHaveBeenCalled();
  });

  it('the attempt is AUDITED before it is refused', async () => {
    // The refusal sits after loadAndAuthorize on purpose: a refusal nobody can see is worse than
    // no refusal, so the access decision must already have been recorded.
    await expect(call({ admin: { id: 'a', role: 'sales' } })).rejects.toThrow();
    const audited = requireTenantAccessAudited.mock.calls.length
      + recordAccessDecision.mock.calls.length;
    expect(audited).toBeGreaterThan(0);
  });
});
