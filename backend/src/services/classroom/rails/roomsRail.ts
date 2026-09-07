import { env } from '../../../config/env';
import { listRoomsForViewer } from '../../communityRooms/roomService';
import { RoomAccessContext } from '../../communityRooms/roomEntitlementService';
import { Rail, RailContext, RailTile, omitIfEmpty } from './types';

/**
 * Rooms the student can actually walk into right now.
 *
 * GATED ON THE SAME FLAG AS THE ROOMS ROUTES. `communityRoomsEnabled` 404s
 * every `/api/portal/community/rooms` endpoint, so a rail that ignored it would
 * offer a Join button that leads to a 404. The flag is checked first and the
 * rail is simply absent when Rooms is off.
 *
 * SHELL ROOMS ARE EXCLUDED. `listRoomsForViewer` returns `visibility: 'shell'`
 * for rooms the viewer may see the existence of but not enter. Those belong on
 * the Rooms page, where a student can request access; they do not belong on a
 * tile whose only affordance is Join, because the button would not work.
 *
 * The occupied rooms sort first. A room with somebody in it is a different
 * proposition from an empty one, and it is the only ordering a student cares
 * about when deciding where to go and work.
 */

const TILE_LIMIT = 6;

/**
 * THE ROOM'S OWN ICON, taken from where the Rooms page takes it.
 *
 * I previously reported that rooms had no icon and invented a category map for
 * this rail. That was wrong twice over: `community_rooms.metadata.emoji` holds a
 * per-room icon, and `RoomsPage`/`RoomPane` already share a category fallback.
 * Five of my nine invented marks disagreed with theirs, so the same room showed
 * one icon in the classroom and a different one in Rooms.
 *
 * The order below is the Rooms page's order exactly: the room's own emoji, then
 * its category, then a generic. Duplicated from the frontend rather than
 * imported because the backend cannot import from it -- the values are copied
 * verbatim and this comment is the reason a reviewer should check both if either
 * changes.
 */
const CAT_EMOJI: Record<string, string> = {
  start_here: '\u{1F44B}',      // 👋
  your_cohort: '\u{1F393}',     // 🎓
  build_together: '\u{1F6E0}\uFE0F', // 🛠️
  career_cert: '\u{1F4BC}',     // 💼
  demos_events: '\u{1F3A4}',    // 🎤
  social: '\u{1F389}',          // 🎉
  live_now: '\u{1F534}',        // 🔴
  private_rooms: '\u{1F512}',   // 🔒
};

const ROOM_FALLBACK = '\u{1F4AC}';   // 💬, as the Rooms page falls back

function roomIcon(room: RoomLike): string {
  const own = (room as any)?.metadata?.emoji;
  if (typeof own === 'string' && own.trim()) return own;
  return CAT_EMOJI[String(room.category ?? '')] ?? ROOM_FALLBACK;
}

interface RoomLike {
  id: string;
  category?: string | null;
  metadata?: { emoji?: string | null } | null;
  title?: string | null;
  name?: string | null;
  slug?: string | null;
  purpose?: string | null;
  description?: string | null;
  here_count?: number;
}

function nameOf(room: RoomLike): string {
  return room.title || room.name || 'Room';
}

export async function resolveRoomsRail(ctx: RailContext): Promise<Rail | null> {
  if (!env.communityRoomsEnabled) return null;   // the routes would 404 anyway

  const access: RoomAccessContext = {
    enrollmentId: ctx.enrollmentId,
    cohortId: ctx.cohortId as string,
    isAdmin: ctx.isStaff,
  };

  const rows = await listRoomsForViewer(access, {});

  const enterable = rows.filter((r) => r.visibility === 'full');

  const withCounts = enterable
    .map((r) => ({ room: r.room as unknown as RoomLike, here: Number((r.room as any)?.here_count ?? 0) }))
    .sort((a, b) => b.here - a.here)
    .slice(0, TILE_LIMIT);

  const tiles: RailTile[] = withCounts.map(({ room, here }) => ({
    id: room.id,
    title: nameOf(room),
    detail: room.purpose || room.description || null,
    meta: here > 0 ? `${here} in the room now` : 'nobody here yet',
    image_url: null,
    glyph: roomIcon(room),
    stamp: here > 0 ? `${here} IN THE ROOM` : null,
    action: {
      label: here > 0 ? 'Join room' : 'Open room',
      href: `/portal/rooms/${encodeURIComponent(room.id)}`,
      kind: here > 0 ? 'primary' : 'quiet',
    },
  }));

  const live = withCounts.filter((r) => r.here > 0).length;

  return omitIfEmpty({
    surface: 'rooms',
    label: live > 0 ? 'Rooms open now' : 'Rooms',
    count_label: live > 0 ? `${live} with people in` : null,
    href: '/portal/rooms',
    tiles,
  });
}
