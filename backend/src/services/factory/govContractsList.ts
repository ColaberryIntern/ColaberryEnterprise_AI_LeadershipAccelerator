import type { Request } from 'express';
import { lookupGovContractsContainer } from '../../scripts/lib/factoryDemoContainer';
import { resolveGovProjectActor } from '../../middlewares/govProjectAccess';
import { scopeGovCardsToMembership } from './govContractsScope';

/**
 * The active gov pursuits one viewer may see: the body of GET /api/admin/gov-contracts, moved here (C92) so the Campus HQ
 * building (GET /api/portal/campus/hq-subnav) lists EXACTLY what the admin sidebar's "Gov Contracts" node lists, for the same
 * person, from the same code. Row scope as before: a viewer who also holds `program` is broad (every active pursuit); anyone
 * else sees only the delivery projects they are an active member of (email-resolved identity).
 *
 * `null` = the gov container is not configured (the admin route answers 503; the building shows nothing).
 */
export interface ListViewer { email: string; sections: readonly string[] }

export async function listGovContractsFor(viewer: ListViewer): Promise<{ projects: unknown[]; scope: 'all' | 'member' } | null> {
  const container = await lookupGovContractsContainer();
  if (!container) return null;
  const { listGovPipeline } = await import('./govPipeline');
  const cards = await listGovPipeline(container.tenant.id);
  const broad = viewer.sections.includes('program');
  let memberIds: string[] = [];
  if (!broad) {
    // resolveGovProjectActor reads only the email off the request; the viewer is passed in its shape
    const actor = await resolveGovProjectActor({ admin: { email: viewer.email } } as unknown as Request);
    if (actor) {
      const { default: DeliveryProjectMember } = await import('../../models/DeliveryProjectMember');
      const memberships: any[] = await DeliveryProjectMember.findAll({
        where: { platform_identity_id: actor.platformIdentityId, status: 'active' },
      });
      memberIds = Array.from(new Set(memberships.map((m) => m.delivery_project_id).filter(Boolean))).map(String);
    }
  }
  return { projects: scopeGovCardsToMembership(cards, memberIds, broad), scope: broad ? 'all' : 'member' };
}
