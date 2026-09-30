/**
 * Central delivery role registry — project-scoped, not tenant-scoped.
 *
 * Deliberately separate from `modules/tenancy/tenantRoles.ts`. Master plan §4: "Tenant
 * roles remain tenant roles. Do not jam delivery roles into tenantRoles.ts unless they
 * truly grant tenant-wide authority." The two answer different questions:
 *
 *   TenantMembership      — may this identity act inside this tenant at all?
 *   DeliveryProjectMember — may they approve THIS design decision?
 *
 * Both must pass, tenant first. See `deliveryAuthorization.ts` for why the order matters.
 *
 * Same discipline as the tenancy registry: roles are compared here and nowhere else.
 * Scattered `role === 'client_reviewer'` comparisons in controllers and React are how
 * authorization drifts apart in a codebase this size — one route gets a new role, twelve
 * others silently do not, and the gap is invisible until a client sees something they
 * should not.
 *
 * Adding a role is a one-line change here plus a membership row. It is deliberately NOT a
 * code change anywhere else.
 */

export type DeliveryPermission =
  | 'project.read'
  | 'project.write'
  | 'contract.read'
  | 'contract.approve'
  | 'requirement.read'
  | 'requirement.write'
  | 'requirement.approve'
  | 'architecture.read'
  | 'architecture.write'
  | 'architecture.approve'
  | 'design.read'
  | 'design.comment'
  | 'design.approve'
  | 'story.read'
  | 'story.write'
  | 'story.execute'
  | 'story.review'
  | 'agent.read'
  | 'agent.write'
  | 'agent.approve'
  | 'evidence.read'
  | 'evidence.verify'
  | 'release.read'
  | 'release.approve'
  | 'release.deploy'
  | 'client.accept'
  | 'operations.read'
  | 'operations.write'
  | 'project.manage_members'
  | 'project.manage_authority';

export const DELIVERY_ROLES = {
  /** Owns the engagement commercially. The only role that can both manage members and deploy. */
  DELIVERY_OWNER: 'delivery_owner',
  /** Runs the delivery day to day. */
  DELIVERY_LEAD: 'delivery_lead',
  ARCHITECT: 'architect',
  BUILDER: 'builder',
  /** An intern or junior builder. Capped further by their Builder Authority Profile. */
  ASSOCIATE_BUILDER: 'associate_builder',
  MENTOR: 'mentor',
  QA_REVIEWER: 'qa_reviewer',
  SECURITY_REVIEWER: 'security_reviewer',
  DESIGN_REVIEWER: 'design_reviewer',
  /** The client's decision maker. */
  CLIENT_OWNER: 'client_owner',
  /** A client-side participant who can look and comment but not decide. */
  CLIENT_REVIEWER: 'client_reviewer',
  /** The person contractually empowered to accept a release. */
  CLIENT_ACCEPTANCE_OWNER: 'client_acceptance_owner',
  /** Read-only. Stakeholders, auditors, observers. */
  OBSERVER: 'observer',
} as const;

export type DeliveryRole = (typeof DELIVERY_ROLES)[keyof typeof DELIVERY_ROLES];

export const ALL_DELIVERY_ROLES: readonly DeliveryRole[] = Object.values(DELIVERY_ROLES);

/** Read-only access to everything a role is allowed to see. The common base. */
const READ_ALL: DeliveryPermission[] = [
  'project.read',
  'contract.read',
  'requirement.read',
  'architecture.read',
  'design.read',
  'story.read',
  'agent.read',
  'evidence.read',
  'release.read',
  'operations.read',
];

/**
 * What a client may see. Narrower than READ_ALL on purpose — architecture and agent
 * internals are not part of the client surface.
 *
 * This is a defence in depth, not the primary control. Master plan §Gate 10's real
 * protection is that the client API returns a *different shape* rather than the full
 * shape filtered later, because a client-role check applied in React puts private mentor
 * notes into a network payload that anyone can open DevTools and read.
 */
const CLIENT_READ: DeliveryPermission[] = [
  'project.read',
  'contract.read',
  'requirement.read',
  'design.read',
  'story.read',
  'evidence.read',
  'release.read',
];

