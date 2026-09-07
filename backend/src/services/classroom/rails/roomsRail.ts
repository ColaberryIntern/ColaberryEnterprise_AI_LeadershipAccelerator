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
 * A MARK PER ROOM CATEGORY, BECAUSE THERE ARE NO ROOM LOGOS.
 *
 * The ask was "the room cards should have the logo for the different rooms".
 * `community_rooms` has no logo: no icon, image, colour or emoji column exists
 * on the model at all. Inventing one per room here would mean this file decided
 * what every room looks like forever, which is a decision that belongs in the
 * schema and the Rooms admin, not in a classroom rail.
 *
 * So each room shows the mark for its CATEGORY, which is real data and does the
 * job a logo does at a glance: a student learns the trophy is career and
 * certification and the hammer is build-together, and stops reading titles. A
 * true per-room logo needs a nullable icon_url on the model and somewhere to
 * set it. That is a small piece of work, and it is not this one.
 */
const CATEGORY_GLYPH: Record<string, string> = {
  start_here: '\u{1F44B}',
  your_cohort: '\u{1F46F}',
  build_together: '\u{1F528}',
  career_cert: '\u{1F3C6}',
  live_now: '\u{1F534}',
  demos_events: '\u{1F3AC}',
  social: '\u{2615}',
  private_rooms: '\u{1F510}',
  library: '\u{1F4DA}',
};

interface RoomLike {
  id: string;
  category?: string | null;
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
    glyph: CATEGORY_GLYPH[String(room.category ?? '')] ?? (here > 0 ? '\u{1F5E3}' : '\u{1F6AA}'),
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
