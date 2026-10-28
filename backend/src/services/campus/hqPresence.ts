import CampusPresence from '../../models/CampusPresence';
import { ensureCampusPresenceSchema } from '../../db/ensureCampusPresenceSchema';
import { touchPresence } from '../communityService';
import { clearCampusArea } from './campusPresenceService';
import { HQ_PATH } from './hqPath';

/**
 * Campus HQ presence: an employee working in the Management Portal is ONLINE and IN THE HQ BUILDING (Ali, 2026-10-28:
 * "count them as online even if they are logged into mgmt portal"; "see and know where employees are in the building").
 *
 * One heartbeat from the admin layout does two things, both idempotent (a repeat beat only moves timestamps forward):
 *  1. bumps the person's community last_active_at (touchPresence), the ONE online signal every rail and the campus read,
 *     so an employee who never opens the campus still shows online;
 *  2. records them in the career building (the HQ) with the sidebar page they have open (`hq_path`), which the HQ maps to
 *     a floor and a room.
 *
 * What is stored is a SIDEBAR path (the frontend reduces the current route to its nav link before sending), never a
 * detail route: /admin/leads, not /admin/leads/<id>. The format check below refuses anything else. "Show which building
 * I'm in" off (share: false) forgets the building and keeps the online signal, exactly as the campus heartbeat does.
 *
 * Failure: any error propagates to the route, which logs it and returns 500; the admin page never shows it (the heartbeat
 * is fire-and-forget on the client). Not handled: two tabs (campus and admin) beating at once, where the last beat wins;
 * both are the same person in the same session, so the flap is between two true places.
 */
export { HQ_PATH };

export interface AdminIdentity { sub?: string; mgmt_role?: string; portal_enrollment_id?: string }

/** The staff enrollment behind an admin session: a bridge-minted token's sub IS the enrollment; a direct admin login
 *  carries portal_enrollment_id when its email is linked to a staff account. Neither = no campus identity (null). */
export function staffEnrollmentOf(admin: AdminIdentity | undefined | null): string | null {
  if (!admin) return null;
  if (admin.mgmt_role && admin.sub) return admin.sub;
  return admin.portal_enrollment_id || null;
}

export async function touchHqPresence(enrollmentId: string, hqPath: string | null, share = true): Promise<void> {
  if (hqPath !== null && !HQ_PATH.test(hqPath)) throw new TypeError('hq_path is not a sidebar path');
  await touchPresence(enrollmentId);
  if (!share) { await clearCampusArea(enrollmentId); return; }
  await ensureCampusPresenceSchema();
  await CampusPresence.upsert({ enrollment_id: enrollmentId, area: 'career', hq_path: hqPath, updated_at: new Date() });
}
