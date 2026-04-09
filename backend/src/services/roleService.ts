/**
 * Role Service
 * Defines roles, permissions, and role assignment logic for admin users.
 */

const LOG_PREFIX = '[Roles]';

// ---------------------------------------------------------------------------
// Role & permission definitions
// ---------------------------------------------------------------------------

export type RoleName = 'super_admin' | 'admin' | 'operator' | 'viewer';

export interface RoleDefinition {
  name: RoleName;
  label: string;
  description: string;
  permissions: string[];
}

const PERMISSION_SCOPES = [
  'leads:read', 'leads:write',
  'campaigns:read', 'campaigns:write',
  'settings:read', 'settings:write',
  'users:read', 'users:write',
  'intelligence:read',
  'reports:read',
  'processes:read', 'processes:write',
] as const;

export type PermissionScope = typeof PERMISSION_SCOPES[number];

const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    name: 'super_admin',
    label: 'Super Admin',
    description: 'Full access to all platform features including user and role management.',
    permissions: [...PERMISSION_SCOPES],
  },
  {
    name: 'admin',
    label: 'Admin',
    description: 'Manage leads, campaigns, and intelligence. Cannot manage users or settings.',
    permissions: [
      'leads:read', 'leads:write',
      'campaigns:read', 'campaigns:write',
      'intelligence:read',
      'reports:read',
      'processes:read', 'processes:write',
    ],
  },
  {
    name: 'operator',
    label: 'Operator',
    description: 'Day-to-day operations: manage leads and campaigns. No settings or user management.',
    permissions: [
      'leads:read', 'leads:write',
      'campaigns:read', 'campaigns:write',
      'reports:read',
      'processes:read',
    ],
  },
  {
    name: 'viewer',
    label: 'Viewer',
    description: 'Read-only access to dashboards, reports, and intelligence.',
    permissions: [
      'leads:read',
      'campaigns:read',
      'intelligence:read',
      'reports:read',
      'processes:read',
    ],
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function listRoles(): RoleDefinition[] {
  return ROLE_DEFINITIONS;
}

export function getRoleDefinition(role: string): RoleDefinition | undefined {
  return ROLE_DEFINITIONS.find(r => r.name === role);
}

export function getRolePermissions(role: string): string[] {
  const def = getRoleDefinition(role);
  return def ? def.permissions : [];
}

export function isValidRole(role: string): role is RoleName {
  return ROLE_DEFINITIONS.some(r => r.name === role);
}

export function hasPermission(role: string, permission: string): boolean {
  return getRolePermissions(role).includes(permission);
}

export async function assignRole(adminUserId: string, newRole: string): Promise<any> {
  if (!isValidRole(newRole)) {
    throw new Error(`Invalid role: ${newRole}. Valid roles: ${ROLE_DEFINITIONS.map(r => r.name).join(', ')}`);
  }

  const { AdminUser } = await import('../models');
  const user = await AdminUser.findByPk(adminUserId);
  if (!user) throw new Error('Admin user not found');

  const previousRole = (user as any).role;
  await user.update({ role: newRole } as any);
  console.log(`${LOG_PREFIX} Role changed for ${(user as any).email}: ${previousRole} → ${newRole}`);

  return { id: (user as any).id, email: (user as any).email, role: newRole, previous_role: previousRole };
}

export async function listAdminUsers(): Promise<any[]> {
  const { AdminUser } = await import('../models');
  const users = await AdminUser.findAll({
    attributes: ['id', 'email', 'role', 'created_at'],
    order: [['created_at', 'ASC']],
  });
  return users;
}
