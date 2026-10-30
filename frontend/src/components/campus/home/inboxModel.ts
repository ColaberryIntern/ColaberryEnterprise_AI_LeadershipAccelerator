import type { DmConversation } from '../../../services/dmApi';
import type { StaffDesk } from '../campusPeopleApi';
import type { CampusPresence, CampusPerson } from '../campusApi';
import { staffRole } from '../staffCard';

/**
 * C23 phase 3 (Q6, WP-10): what the campus inbox shows, from real data only (D:2683-2689).
 *
 *  - Staff · always on: the AI desks on duty that take direct messages (an enrollment id). Maya is the website chat (Q8), not a
 *    DM, so she is never a row here. The preview is the last message with that desk, else "<role> · always on".
 *  - Recent: every other conversation, newest first (the server already sorts them).
 *  - In <building> with you: people in the building you are in who you may message and have no conversation with yet (max 4).
 *
 * Unread is a yes/no per conversation on the server, so the badge counts CONVERSATIONS with unread, and a row shows a dot, never
 * an invented message count.
 */
export interface InboxRow {
  key: string;
  /** The person to open a chat with (an existing conversation opens the same room: openDm is idempotent). */
  peerId: string;
  name: string;
  avatar: string | null;
  preview: string;
  unread: boolean;
  staff: boolean;
  roomId: string | null;
}
export interface InboxSections { staff: InboxRow[]; recent: InboxRow[]; here: InboxRow[] }

export const HERE_MAX = 4;

export function unreadConversations(convos: DmConversation[] | null | undefined): number {
  return (convos ?? []).filter((c) => c.unread).length;
}

/** "9+" past nine, nothing at zero. */
export function badgeText(n: number): string | null {
  return n <= 0 ? null : n > 9 ? '9+' : String(n);
}

export function inboxSections(o: {
  conversations: DmConversation[] | null | undefined;
  desks: StaffDesk[];
  presence: CampusPresence | null;
  here: string | null;
  me: string | null;
  workplace: boolean;
}): InboxSections {
  const convos = o.conversations ?? [];
  const byPeer = new Map(convos.map((c) => [c.peerId, c]));
  const deskIds = new Set<string>();
  const staff: InboxRow[] = [];
  for (const d of o.desks) {
    if (!d.on_duty || !d.enrollment_id) continue;
    deskIds.add(d.enrollment_id);
    const c = byPeer.get(d.enrollment_id);
    staff.push({
      key: `s:${d.id}`, peerId: d.enrollment_id, name: d.name, avatar: null, staff: true,
      preview: c?.lastMessage || `${staffRole(d, o.workplace)} · always on`, unread: !!c?.unread, roomId: c?.roomId ?? null,
    });
  }
  const recent: InboxRow[] = convos.filter((c) => !deskIds.has(c.peerId)).map((c) => ({
    key: `r:${c.roomId}`, peerId: c.peerId, name: c.peerName, avatar: c.peerAvatar, staff: false,
    preview: c.lastMessage, unread: c.unread, roomId: c.roomId,
  }));
  const people = o.here && o.presence?.[o.here] ? o.presence[o.here].people : [];
  const here: InboxRow[] = people
    .filter((p): p is CampusPerson => 'enrollment_id' in p)
    .filter((p) => p.can_message && p.enrollment_id !== o.me && !byPeer.has(p.enrollment_id) && !deskIds.has(p.enrollment_id))
    .slice(0, HERE_MAX)
    .map((p) => ({ key: `h:${p.enrollment_id}`, peerId: p.enrollment_id, name: p.display_name, avatar: p.avatar_url, staff: false, preview: 'Here with you', unread: false, roomId: null }));
  return { staff, recent, here };
}
