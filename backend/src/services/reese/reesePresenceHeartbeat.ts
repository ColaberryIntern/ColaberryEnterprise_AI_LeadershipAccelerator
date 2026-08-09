import CommunityMember from '../../models/CommunityMember';
import { REESE_EMAIL } from './reeseIdentitySeed';
import Enrollment from '../../models/Enrollment';

// Reese Phase 1 — "always online" WITHOUT building any new real-time/websocket
// presence infrastructure. This reuses the EXACT mechanism the real portal
// already uses: `communityService.ts`'s derivePresence() reads
// `CommunityMember.last_active_at` and treats anything touched within the last
// 90s as 'online' (see PRESENCE_ONLINE_MS). A real logged-in student's browser
// keeps itself "online" by calling `pingPresence()` every ~60s
// (frontend/src/pages/portal/today/PortalShell.tsx). This heartbeat does the
// identical thing for Reese's own CommunityMember row on the identical cadence —
// it is a scheduled timestamp touch, never a socket, and it NEVER touches any
// other row (see the unit test asserting exactly one UPDATE, scoped to Reese's
// own id).
//
// Content-free: this module only ever writes `last_active_at`. It has no path
// that reads or sends any message — the Phase 1 non-goal boundary (no autonomous
// outreach) does not apply here because there is nothing communicative about a
// timestamp touch.
export async function runReesePresenceHeartbeat(): Promise<void> {
  const enrollment = await Enrollment.findOne({ where: { email: REESE_EMAIL } });
  if (!enrollment) {
    // Identity not seeded yet (e.g. very first boot, seedReeseIdentity() hasn't
    // run) — nothing to heartbeat. Not an error; next tick will find it once
    // seeded.
    return;
  }

  const member = await CommunityMember.findOne({ where: { enrollment_id: enrollment.id } });
  if (!member) return;

  await member.update({ last_active_at: new Date() });
}
