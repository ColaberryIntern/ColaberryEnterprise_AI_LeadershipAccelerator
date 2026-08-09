/**
 * VA ERP Role Service — STORY-005/006.
 *
 * DEMO SCOPE ONLY. This is a deliberately separate, lightweight role model
 * for the VA ERP Integration proposal-rehearsal demo. It reuses the existing
 * admin JWT (requireAdmin) for authentication, but does NOT reuse or extend
 * the platform's real roleService.ts (super_admin/admin/operator/viewer) --
 * that RoleName type gates the entire Colaberry product (leads, campaigns,
 * users, settings), and VA ERP's role vocabulary (financial/procurement/
 * approval roles) is a different domain. Mixing them into one column would
 * force every admin's role to simultaneously make sense for both, which it
 * can't. See the STORY-005 decision record: this whole feature living inside
 * the Colaberry student/Accelerator platform is fine for a rehearsal demo,
 * but is NOT a shippable production architecture -- real VA data cannot
 * share an app/security boundary with the student platform.
 *
 * Role assignment: an admin's VA ERP role is looked up by email from
 * VA_ERP_ROLE_ASSIGNMENTS (JSON env var, e.g. '{"ali@colaberry.com":
 * "approving_supervisor"}'). Any admin not listed defaults to
 * 'system_admin' so existing admins can access the demo without extra
 * setup. Ports the 5-role model already verified (STORY-006, in-memory
 * harness) into something actually reachable this time.
 */
import { env } from '../config/env';

export type VaErpRoleName =
  | 'approving_supervisor'
  | 'financial_clerk'
  | 'procurement_officer'
  | 'auditor'
  | 'system_admin';

export interface VaErpRoleDefinition {
  name: VaErpRoleName;
  label: string;
  description: string;
  permissions: string[];
}

const VA_ERP_PERMISSION_SCOPES = [
  'dashboard:read',
  'approvals:read', 'approvals:write',
  'financial:read', 'financial:write',
  'procurement:read', 'procurement:write',
  'audit:read',
] as const;

export type VaErpPermissionScope = typeof VA_ERP_PERMISSION_SCOPES[number];

const VA_ERP_ROLE_DEFINITIONS: VaErpRoleDefinition[] = [
  {
    name: 'approving_supervisor',
    label: 'Approving Supervisor',
    description: 'Reviews and approves financial transactions and procurement requests.',
    permissions: ['dashboard:read', 'approvals:read', 'approvals:write', 'financial:read', 'procurement:read'],
  },
  {
    name: 'financial_clerk',
    label: 'Financial Clerk',
    description: 'Manages financial postings and reconciliation. No approval authority.',
    permissions: ['dashboard:read', 'financial:read', 'financial:write'],
  },
  {
    name: 'procurement_officer',
    label: 'Procurement Officer',
    description: 'Raises and tracks procurement requests.',
    permissions: ['dashboard:read', 'procurement:read', 'procurement:write'],
  },
  {
    name: 'auditor',
    label: 'Auditor',
    description: 'Read-only access to audit trails and compliance reports.',
    permissions: ['dashboard:read', 'audit:read', 'financial:read', 'procurement:read', 'approvals:read'],
  },
  {
    name: 'system_admin',
    label: 'System Admin',
    description: 'Default role for demo access. Full read/write across all VA ERP scopes.',
    permissions: [...VA_ERP_PERMISSION_SCOPES],
  },
];

const DEFAULT_ROLE: VaErpRoleName = 'system_admin';

function parseRoleAssignments(): Record<string, string> {
  try {
    const raw = env.vaErpRoleAssignmentsJson;
    if (!raw || raw === '{}') return {};
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

export function listVaErpRoles(): VaErpRoleDefinition[] {
  return VA_ERP_ROLE_DEFINITIONS;
}

export function getVaErpRoleDefinition(role: string): VaErpRoleDefinition | undefined {
  return VA_ERP_ROLE_DEFINITIONS.find(r => r.name === role);
}

export function isValidVaErpRole(role: string): role is VaErpRoleName {
  return VA_ERP_ROLE_DEFINITIONS.some(r => r.name === role);
}

/** Look up an admin's VA ERP role by email. Unmapped admins default to system_admin. */
export function getVaErpRoleForEmail(email: string): VaErpRoleName {
  const assignments = parseRoleAssignments();
  const assigned = assignments[email];
  return assigned && isValidVaErpRole(assigned) ? assigned : DEFAULT_ROLE;
}

export function hasVaErpPermission(role: string, permission: string): boolean {
  const def = getVaErpRoleDefinition(role);
  return def ? def.permissions.includes(permission) : false;
}
