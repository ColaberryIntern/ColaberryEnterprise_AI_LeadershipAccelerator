/**
 * seedFactoryDemoContract — stand up ONE demo AI Project Factory contract so the Command Center's
 * Approve / Request-changes actions are demonstrable LIVE.
 *
 * PROD-SAFE and idempotent:
 *  - resolves the existing 'refactored' tenant + brand from the real tables, and REFUSES to invent a
 *    tenant (a row under a non-existent tenant is worse than failing);
 *  - findOrCreate a clearly-labeled demo Organization / DeliveryEngagement / DeliveryProject on stable
 *    keys (a fixed name / slug), so re-runs are no-ops;
 *  - persists the Phase-1 sample decomposition (draft, both tracks) via persistSampleContract.
 * Prints the demo delivery_project_id. REVERSIBLE: the demo rows are labeled '(demo)' with a stable
 * slug and can be removed by deleting the DeliveryProject (contract_* rows cascade) — see the handoff.
 *
 *   Usage (prod, after the schema deploys):
 *     docker exec accelerator-backend node dist/scripts/seedFactoryDemoContract.js
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { persistSampleContract } from './seedSampleContractProject';

const DEMO_ORG_NAME = 'AI Project Factory (demo)';
const DEMO_ENGAGEMENT_NAME = 'AI Project Factory - demo engagement';
const DEMO_PROJECT_SLUG = 'ai-project-factory-demo-contract';

export async function seedFactoryDemoContract(): Promise<{ deliveryProjectId: string; created: boolean }> {
  const { default: Organization } = await import('../models/Organization');
  const { default: DeliveryEngagement } = await import('../models/DeliveryEngagement');
  const { default: DeliveryProject } = await import('../models/DeliveryProject');

  // Tenant + brand: resolved from the real tables, never invented (delivery_projects.tenant_id is
  // NOT NULL; a row under a tenant that does not exist would be silently skipped by every scoped query).
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

  let created = false;
  let project: any = await DeliveryProject.findOne({ where: { slug: DEMO_PROJECT_SLUG } });
  if (!project) {
    project = await DeliveryProject.create({
      engagement_id: engagement.id, tenant_id: engagement.tenant_id, organization_id: org.id,
      brand_id: brand ? brand.id : null,
      name: 'AI Government Contract Finder (demo)', slug: DEMO_PROJECT_SLUG,
      status: 'building', project_class: 'sandbox',
      business_problem: 'Demo contract for the AI Project Factory Command Center approval flow.',
    });
    created = true;
  }

  // Persist (idempotent) the sample decomposition onto the demo project so it is approvable.
  // The demo has no linked SBP student build, and the sample fixture's solution_student_project_id
  // points at a dev-only projects.id that does not exist on prod (FK-constrained) — so null it.
  await persistSampleContract(project.id, { solutionStudentProjectId: null });
  return { deliveryProjectId: project.id, created };
}

async function main() {
  const { deliveryProjectId, created } = await seedFactoryDemoContract();
  console.log(JSON.stringify({ event: 'factory_demo_contract_seeded', outcome: 'success', delivery_project_id: deliveryProjectId, created }));
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((e) => { console.error('demo seed failed:', e.message); process.exit(1); });
}
