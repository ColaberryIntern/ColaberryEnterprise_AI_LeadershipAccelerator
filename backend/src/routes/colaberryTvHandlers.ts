import { classifyError } from '../utils/errorClassifier';

/**
 * Who may manage Colaberry TV.
 *
 * THIS FILE USED TO BE THE PLAYLIST HANDLERS - list, add, update, order, remove - shared by the
 * campus manage routes and the admin console's /api/admin/colaberry-tv. TV-1 pointed the TV at the
 * Colaberry Training library and sent the Manage button to /admin/marketing/library, which left
 * every one of them writing to a table nothing reads. TV-2 removed them and both surfaces that
 * mounted them.
 *
 * `canManageTv` SURVIVES ON PURPOSE and is the reason this file still exists. It is called by the
 * live GET route to compute `can_manage`, which is the only thing deciding whether the Manage
 * button renders for a staff member. Deleting this file as "dead code" would quietly remove that
 * button for everyone, with nothing failing in CI.
 */

/** May this enrollment manage the TV? Their Management Portal sections include `campaigns`. FAIL CLOSED and logged. */
export async function canManageTv(enrollmentId: string): Promise<boolean> {
  try {
    const { getMgmtStatus } = await import('../services/access/mgmtBridgeService');
    const { sections } = await getMgmtStatus(enrollmentId);
    return Array.isArray(sections) && sections.includes('campaigns');
  } catch (err) {
    console.warn(JSON.stringify({ level: 'warn', service: 'colaberry-tv', event: 'colaberry_tv_manager_lookup_failed', outcome: 'failure',
      error_class: classifyError(err) }));
    return false;
  }
}
