/**
 * Central tenant role registry.
 *
 * Roles are compared here and nowhere else. Scattered `role === 'admin'` comparisons in
 * controllers are how authorization drifts apart in a codebase this size: one route
 * gets a new role, twelve others silently do not, and the gap is invisible until
 * someone sees data they should not. Every grant decision in the tenancy layer routes
 * through `roleGrants()` or the helpers below.
 *
 * Adding a role is a one-line change here plus a membership row. It is deliberately NOT
 * a code change anywhere else — master plan §69's white-label test requires that a
 * sixth tenant onboarding next year touches data, not core infrastructure.
 */

export type TenantPermission =
  | 'tenant.read'
  | 'tenant.write'
  | 'brand.read'
  | 'brand.write'
  | 'lead.read'
  | 'lead.write'
  | 'campaign.read'
  | 'campaign.write'
  | 'campaign.send'
  | 'sender.read'
  | 'sender.write'
  | 'organization.read'
  | 'organization.write'
  | 'journey.read'
  | 'platform.cross_tenant';

export const TENANT_ROLES = {
  /**
   * Ecosystem operator. The ONLY role that carries `platform.cross_tenant`, and the
   * only way to read across tenants. Deliberately not implied by holding an admin
   * token — master plan §19.2 is explicit that "admins can see everything" must not be
   * the default.
   */
  PLATFORM_SUPER_ADMIN: 'platform_super_admin',
  /** Full control of one tenant and all of its brands. */
  TENANT_ADMIN: 'tenant_admin',
  /** Full control of one brand within a tenant. */
  BRAND_ADMIN: 'brand_admin',
  /** Can build and send campaigns for a brand, cannot change senders or domains. */
  BRAND_MARKETER: 'brand_marketer',
  /** Read-only across a tenant. */
  TENANT_VIEWER: 'tenant_viewer',
} as const;

export type TenantRole = (typeof TENANT_ROLES)[keyof typeof TENANT_ROLES];

const ALL_TENANT_PERMISSIONS: TenantPermission[] = [
  'tenant.read',
  'tenant.write',
  'brand.read',
  'brand.write',
  'lead.read',
  'lead.write',
  'campaign.read',
  'campaign.write',
  'campaign.send',
  'sender.read',
  'sender.write',
  'organization.read',
  'organization.write',
  'journey.read',
];

const ROLE_GRANTS: Record<string, TenantPermission[]> = {
  [TENANT_ROLES.PLATFORM_SUPER_ADMIN]: [...ALL_TENANT_PERMISSIONS, 'platform.cross_tenant'],
  [TENANT_ROLES.TENANT_ADMIN]: [...ALL_TENANT_PERMISSIONS],
  [TENANT_ROLES.BRAND_ADMIN]: [
    'tenant.read',
    'brand.read',
    'brand.write',
    'lead.read',
    'lead.write',
    'campaign.read',
    'campaign.write',
    'campaign.send',
    'sender.read',
    'sender.write',
    'organization.read',
    'organization.write',
    'journey.read',
  ],
  // Can compose and send, cannot change who the brand sends AS. Separating
  // campaign.send from sender.write is the point: a marketer running a campaign should
  // not be able to repoint the brand's From address.
  [TENANT_ROLES.BRAND_MARKETER]: [
    'tenant.read',
    'brand.read',
    'lead.read',
    'campaign.read',
    'campaign.write',
    'campaign.send',
    'sender.read',
    'journey.read',
  ],
  [TENANT_ROLES.TENANT_VIEWER]: [
    'tenant.read',
    'brand.read',
    'lead.read',
    'campaign.read',
    'organization.read',
    'journey.read',
  ],
};

/** Permissions granted by a role. Unknown roles grant nothing — fail closed. */
export function roleGrants(role: string): readonly TenantPermission[] {
  return ROLE_GRANTS[role] ?? [];
}

/** Does this set of roles carry the permission? */
export function rolesHavePermission(roles: readonly string[], permission: TenantPermission): boolean {
  return roles.some((role) => roleGrants(role).includes(permission));
}

/** Is any of these roles the platform superadmin? */
export function isPlatformSuperAdminRole(roles: readonly string[]): boolean {
  return roles.includes(TENANT_ROLES.PLATFORM_SUPER_ADMIN);
}

/** Union of every permission the given roles carry. */
export function permissionsFor(roles: readonly string[]): TenantPermission[] {
  const set = new Set<TenantPermission>();
  for (const role of roles) {
    for (const permission of roleGrants(role)) set.add(permission);
  }
  return [...set];
}

/** Known role? Used to reject typos at membership-creation time rather than at read time. */
export function isKnownRole(role: string): role is TenantRole {
  return Object.prototype.hasOwnProperty.call(ROLE_GRANTS, role);
}
