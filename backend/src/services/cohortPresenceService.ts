import { Op } from 'sequelize';
import Enrollment from '../models/Enrollment';
import CommunityMember from '../models/CommunityMember';
import { derivePresence } from './communityService';

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
  id: string;                 // enrollment id — React key + future member popover
  name: string;
  avatarUrl: string | null;   // portal profile photo, else community avatar, else null
  presence: RailPresence;
}

const RANK: Record<RailPresence, number> = { online: 0, idle: 1, offline: 2 };

/**
 * Members of the caller's cohort (excluding the caller), each with a live
 * presence state, ordered online -> idle -> offline then by name so the rail
 * reads like a live roster. Guests/explorers with no cohort get an empty list
 * (and no DB round-trip).
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

  const contacts: CohortPresenceContact[] = rows.map((e) => {
    // The include isn't declared on the Enrollment type; read it defensively.
    const cm = (e as unknown as {
      communityMember?: { avatar_url: string | null; last_active_at: Date | null } | null;
    }).communityMember;
    const raw = derivePresence(cm?.last_active_at ?? null, now); // online | away | offline
    const presence: RailPresence = raw === 'away' ? 'idle' : raw;
    return {
      id: e.id,
      name: e.full_name || 'Cohort member',
      avatarUrl: e.avatar_data_url ?? cm?.avatar_url ?? null,
      presence,
    };
  });

  contacts.sort((a, b) => RANK[a.presence] - RANK[b.presence] || a.name.localeCompare(b.name));
  return contacts;
}
