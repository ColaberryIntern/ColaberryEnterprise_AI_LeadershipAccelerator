/**
 * resolveFactoryDemoContainer — the shared, reversible "AI Project Factory (demo)" container.
 *
 * Resolves the real `refactored` tenant + brand (from the live tables, REFUSING to invent a tenant —
 * a row under a non-existent tenant is worse than failing) and findOrCreate's a clearly-labeled demo
 * Organization + DeliveryEngagement on stable keys. Both factory demo seeds — the contract demo
 * (seedFactoryDemoContract) and the ordinary-project demo (seedOrdinaryProjectDemo) — hang their own
 * DeliveryProject off this one container, so the demos share a single labeled, removable home.
 * Idempotent: re-runs reuse the existing rows.
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';

export const DEMO_ORG_NAME = 'AI Project Factory (demo)';
export const DEMO_ENGAGEMENT_NAME = 'AI Project Factory - demo engagement';

export interface FactoryDemoContainer {
  tenant: { id: string; name: string };
  brandId: string | null;
  org: any;
  engagement: any;
}

export async function resolveFactoryDemoContainer(): Promise<FactoryDemoContainer> {
  const { default: Organization } = await import('../../models/Organization');
  const { default: DeliveryEngagement } = await import('../../models/DeliveryEngagement');

  const [tenant] = await sequelize.query<{ id: string; name: string }>(
    "SELECT id, name FROM tenants WHERE slug = 'refactored' LIMIT 1", { type: QueryTypes.SELECT });
  if (!tenant) throw new Error("No tenant with slug 'refactored' exists in this database; refusing to invent one.");
  const [brand] = await sequelize.query<{ id: string }>(
    "SELECT id FROM brands WHERE slug = 'refactored' LIMIT 1", { type: QueryTypes.SELECT });

  let org: any = await Organization.findOne({ where: { name: DEMO_ORG_NAME } });
  if (!org) {
    org = await Organization.create({ name: DEMO_ORG_NAME, organization_type: 'client', owner_enrollment_id: null, tenant_id: tenant.id });
  }

  let engagement: any = await DeliveryEngagement.findOne({ where: { organization_id: org.id } });
  if (!engagement) {
    engagement = await DeliveryEngagement.create({ organization_id: org.id, tenant_id: tenant.id, name: DEMO_ENGAGEMENT_NAME, status: 'active' });
  }

  return { tenant, brandId: brand ? brand.id : null, org, engagement };
}
