import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireParticipant } from '../middlewares/participantAuth';
import { env } from '../config/env';
import { campusOnFor } from '../services/campus/campusPilot';
import { getHallway } from '../services/campus/campusHallway';
import { sendValidated, logFailure } from './campusRoutes';

/**
 * Campus Meeting Rooms hallway (Basecamp C29, v7 R2). Read-only, participant-authed per route and behind the campus pilot, like
 * every campus route. Creating a room, booking a session and joining all go through the existing Community Rooms endpoints
 * (/api/portal/community/rooms|bookings): this route only reads what the doors show. See services/campus/campusHallway.ts.
 *
 *   GET /api/portal/campus/hallway   { rooms, bookings, reese_id }
 */
const Person = z.object({ enrollment_id: z.string(), display_name: z.string(), avatar_url: z.string().nullable(), friend: z.boolean() }).strict();
const Room = z.object({
  room_id: z.string(), name: z.string(), sub: z.string(), emoji: z.string().nullable(), privacy: z.string(), mine: z.boolean(),
  inside_count: z.number().int().nonnegative(), inside: z.array(Person).max(4),
}).strict();
const Booking = z.object({
  booking_id: z.string(), room_id: z.string(), title: z.string(), start_at: z.string(), end_at: z.string().nullable(), state: z.string(), hosting: z.boolean(),
}).strict();
export const HallwayResponse = z.object({ rooms: z.array(Room), bookings: z.array(Booking), reese_id: z.string().nullable() }).strict();

export async function getHallwayRoute(req: Request, res: Response): Promise<void> {
  if (!campusOnFor(req)) { res.status(403).json({ error: 'The campus is not enabled for this account', error_class: 'CampusNotEnabled' }); return; }
  // The doors' actions go through the Community Rooms API; with that surface dark (COMMUNITY_ROOMS_ENABLED off) the hallway is too
  if (!env.communityRoomsEnabled) { res.status(404).json({ error: 'Not found', error_class: 'RoomsDisabled' }); return; }
  const p = req.participant!;
  try {
    const hallway = await getHallway({ enrollmentId: p.sub, cohortId: p.cohort_id, isAdmin: p.isStaff === true });
    sendValidated(res, HallwayResponse, hallway, 'campus_hallway');
  } catch (err) {
    logFailure('campus_hallway_failed', err);
    res.status(500).json({ error: 'Could not load the meeting rooms', error_class: 'HallwayUnavailable' });
  }
}

const router = Router();
router.get('/api/portal/campus/hallway', requireParticipant, getHallwayRoute);
export default router;
