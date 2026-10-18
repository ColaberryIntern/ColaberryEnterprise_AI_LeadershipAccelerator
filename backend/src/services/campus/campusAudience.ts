import { resolveContentPageAccess, isFreePreviewTier } from '../access/contentEntitlement';
import { isOrgManager } from '../portalSettingsService';
import { getMgmtStatus } from '../access/mgmtBridgeService';

/**
 * Which campus a learner gets (Colaberry Campus C5, moved here in C6 so presence and the staff desks share it).
 *
 * FROM THE SAME SOURCES AS THE FRONTEND, no new rule. The frontend picks a campus from is_staff, is_org_manager and
 * is_explorer: resolveContentPageAccess().isStaff (staff role only; false while the page gate is off), the managed-org lookup,
 * and isFreePreviewTier. C6 adds the Management Portal bridge's status to "staff" (community role staff AND a valid mgmt_role),
 * on BOTH sides (frontend useCampusAudience), because the Staff Office's links only work through that bridge. Precedence as in
 * frontend/src/components/campus/campusAudience.ts: staff > business > explorer > member.
 */
export type CampusAudienceKind = 'staff' | 'business' | 'explorer' | 'member';

/** A failed management-status read counts as not management (fail closed) and is logged. */
async function isMgmt(enrollmentId: string): Promise<boolean> {
  try {
    return (await getMgmtStatus(enrollmentId)).is_mgmt === true;
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string };
    console.warn(JSON.stringify({ level: 'warn', service: 'backend', event: 'campus_mgmt_status_failed', outcome: 'failure',
      error_class: e?.name || 'Error', context: { message: String(e?.message || err).slice(0, 200) } }));
    return false;
  }
}

export async function campusAudienceFor(enrollmentId: string): Promise<CampusAudienceKind> {
  const [page, mgmt, manager, explorer] = await Promise.all([
    resolveContentPageAccess(enrollmentId),
    isMgmt(enrollmentId),
    isOrgManager(enrollmentId),
    isFreePreviewTier(enrollmentId),
  ]);
  return page.isStaff || mgmt ? 'staff' : manager ? 'business' : explorer ? 'explorer' : 'member';
}
