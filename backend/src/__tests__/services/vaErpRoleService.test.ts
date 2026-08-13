// A mutable mock env object -- vaErpRoleService reads env.vaErpRoleAssignmentsJson
// fresh on every call (not cached at import time), so tests can just mutate this
// shared object's property between cases instead of re-mocking modules.
const mockEnv = { vaErpRoleAssignmentsJson: '{}' };
jest.mock('../../config/env', () => ({ env: mockEnv }));

import {
  listVaErpRoles,
  getVaErpRoleDefinition,
  isValidVaErpRole,
  getVaErpRoleForEmail,
  hasVaErpPermission,
} from '../../services/vaErpRoleService';

describe('listVaErpRoles', () => {
  it('returns all 5 VA ERP roles', () => {
    const roles = listVaErpRoles();
    expect(roles).toHaveLength(5);
    expect(roles.map(r => r.name).sort()).toEqual([
      'approving_supervisor', 'auditor', 'financial_clerk', 'procurement_officer', 'system_admin',
    ]);
  });
});

describe('getVaErpRoleDefinition / isValidVaErpRole', () => {
  it('finds a known role and rejects an unknown one', () => {
    expect(getVaErpRoleDefinition('financial_clerk')?.label).toBe('Financial Clerk');
    expect(getVaErpRoleDefinition('not_a_role')).toBeUndefined();
    expect(isValidVaErpRole('auditor')).toBe(true);
    expect(isValidVaErpRole('not_a_role')).toBe(false);
  });
});

describe('getVaErpRoleForEmail — default assignment', () => {
  afterEach(() => {
    mockEnv.vaErpRoleAssignmentsJson = '{}';
  });

  it('defaults unmapped admins to system_admin', () => {
    expect(getVaErpRoleForEmail('nobody@colaberry.com')).toBe('system_admin');
  });

  it('honors an explicit assignment from VA_ERP_ROLE_ASSIGNMENTS', () => {
    mockEnv.vaErpRoleAssignmentsJson = JSON.stringify({ 'ali@colaberry.com': 'approving_supervisor' });
    expect(getVaErpRoleForEmail('ali@colaberry.com')).toBe('approving_supervisor');
    expect(getVaErpRoleForEmail('someone-else@colaberry.com')).toBe('system_admin');
  });

  it('falls back to system_admin when an assignment names an invalid role', () => {
    mockEnv.vaErpRoleAssignmentsJson = JSON.stringify({ 'x@colaberry.com': 'not_a_real_role' });
    expect(getVaErpRoleForEmail('x@colaberry.com')).toBe('system_admin');
  });
});

describe('hasVaErpPermission — role scoping', () => {
  it('approving_supervisor can approve but financial_clerk cannot', () => {
    expect(hasVaErpPermission('approving_supervisor', 'approvals:write')).toBe(true);
    expect(hasVaErpPermission('financial_clerk', 'approvals:write')).toBe(false);
  });

  it('auditor is read-only across scopes it covers', () => {
    expect(hasVaErpPermission('auditor', 'audit:read')).toBe(true);
    expect(hasVaErpPermission('auditor', 'financial:write')).toBe(false);
    expect(hasVaErpPermission('auditor', 'procurement:write')).toBe(false);
  });

  it('system_admin has every permission scope', () => {
    const perms = ['dashboard:read', 'approvals:write', 'financial:write', 'procurement:write', 'audit:read'];
    for (const p of perms) {
      expect(hasVaErpPermission('system_admin', p)).toBe(true);
    }
  });

  it('unknown role has no permissions', () => {
    expect(hasVaErpPermission('not_a_role', 'dashboard:read')).toBe(false);
  });
});
