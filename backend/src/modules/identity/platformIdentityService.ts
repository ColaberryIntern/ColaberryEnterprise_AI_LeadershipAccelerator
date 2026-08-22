import { PlatformIdentity, PlatformIdentityLink, TenantMembership } from '../../models';
import { PlatformIdentityLinkType } from '../../models/PlatformIdentityLink';
import { isKnownRole } from '../tenancy/tenantRoles';

/**
 * Platform identity bridge — one human, linked to the identities that already exist.
 *
 * SAFETY RULE, stated first because it is the one that matters: two people are NEVER
 * merged on weak evidence. Email is used as the join key only because the existing
 * system already treats it as canonical for leads and enrollments; nothing here matches
 * on name, phone, company, or fuzzy similarity. An incorrect merge exposes one person's
 * journey, communications and organization membership to another, and there is no clean
 * way to unpick it afterwards.
 *
 * This service is additive. It does not participate in any existing authentication path
 * and no current login depends on it. That is deliberate: the identity graph can be
 * populated and verified while every existing session keeps working, and wiring it into
 * auth is a separate change with its own blast radius.
 */

export function normalizeEmail(email: string): string {
  return (email || '').trim().toLowerCase();
}

export interface EnsureIdentityInput {
  email: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

export interface EnsureIdentityResult {
  identity: PlatformIdentity;
  created: boolean;
}

/** Find or create the identity for an email. Idempotent on normalized email. */
export async function ensurePlatformIdentity(
  input: EnsureIdentityInput,
): Promise<EnsureIdentityResult> {
  const email = normalizeEmail(input.email);
  if (!email) throw new Error('ensurePlatformIdentity requires an email');

  const existing = await PlatformIdentity.findOne({ where: { primary_email: email } });
  if (existing) {
    // Fill in a missing display name, never overwrite one. A CRM import with a worse
    // name than the one the person entered themselves must not win.
    if (!existing.display_name && input.displayName) {
      await existing.update({ display_name: input.displayName } as any);
    }
    return { identity: existing, created: false };
  }

  const identity = await PlatformIdentity.create({
    primary_email: email,
    display_name: input.displayName ?? null,
    avatar_url: input.avatarUrl ?? null,
    status: 'active',
  } as any);
  return { identity, created: true };
}

export interface LinkIdentityInput {
  platformIdentityId: string;
  linkType: PlatformIdentityLinkType;
  linkedEntityId: string | number;
  isPrimary?: boolean;
  /** 'authenticated' | 'email_match' | 'manual' | 'backfill' */
  linkSource?: string;
}

export interface LinkIdentityResult {
  created: boolean;
  /** Set when the entity was already linked to a DIFFERENT identity. Never reassigned. */
  conflictWithIdentityId?: string;
}

/**
 * Link an existing Lead / Enrollment / AdminUser to a platform identity.
 *
 * If the entity is already linked to another identity this returns a conflict and
 * changes NOTHING. Silently reassigning would merge two people's histories on the
 * strength of whichever backfill ran last, which is precisely the failure this service
 * exists to prevent. Conflicts are surfaced for a human to resolve.
 */
export async function linkIdentity(input: LinkIdentityInput): Promise<LinkIdentityResult> {
  const linkedEntityId = String(input.linkedEntityId);

  const existing = await PlatformIdentityLink.findOne({
    where: { link_type: input.linkType, linked_entity_id: linkedEntityId },
  });

  if (existing) {
    if (existing.platform_identity_id !== input.platformIdentityId) {
      return { created: false, conflictWithIdentityId: existing.platform_identity_id };
    }
    return { created: false };
  }

  await PlatformIdentityLink.create({
    platform_identity_id: input.platformIdentityId,
    link_type: input.linkType,
    linked_entity_id: linkedEntityId,
    is_primary: input.isPrimary ?? false,
    link_source: input.linkSource ?? null,
  } as any);

  return { created: true };
}

/** The identity a Lead/Enrollment/AdminUser belongs to, if any. */
export async function findIdentityForEntity(
  linkType: PlatformIdentityLinkType,
  linkedEntityId: string | number,
): Promise<PlatformIdentity | null> {
  const link = await PlatformIdentityLink.findOne({
    where: { link_type: linkType, linked_entity_id: String(linkedEntityId) },
  });
  if (!link) return null;
  return PlatformIdentity.findByPk(link.platform_identity_id);
}

/** Every entity linked to an identity, grouped by kind. */
export async function getIdentityLinks(
  platformIdentityId: string,
): Promise<Record<PlatformIdentityLinkType, string[]>> {
  const links = await PlatformIdentityLink.findAll({
    where: { platform_identity_id: platformIdentityId },
  });
  const grouped: Record<PlatformIdentityLinkType, string[]> = {
    lead: [],
    enrollment: [],
    admin_user: [],
  };
  for (const link of links) {
    if (grouped[link.link_type]) grouped[link.link_type].push(link.linked_entity_id);
  }
  return grouped;
}

export interface GrantMembershipInput {
  platformIdentityId: string;
  tenantId: string;
  /** null grants every brand in the tenant. */
  brandId?: string | null;
  role: string;
  status?: 'invited' | 'active';
}

/**
 * Grant tenant access. Idempotent on (identity, tenant, brand, role).
 *
 * Rejects unknown roles rather than storing them. A typo'd role in the database grants
 * nothing (the registry returns no permissions for it), so the operator would see a
 * membership that silently does not work — failing at write time is far easier to
 * diagnose than an access denial three weeks later.
 */
export async function grantTenantMembership(
  input: GrantMembershipInput,
): Promise<{ membership: TenantMembership; created: boolean }> {
  if (!isKnownRole(input.role)) {
    throw new Error(`Unknown tenant role: ${input.role}`);
  }

  const where: Record<string, unknown> = {
    platform_identity_id: input.platformIdentityId,
    tenant_id: input.tenantId,
    role: input.role,
    brand_id: input.brandId ?? null,
  };

  const existing = await TenantMembership.findOne({ where });
  if (existing) {
    if (input.status && existing.status !== input.status) {
      await existing.update({ status: input.status } as any);
    }
    return { membership: existing, created: false };
  }

  const membership = await TenantMembership.create({
    platform_identity_id: input.platformIdentityId,
    tenant_id: input.tenantId,
    brand_id: input.brandId ?? null,
    role: input.role,
    status: input.status ?? 'active',
  } as any);
  return { membership, created: true };
}

/** Revoke by suspending, not deleting — the audit trail of who had access matters. */
export async function suspendTenantMembership(membershipId: string): Promise<boolean> {
  const membership = await TenantMembership.findByPk(membershipId);
  if (!membership) return false;
  await membership.update({ status: 'suspended' } as any);
  return true;
}

/**
 * Resolve an identity from an email and link the lead in one step. Used by ingest and
 * account creation.
 *
 * `linkSource: 'email_match'` records HOW the link was made, so a later audit can tell
 * a link inferred from an email apart from one a person confirmed by authenticating.
 */
export async function ensureIdentityForLead(
  leadId: number,
  email: string,
  displayName?: string | null,
): Promise<{ identity: PlatformIdentity; linkCreated: boolean; conflict: boolean }> {
  const { identity } = await ensurePlatformIdentity({ email, displayName });
  const link = await linkIdentity({
    platformIdentityId: identity.id,
    linkType: 'lead',
    linkedEntityId: leadId,
    isPrimary: true,
    linkSource: 'email_match',
  });
  return {
    identity,
    linkCreated: link.created,
    conflict: Boolean(link.conflictWithIdentityId),
  };
}
