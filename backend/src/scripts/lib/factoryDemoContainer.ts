/**
 * resolveFactoryContainer — a reversible, labeled Organization + DeliveryEngagement under the real
 * `refactored` tenant, off which factory DeliveryProjects hang. Resolves the tenant + brand from the live
 * tables and REFUSES to invent a tenant (a row under a non-existent tenant is worse than failing).
 * findOrCreate is idempotent (stable name keys), so re-runs reuse the existing rows.
 *
 * Two named containers use it: the demo container ("AI Project Factory (demo)" — the Phase-4/6 demos) and
 * the government-contracts container ("Colaberry Government Contracts" — where a picked gov opportunity's
 * DeliveryProject is created). Both share this one resolver so tenant/brand handling stays in one place.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';

export const DEMO_ORG_NAME = 'AI Project Factory (demo)';
export const DEMO_ENGAGEMENT_NAME = 'AI Project Factory - demo engagement';
export const GOV_ORG_NAME = 'Colaberry Government Contracts';
export const GOV_ENGAGEMENT_NAME = 'Government Contracts - delivery engagement';

export interface FactoryContainer {
  tenant: { id: string; name: string };
  brandId: string | null;
  org: any;
  engagement: any;
}
/** @deprecated use FactoryContainer */
export type FactoryDemoContainer = FactoryContainer;

/** Resolve (idempotently) a labeled Organization + DeliveryEngagement under the real `refactored` tenant. */
export async function resolveFactoryContainer(orgName: string, engagementName: string): Promise<FactoryContainer> {
  const { default: Organization } = await import('../../models/Organization');
  const { default: DeliveryEngagement } = await import('../../models/DeliveryEngagement');

  const [tenant] = await sequelize.query<{ id: string; name: string }>(
    "SELECT id, name FROM tenants WHERE slug = 'refactored' LIMIT 1", { type: QueryTypes.SELECT });
  if (!tenant) throw new Error("No tenant with slug 'refactored' exists in this database; refusing to invent one.");
  const [brand] = await sequelize.query<{ id: string }>(
    "SELECT id FROM brands WHERE slug = 'refactored' LIMIT 1", { type: QueryTypes.SELECT });

  let org: any = await Organization.findOne({ where: { name: orgName } });
  if (!org) {
    org = await Organization.create({ name: orgName, organization_type: 'client', owner_enrollment_id: null, tenant_id: tenant.id });
  }

  let engagement: any = await DeliveryEngagement.findOne({ where: { organization_id: org.id } });
  if (!engagement) {
    engagement = await DeliveryEngagement.create({ organization_id: org.id, tenant_id: tenant.id, name: engagementName, status: 'active' });
  }

  return { tenant, brandId: brand ? brand.id : null, org, engagement };
}

/** The demo container ("AI Project Factory (demo)"). */
export function resolveFactoryDemoContainer(): Promise<FactoryContainer> {
  return resolveFactoryContainer(DEMO_ORG_NAME, DEMO_ENGAGEMENT_NAME);
}

/** The government-contracts container ("Colaberry Government Contracts") — real gov delivery projects. */
export function resolveGovContractsContainer(): Promise<FactoryContainer> {
  return resolveFactoryContainer(GOV_ORG_NAME, GOV_ENGAGEMENT_NAME);
}

/** A read-only view of the government container for navigation lookups (no create, tenant-scoped). */
export interface GovContainerLookup {
  tenant: { id: string; name: string };
  org: { id: string; tenant_id: string };
  engagement: { id: string; tenant_id: string; organization_id: string };
}

/**
 * READ-ONLY, tenant-scoped resolution of the government container for the navigation-only start route.
 *
 * Policy: the start route is platform-admin only (requireSection('program')) and only ever accesses the FIXED
 * `refactored` government container — there is no tenant-user path. So the trusted tenant is the `refactored`
 * tenant resolved BY SLUG (a fixed, known value), NEVER derived from a request field or an unscoped name match.
 *
 * Unlike resolveFactoryContainer, this never creates anything and fails CLOSED: it returns null if the tenant,
 * organization, or engagement is missing, or if their tenant/organization relationship does not hold. The org
 * lookup is scoped to the resolved tenant (a same-named organization in another tenant can never be selected),
 * and the engagement is scoped to that tenant + organization.
 */
export async function lookupGovContractsContainer(): Promise<GovContainerLookup | null> {
  const { default: Organization } = await import('../../models/Organization');
  const { default: DeliveryEngagement } = await import('../../models/DeliveryEngagement');

  const [tenant] = await sequelize.query<{ id: string; name: string }>(
    "SELECT id, name FROM tenants WHERE slug = 'refactored' LIMIT 1", { type: QueryTypes.SELECT });
  if (!tenant) return null; // fail closed: no fixed gov tenant, resolve nothing

  const org: any = await Organization.findOne({ where: { tenant_id: tenant.id, name: GOV_ORG_NAME } });
  if (!org || org.tenant_id !== tenant.id) return null; // scoped to the tenant; a same-name org elsewhere is ignored

  const engagement: any = await DeliveryEngagement.findOne({ where: { tenant_id: tenant.id, organization_id: org.id } });
  if (!engagement || engagement.tenant_id !== tenant.id || engagement.organization_id !== org.id) return null;

  return { tenant, org, engagement };
}
