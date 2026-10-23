import { resolveContentPageAccess, isFreePreviewTier } from '../access/contentEntitlement';
import { isOrgManager } from '../portalSettingsService';
import { getMgmtStatus } from '../access/mgmtBridgeService';
import { fn, col, where as sqlWhere } from 'sequelize';

/**
 * Which campus a learner gets (Colaberry Campus C5, moved here in C6 so presence and the staff desks share it).
 *
 * FROM THE SAME SOURCES AS THE FRONTEND, no new rule. The frontend picks a campus from is_staff, is_org_manager and
 * is_explorer: resolveContentPageAccess().isStaff (staff role only; false while the page gate is off), the managed-org lookup,
 * and isFreePreviewTier. C6 adds the Management Portal bridge's status to "staff" (community role staff AND a valid mgmt_role),
 * on BOTH sides (frontend useCampusAudience), because the Staff Office's links only work through that bridge. Precedence as in
 * frontend/src/components/campus/campusAudience.ts: staff > business > explorer > member.
 *
 * C13 (round 3): an account whose email also has an admin_users login is STAFF too (Ali: employee and admin, who also manages an
 * org, was getting the business campus), and the answer is served from GET /api/portal/campus/audience so the frontend draws the
 * campus from the server's word, not from hooks that resolve one by one. Drawing only: admin pages still check access themselves.
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

/** C13: does this enrollment's email have an admin_users login? A failed read counts as no (fail closed) and is logged. */
export async function hasAdminLogin(enrollmentId: string): Promise<boolean> {
  try {
    // Loaded lazily, as the campus routes load their services: this rule is imported far and wide, the models open the database.
    const { default: Enrollment } = await import('../../models/Enrollment');
    const { default: AdminUser } = await import('../../models/AdminUser');
    const enr = await Enrollment.findByPk(enrollmentId, { attributes: ['email'] });
    const email = String((enr as unknown as { email?: string } | null)?.email ?? '').trim().toLowerCase();
    if (!email) return false;
    return !!(await AdminUser.findOne({ where: sqlWhere(fn('lower', col('email')), email), attributes: ['id'] }));
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string };
    console.warn(JSON.stringify({ level: 'warn', service: 'backend', event: 'campus_admin_login_check_failed', outcome: 'failure',
      error_class: e?.name || 'Error', context: { message: String(e?.message || err).slice(0, 200) } }));
    return false;
  }
}

export async function campusAudienceFor(enrollmentId: string): Promise<CampusAudienceKind> {
  const [page, mgmt, admin, manager, explorer] = await Promise.all([
    resolveContentPageAccess(enrollmentId),
    isMgmt(enrollmentId),
    hasAdminLogin(enrollmentId),
    isOrgManager(enrollmentId),
    isFreePreviewTier(enrollmentId),
  ]);
  return page.isStaff || mgmt || admin ? 'staff' : manager ? 'business' : explorer ? 'explorer' : 'member';
}