const ROLE_GRANTS: Record<string, DeliveryPermission[]> = {
  [DELIVERY_ROLES.DELIVERY_OWNER]: [
    ...READ_ALL,
    'project.write',
    'contract.approve',
    'requirement.write',
    'requirement.approve',
    'architecture.write',
    'architecture.approve',
    'design.approve',
    'story.write',
    'story.review',
    'agent.write',
    'agent.approve',
    'evidence.verify',
    'release.approve',
    'release.deploy',
    'operations.write',
    'project.manage_members',
    'project.manage_authority',
  ],
  [DELIVERY_ROLES.DELIVERY_LEAD]: [
    ...READ_ALL,
    'project.write',
    'contract.approve',
    'requirement.write',
    'requirement.approve',
    'architecture.approve',
    'design.approve',
    'story.write',
    'story.review',
    'agent.approve',
    'evidence.verify',
    'release.approve',
    'operations.write',
    'project.manage_members',
  ],
  [DELIVERY_ROLES.ARCHITECT]: [
    ...READ_ALL,
    'requirement.write',
    'requirement.approve',
    'architecture.write',
    'architecture.approve',
    'story.write',
    'agent.write',
    'agent.approve',
  ],
  [DELIVERY_ROLES.BUILDER]: [
    ...READ_ALL,
    'requirement.write',
    'architecture.write',
    'design.comment',
    'story.write',
    'story.execute',
    'agent.write',
  ],
  // Same shape as BUILDER minus architecture authorship. The real limit on an associate
  // is not this list but their Builder Authority Profile, which caps the risk level they
  // may execute without review — see `builderAuthority.ts`.
  [DELIVERY_ROLES.ASSOCIATE_BUILDER]: [
    ...READ_ALL,
    'requirement.write',
    'design.comment',
    'story.write',
    'story.execute',
    'agent.write',
  ],
  [DELIVERY_ROLES.MENTOR]: [...READ_ALL, 'story.review', 'evidence.verify', 'project.manage_authority'],
  [DELIVERY_ROLES.QA_REVIEWER]: [...READ_ALL, 'story.review', 'evidence.verify', 'release.approve'],
  // Can approve architecture and block a release, cannot write either. A reviewer who can
  // author what they review is not a reviewer.
  [DELIVERY_ROLES.SECURITY_REVIEWER]: [
    ...READ_ALL,
    'architecture.approve',
    'agent.approve',
    'evidence.verify',
    'release.approve',
  ],
  [DELIVERY_ROLES.DESIGN_REVIEWER]: ['project.read', 'design.read', 'design.comment', 'design.approve', 'evidence.read'],
  [DELIVERY_ROLES.CLIENT_OWNER]: [
    ...CLIENT_READ,
    'contract.approve',
    'design.comment',
    'design.approve',
    'client.accept',
    'operations.read',
  ],
  [DELIVERY_ROLES.CLIENT_REVIEWER]: [...CLIENT_READ, 'design.comment'],
  [DELIVERY_ROLES.CLIENT_ACCEPTANCE_OWNER]: [
    ...CLIENT_READ,
    'contract.approve',
    'design.approve',
    'release.approve',
    'client.accept',
  ],
  [DELIVERY_ROLES.OBSERVER]: ['project.read', 'design.read', 'story.read', 'evidence.read', 'release.read', 'operations.read'],
};

/** Permissions granted by a delivery role. Unknown roles grant nothing — fail closed. */
export function deliveryRoleGrants(role: string): readonly DeliveryPermission[] {
  return ROLE_GRANTS[role] ?? [];
}

/** Does this set of roles carry the permission? */
export function rolesHaveDeliveryPermission(
  roles: readonly string[],
  permission: DeliveryPermission,
): boolean {
  return roles.some((role) => deliveryRoleGrants(role).includes(permission));
}

/** Every permission this set of roles carries, de-duplicated. */
export function deliveryPermissionsFor(roles: readonly string[]): DeliveryPermission[] {
  return [...new Set(roles.flatMap((role) => [...deliveryRoleGrants(role)]))];
}

/** Is this a role the registry knows about? */
export function isKnownDeliveryRole(role: string): role is DeliveryRole {
  return Object.prototype.hasOwnProperty.call(ROLE_GRANTS, role);
}

/**
 * Roles held by someone outside the delivering organization.
 *
 * Used to decide which API projection to serve. Kept here rather than inferred from a
 * `client_` name prefix, because a future role like `external_auditor` would break a
 * prefix check silently and would be exactly the kind of caller that must not receive the
 * builder-shaped payload.
 */
const CLIENT_SIDE_ROLES: readonly string[] = [
  DELIVERY_ROLES.CLIENT_OWNER,
  DELIVERY_ROLES.CLIENT_REVIEWER,
  DELIVERY_ROLES.CLIENT_ACCEPTANCE_OWNER,
];

export function isClientSideRole(role: string): boolean {
  return CLIENT_SIDE_ROLES.includes(role);
}

/** True when EVERY role held is client-side, so the client projection is the safe answer. */
export function isClientOnly(roles: readonly string[]): boolean {
  return roles.length > 0 && roles.every(isClientSideRole);
}
