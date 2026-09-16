import CommunityMember from '../../models/CommunityMember';
import Enrollment from '../../models/Enrollment';

// AI Employee Consolidation Program (2026-09-15/16), Phase 3/4 — generic
// extraction of Reese's own reesePresenceHeartbeat.ts, per
// REESE_STANDARD_AUDIT.md gap 10 ("presence heartbeat is Reese-specific and
// content-free... no generic runAgentPresenceHeartbeat(email)"). Byte-for-
// byte identical logic to the original — reesePresenceHeartbeat.ts now
// delegates here, and Dara's own heartbeat is this module's second caller.
//
// "Always online" WITHOUT building any new real-time/websocket presence
// infrastructure. This reuses the EXACT mechanism the real portal already
// uses: communityService.ts's derivePresence() reads
// CommunityMember.last_active_at and treats anything touched within the
// last 90s as 'online'. This is a scheduled timestamp touch, never a
// socket, and it NEVER touches any row other than the one CommunityMember
// row keyed to `email`'s own Enrollment.
//
// Content-free: only ever writes `last_active_at`. Known, disclosed gap
// (not fixed here — REESE_STANDARD_AUDIT.md gap 10, still open for both
// Reese and Dara): no "current activity / last action" text is written
// anywhere, so presence reads online whether or not the agent is doing real
// work. Availability and authority are separate (mission Section 6) —
// fixing the truthfulness gap is a scoped Reese-hardening item, not part of
// this generic extraction.
export async function runAgentPresenceHeartbeat(email: string): Promise<void> {
  const enrollment = await Enrollment.findOne({ where: { email } });
  if (!enrollment) {
    // Identity not seeded yet (e.g. very first boot) — nothing to
    // heartbeat. Not an error; next tick will find it once seeded.
    return;
  }

  const member = await CommunityMember.findOne({ where: { enrollment_id: enrollment.id } });
  if (!member) return;

  await member.update({ last_active_at: new Date() });
}
