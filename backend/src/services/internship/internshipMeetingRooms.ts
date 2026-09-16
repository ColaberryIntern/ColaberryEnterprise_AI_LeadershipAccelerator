import CommunityRoom from '../../models/CommunityRoom';
import RoomMembership from '../../models/RoomMembership';
import CohortMembership from '../../models/CohortMembership';
import {
  DEFAULT_INTERNSHIP_SETTINGS, ensureInternshipCohort, internshipSettings, type RequiredMeeting,
} from './internshipCohortService';
import { createMeeting, isZoomConfigured } from '../zoomService';

/**
 * Provision the internship's Zoom-in-Rooms meeting rooms.
 *
 * Moves the required meetings off Discord into the Rooms rail: one interns-only
 * room for the Monday standup, one public room backing the three public AI
 * sessions. Each is a PERSISTENT video room (shows in /portal/rooms, carries a
 * stable reusable Zoom link). The links are then written back into the internship
 * cohort's `required_meetings`, so an intern sees a real Join button.
 *
 * ── IDEMPOTENT ─────────────────────────────────────────────────────────────
 * Rooms are found-or-created by a fixed slug (never `roomService.createRoom`,
 * whose slug is randomised). The Zoom link is minted only when absent, mirroring
 * `joinVideoRoom`'s own reuse guard — so re-running mints nothing new. Intern
 * memberships and the config write are equally re-runnable.
 *
 * ── INTERNS-ONLY VISIBILITY ────────────────────────────────────────────────
 * The interns room is `privacy: 'cohort'` linked to the internship cohort. An
 * intern's JWT cohort is their CLASS cohort, not the internship one, so eligibility
 * comes from an active RoomMembership (seeded here for every active intern) — which
 * also hides the room from everyone else. Interns activated later need the same
 * membership; that hook is a follow-up.
 *
 * ── FAILURE PATH ───────────────────────────────────────────────────────────
 * A Zoom mint failure never aborts the run: the room still exists, its link stays
 * null, the config keeps its previous link, and a re-run completes the mint.
 */
export const INTERNS_ROOM_SLUG = 'ai-internship-standup';
export const PUBLIC_ROOM_SLUG = 'colaberry-ai-sessions';

const ZOOM_YEAR_MINUTES = 365 * 24 * 60;

export interface MeetingRoomsResult {
  interns_room: { id: string; slug: string; join_url: string | null };
  public_room: { id: string; slug: string; join_url: string | null };
  intern_members: number;
  meetings: RequiredMeeting[];
}

/**
 * Attach each meeting to its room's link + slug by audience. Pure, so the routing
 * rule (interns-only meeting → interns room; everything else → public room) is
 * tested without touching the database or Zoom.
 */
export function applyRoomLinks(
  meetings: readonly RequiredMeeting[],
  rooms: {
    internsSlug: string; internsLink: string | null;
    publicSlug: string; publicLink: string | null;
  },
): RequiredMeeting[] {
  return meetings.map((m) => {
    const interns = m.audience === 'interns_only';
    const link = interns ? rooms.internsLink : rooms.publicLink;
    return {
      ...m,
      room_slug: interns ? rooms.internsSlug : rooms.publicSlug,
      // Keep an existing link if this run could not mint one, so a Zoom outage
      // never blanks a working Join button.
      join_url: link ?? m.join_url ?? null,
    };
  });
}

async function ensureRoom(
  slug: string,
  name: string,
  privacy: 'public' | 'cohort',
  opts: { topic: string; description: string; emoji: string; linkedCohortId?: string | null },
): Promise<CommunityRoom> {
  const [room] = await CommunityRoom.findOrCreate({
    where: { slug },
    defaults: {
      slug,
      name,
      category: 'demos_events',
      room_type: 'persistent',
      privacy,
      status: 'active',
      is_video: true,
      always_open: true,
      is_system: true,
      created_by: 'system',
      topic: opts.topic,
      description: opts.description,
      linked_cohort_id: opts.linkedCohortId ?? null,
      metadata: { emoji: opts.emoji },
    },
  });
  return room;
}

/** Mint the room's persistent Zoom link once; reuse it forever after. */
async function ensureRoomLink(room: CommunityRoom): Promise<string | null> {
  if (room.meeting_link) return room.meeting_link;
  if (!isZoomConfigured()) return null;
  try {
    const res = await createMeeting({
      topic: `Colaberry — ${room.name}`,
      agenda: room.description || 'Colaberry AI meeting room',
      startDateTime: new Date().toISOString().slice(0, 19),
      durationMinutes: ZOOM_YEAR_MINUTES,
      timezone: 'America/Chicago',
    });
    if (res.joinUrl) await room.update({ meeting_link: res.joinUrl });
    return res.joinUrl ?? null;
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'backend',
      event: 'internship_room_zoom_mint_failed', outcome: 'failure',
      error_class: err?.constructor?.name ?? 'Error', context: { room_slug: room.slug },
    }));
    return null;
  }
}

export async function ensureInternshipMeetingRooms(): Promise<MeetingRoomsResult> {
  const { cohort } = await ensureInternshipCohort();

  const internsRoom = await ensureRoom(INTERNS_ROOM_SLUG, 'AI Internship', 'cohort', {
    topic: 'Interns-only standup and workspace',
    description: 'The AI Internship room: the Monday standup and a place to ask your manager questions.',
    emoji: '🧑‍💻',
    linkedCohortId: cohort.id,
  });
  const publicRoom = await ensureRoom(PUBLIC_ROOM_SLUG, 'Colaberry AI Sessions', 'public', {
    topic: 'Public AI community sessions',
    description: 'Live AI community sessions: Internship Presentation (Tue), Strategy & Collaboration (Wed), Friday Trends (Fri).',
    emoji: '📣',
  });

  const [internsLink, publicLink] = await Promise.all([
    ensureRoomLink(internsRoom),
    ensureRoomLink(publicRoom),
  ]);

  // Give every active intern access to the interns-only room.
  const interns = await CohortMembership.findAll({
    where: { cohort_id: cohort.id, membership_type: 'internship', status: 'active' },
    attributes: ['enrollment_id'],
  });
  for (const m of interns) {
    await RoomMembership.findOrCreate({
      where: { room_id: internsRoom.id, enrollment_id: (m as any).enrollment_id },
      defaults: {
        room_id: internsRoom.id,
        enrollment_id: (m as any).enrollment_id,
        role: 'member',
        access_state: 'active',
        joined_at: new Date(),
      },
    });
  }

  // Write the real links + room slugs into the cohort's meeting schedule. Base the
  // schedule on the canonical DEFAULT (the four real meetings with their audiences),
  // NOT internshipSettings(cohort).required_meetings — a cohort provisioned before
  // this feature still carries the stale 2-entry list in settings_json, and
  // internshipSettings merges that OVER the defaults, so using it would re-link the
  // wrong meetings. Every other settings key is preserved.
  const settings = internshipSettings(cohort);
  const meetings = applyRoomLinks(DEFAULT_INTERNSHIP_SETTINGS.required_meetings, {
    internsSlug: internsRoom.slug, internsLink,
    publicSlug: publicRoom.slug, publicLink,
  });
  await cohort.update({ settings_json: { ...settings, required_meetings: meetings } });

  return {
    interns_room: { id: internsRoom.id, slug: internsRoom.slug, join_url: internsLink },
    public_room: { id: publicRoom.id, slug: publicRoom.slug, join_url: publicLink },
    intern_members: interns.length,
    meetings,
  };
}
