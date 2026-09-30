import { Op } from 'sequelize';
import Enrollment from '../models/Enrollment';
import CommunityMember from '../models/CommunityMember';
import { derivePresence } from './communityService';
import { getFriendshipStatuses, DirectoryStatus } from './friendshipService';

// Cohort presence for the portal right-rail "Contacts" panel (PortalShell).
//
// Reuses the community last-seen signal (CommunityMember.last_active_at) and the
// same derivePresence() staleness thresholds as the Community tab — single
// source of truth, no second heartbeat. The community vocabulary is
// online|away|offline; the rail speaks online|idle|offline, so 'away' maps to
// 'idle' here. Read-only and idempotent (a GET with no side effects).
//
// Coverage note: last_active_at is only fresh for people whose portal window is
// pinging /presence/ping. PortalShell pings on load, so "logged into the portal"
// reads as online; a cohort-mate who isn't in the portal reads offline. Realtime
// websocket presence remains deliberately out of scope (see communityService).

export type RailPresence = 'online' | 'idle' | 'offline';

export interface CohortPresenceContact {
  id: string;                       // enrollment id — React key + friend actions
  name: string;
  avatarUrl: string | null;         // portal profile photo, else community avatar, else null
  presence: RailPresence;
  friendshipStatus: DirectoryStatus; // 'friend' | 'requested' | 'incoming' | 'none'
}

const RANK: Record<RailPresence, number> = { online: 0, idle: 1, offline: 2 };

/**
 * Members of the caller's cohort (excluding the caller), each with a live
 * presence state and the caller's friendship status toward them. Ordered
 * friends-first, then most-active (online → idle → offline, then most-recently
 * active), then name — so the rail leads with people you know. Guests/explorers
 * with no cohort get an empty list (and no DB round-trip).
 */
export async function getCohortPresence(
  enrollmentId: string,
  cohortId: string | null | undefined,
  now: Date = new Date(),
): Promise<CohortPresenceContact[]> {
  if (!cohortId) return [];

  const rows = await Enrollment.findAll({
    where: { cohort_id: cohortId, status: 'active', id: { [Op.ne]: enrollmentId } },
    attributes: ['id', 'full_name', 'avatar_data_url'],
    include: [
      {
        model: CommunityMember,
        as: 'communityMember',
        attributes: ['avatar_url', 'last_active_at'],
        required: false,
      },
    ],
  });

  const statuses = await getFriendshipStatuses(enrollmentId, rows.map((e) => e.id));

  const enriched = rows.map((e) => {
    // The include isn't declared on the Enrollment type; read it defensively.
    const cm = (e as unknown as {
      communityMember?: { avatar_url: string | null; last_active_at: Date | null } | null;
    }).communityMember;
    const last = cm?.last_active_at ?? null;
    const raw = derivePresence(last, now); // online | away | offline
    const presence: RailPresence = raw === 'away' ? 'idle' : raw;
    const contact: CohortPresenceContact = {
      id: e.id,
      name: e.full_name || 'Cohort member',
      avatarUrl: e.avatar_data_url ?? cm?.avatar_url ?? null,
      presence,
      friendshipStatus: statuses[e.id] ?? 'none',
    };
    return { contact, last };
  });

  const friendRank = (s: DirectoryStatus) => (s === 'friend' ? 0 : 1);
  enriched.sort(
    (a, b) =>
      friendRank(a.contact.friendshipStatus) - friendRank(b.contact.friendshipStatus) ||
      RANK[a.contact.presence] - RANK[b.contact.presence] ||
      (b.last?.getTime() ?? 0) - (a.last?.getTime() ?? 0) ||
      a.contact.name.localeCompare(b.contact.name),
  );
  return enriched.map((x) => x.contact);
}
