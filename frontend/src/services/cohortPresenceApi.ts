import portalApi from '../utils/portalApi';

// Cohort presence for the PortalShell right-rail "Contacts" panel.
// Data comes from GET /api/portal/cohort/presence (real cohort roster + live
// presence). The server owns id / name / avatarUrl / presence; initials + avatar
// colour are derived deterministically on the client so the API stays lean.

export type Presence = 'online' | 'idle' | 'offline';
// The caller's friendship status toward this person.
export type FriendshipStatus = 'friend' | 'requested' | 'incoming' | 'none';

export interface CohortContact {
  id: string;
  name: string;
  initials: string;
  color: string;
  avatarUrl: string | null;
  presence: Presence;
  friendshipStatus: FriendshipStatus;
}

interface ServerContact {
  id: string;
  name: string;
  avatarUrl: string | null;
  presence: Presence;
  friendshipStatus?: FriendshipStatus;
}

// Design-E accent hues — a stable colour per member (hash of id/name), so the
// same person is always the same colour across sessions.
const AVATAR_COLORS = ['#E8920C', '#367895', '#5BA63C', '#C20E1E', '#6B4FA0', '#2E6A86', '#B5710A', '#3C7A26'];

export function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Members who are reachable now (online or idle) — drives the "N online" count. */
export const onlineCount = (list: CohortContact[]): number =>
  list.filter((c) => c.presence !== 'offline').length;

export async function fetchCohortPresence(): Promise<CohortContact[]> {
  const { data } = await portalApi.get<{ contacts: ServerContact[] }>('/api/portal/cohort/presence');
  return (data.contacts || []).map((c) => ({
    id: c.id,
    name: c.name,
    initials: initialsFor(c.name),
    color: colorFor(c.id || c.name),
    avatarUrl: c.avatarUrl ?? null,
    presence: c.presence,
    friendshipStatus: c.friendshipStatus ?? 'none',
  }));
}

// Friend actions. Fire-and-forget from the caller's POV; the rail refetches
// presence afterward to reflect the new friendshipStatus.
export async function sendFriendRequest(targetId: string): Promise<void> {
  await portalApi.post('/api/portal/friends/request', { targetId });
}

export async function respondToFriendRequest(requesterId: string, accept: boolean): Promise<void> {
  await portalApi.post('/api/portal/friends/respond', { requesterId, accept });
}
