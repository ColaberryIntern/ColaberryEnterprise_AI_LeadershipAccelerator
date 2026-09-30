/**
 * seedOrdinaryProjectDemo — stand up ONE labeled, reversible "ordinary AI project" (a delivery project
 * with NO contract decomposition) and backfill an HONEST `unassessed` shell onto it, so the Phase 6
 * migration path is demonstrable live: the command center renders it, but the gate honestly FAILS
 * (an unassessed project has no task graph, so it cannot be approved — by design).
 *
 * PROD-SAFE + idempotent + reversible, mirroring seedFactoryDemoContract: resolves the real demo
 * container (refuses to invent a tenant), findOrCreate on a stable slug, then backfill. Remove by
 * deleting the DeliveryProject (contract_* rows cascade).
 *
 *   Usage (prod, after deploy):
 *     docker exec accelerator-backend node dist/scripts/seedOrdinaryProjectDemo.js
 */
import { resolveFactoryDemoContainer } from './lib/factoryDemoContainer';
import { backfillUnassessedContract } from '../services/factory/factoryBackfill';

const DEMO_ORDINARY_SLUG = 'ai-project-factory-demo-ordinary';

export async function seedOrdinaryProjectDemo(): Promise<{ deliveryProjectId: string; created: boolean }> {
  const { default: DeliveryProject } = await import('../models/DeliveryProject');

  const { brandId, org, engagement } = await resolveFactoryDemoContainer();

  let created = false;
  let project: any = await DeliveryProject.findOne({ where: { slug: DEMO_ORDINARY_SLUG } });
  if (!project) {
    project = await DeliveryProject.create({
      engagement_id: engagement.id, tenant_id: engagement.tenant_id, organization_id: org.id,
      brand_id: brandId,
      name: 'AI Ops Assistant (ordinary demo)', slug: DEMO_ORDINARY_SLUG,
      status: 'building', project_class: 'sandbox',
      business_problem: 'Ordinary (non-contract) AI project demo for the Phase 6 unassessed-migration path.',
    });
    created = true;
  }

  // Backfill the HONEST unassessed shell so the project renders and the gate correctly refuses approval.
  await backfillUnassessedContract(project.id);
  return { deliveryProjectId: project.id, created };
}

async function main() {
  const { deliveryProjectId, created } = await seedOrdinaryProjectDemo();
  console.log(JSON.stringify({ event: 'factory_ordinary_demo_seeded', outcome: 'success', delivery_project_id: deliveryProjectId, created }));
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((e) => { console.error('ordinary demo seed failed:', e.message); process.exit(1); });
}
