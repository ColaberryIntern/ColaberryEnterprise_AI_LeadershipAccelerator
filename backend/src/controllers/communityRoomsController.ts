import { Request, Response } from 'express';
import { Op } from 'sequelize';
import CommunityRoom from '../models/CommunityRoom';
import RoomBooking from '../models/RoomBooking';
import RoomMembership from '../models/RoomMembership';
import CommunityMember from '../models/CommunityMember';
import { RoomAccessContext } from '../services/communityRooms/roomEntitlementService';
import * as rooms from '../services/communityRooms/roomService';
import * as members from '../services/communityRooms/roomMembershipService';
import * as bookings from '../services/communityRooms/roomBookingService';
import * as messages from '../services/communityRooms/roomMessageService';
import * as moderation from '../services/communityRooms/roomModerationService';
import { derivePresence } from '../services/communityService';
import {
  CreateRoomSchema, UpdateRoomSchema, ListRoomsQuerySchema, NotificationPrefSchema,
  PostMessageSchema, ListMessagesQuerySchema, QuestionStatusSchema,
  CreateBookingSchema, RsvpSchema, ReportSchema,
} from '../schemas/communityRoomsSchemas';

// Participant-facing Community Rooms controller. Thin: build the access context
// from the JWT, validate with Zod (safeParse → issues), delegate to services,
// and map tagged errors to HTTP status. Never trust client-provided identity —
// the enrollment id ALWAYS comes from req.participant.sub.

function ctxOf(req: Request): RoomAccessContext {
  return { enrollmentId: req.participant!.sub, cohortId: req.participant!.cohort_id, isAdmin: false };
}

function fail(res: Response, err: any): void {
  const status = typeof err?.status === 'number' ? err.status : 500;
  if (status >= 500) {
    console.error(JSON.stringify({ level: 'error', service: 'community-rooms', event: 'controller_error', error_class: err?.error_class || 'Error', message: err?.message }));
  }
  res.status(status).json({ error: err?.message || 'Internal error', error_class: err?.error_class });
}

// Safe list projection for a booking — NEVER includes meeting_link (that is only
// returned by the authorized join endpoint).
function bookingCard(b: RoomBooking) {
  return {
    id: b.id, room_id: b.room_id, title: b.title, variant: b.variant, state: b.state,
    start_at: b.start_at, end_at: b.end_at, timezone: b.timezone, privacy: b.privacy,
    capacity: b.capacity, outcome: b.outcome, host_enrollment_id: b.host_enrollment_id,
  };
}

export async function listRooms(req: Request, res: Response): Promise<void> {
  const parsed = ListRoomsQuerySchema.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid query', issues: parsed.error.issues }); return; }
  try {
    const result = await rooms.listRoomsForViewer(ctxOf(req), parsed.data);
    res.json({ rooms: result });
  } catch (err) { fail(res, err); }
}

export async function createRoom(req: Request, res: Response): Promise<void> {
  const parsed = CreateRoomSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid room', issues: parsed.error.issues }); return; }
  try {
    const room = await rooms.createRoom(ctxOf(req), parsed.data);
    res.status(201).json({ room });
  } catch (err) { fail(res, err); }
}

export async function getRoom(req: Request, res: Response): Promise<void> {
  try {
    const view = await rooms.getRoomForViewer(ctxOf(req), String(req.params.id));
    res.json(view);
  } catch (err) { fail(res, err); }
}

export async function updateRoom(req: Request, res: Response): Promise<void> {
  const parsed = UpdateRoomSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid update', issues: parsed.error.issues }); return; }
  try {
    const room = await rooms.updateRoom(ctxOf(req), String(req.params.id), parsed.data);
    res.json({ room });
  } catch (err) { fail(res, err); }
}

export async function joinRoom(req: Request, res: Response): Promise<void> {
  try { res.json({ membership: await members.joinRoom(ctxOf(req), String(req.params.id)) }); }
  catch (err) { fail(res, err); }
}

export async function requestAccess(req: Request, res: Response): Promise<void> {
  try { res.json({ membership: await members.requestAccess(ctxOf(req), String(req.params.id)) }); }
  catch (err) { fail(res, err); }
}

export async function leaveRoom(req: Request, res: Response): Promise<void> {
  try { await members.leaveRoom(ctxOf(req), String(req.params.id)); res.json({ ok: true }); }
  catch (err) { fail(res, err); }
}

export async function setNotificationPref(req: Request, res: Response): Promise<void> {
  const parsed = NotificationPrefSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid preference', issues: parsed.error.issues }); return; }
  try {
    const membership = await members.setNotificationPref(ctxOf(req), String(req.params.id), parsed.data.notification_pref);
    res.json({ membership });
  } catch (err) { fail(res, err); }
}

export async function listMessages(req: Request, res: Response): Promise<void> {
  const parsed = ListMessagesQuerySchema.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid query', issues: parsed.error.issues }); return; }
  try {
    const result = await messages.listMessages(ctxOf(req), String(req.params.id), parsed.data);
    res.json(result);
  } catch (err) { fail(res, err); }
}

export async function postMessage(req: Request, res: Response): Promise<void> {
  const parsed = PostMessageSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid message', issues: parsed.error.issues }); return; }
  try {
    const message = await messages.postMessage(ctxOf(req), String(req.params.id), parsed.data);
    res.status(201).json({ message });
  } catch (err) { fail(res, err); }
}

export async function setQuestionStatus(req: Request, res: Response): Promise<void> {
  const parsed = QuestionStatusSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid status', issues: parsed.error.issues }); return; }
  try {
    const message = await messages.setQuestionStatus(ctxOf(req), String(req.params.id), String(req.params.messageId), parsed.data.question_status);
    res.json({ message });
  } catch (err) { fail(res, err); }
}

export async function createBooking(req: Request, res: Response): Promise<void> {
  const parsed = CreateBookingSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid booking', issues: parsed.error.issues }); return; }
  try {
    const booking = await bookings.createBooking(ctxOf(req), parsed.data);
    res.status(201).json({ booking: bookingCard(booking) });
  } catch (err) { fail(res, err); }
}

export async function publishBooking(req: Request, res: Response): Promise<void> {
  try { res.json({ booking: bookingCard(await bookings.publishBooking(ctxOf(req), String(req.params.id))) }); }
  catch (err) { fail(res, err); }
}

export async function rsvpBooking(req: Request, res: Response): Promise<void> {
  const parsed = RsvpSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid RSVP', issues: parsed.error.issues }); return; }
  try {
    const attendee = await bookings.rsvp(ctxOf(req), String(req.params.id), parsed.data.rsvp_state);
    res.json({ attendee });
  } catch (err) { fail(res, err); }
}

export async function joinBooking(req: Request, res: Response): Promise<void> {
  try { res.json(await bookings.joinBooking(ctxOf(req), String(req.params.id))); }
  catch (err) { fail(res, err); }
}

export async function completeBooking(req: Request, res: Response): Promise<void> {
  try { res.json({ booking: bookingCard(await bookings.completeBooking(ctxOf(req), String(req.params.id))) }); }
  catch (err) { fail(res, err); }
}

export async function cancelBooking(req: Request, res: Response): Promise<void> {
  try { res.json({ booking: bookingCard(await bookings.cancelBooking(ctxOf(req), String(req.params.id))) }); }
  catch (err) { fail(res, err); }
}

export async function report(req: Request, res: Response): Promise<void> {
  const parsed = ReportSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Invalid report', issues: parsed.error.issues }); return; }
  try {
    const filed = await moderation.reportTarget(ctxOf(req), parsed.data);
    res.status(201).json({ report: filed });
  } catch (err) { fail(res, err); }
}

// Global events feed — only public + matching-cohort sessions (private/invite
// sessions are discovered inside their room, never leaked into a global list).
export async function listEvents(req: Request, res: Response): Promise<void> {
  const ctx = ctxOf(req);
  try {
    const rows = await RoomBooking.findAll({
      where: {
        state: { [Op.in]: ['scheduled', 'lobby_open', 'live'] },
        privacy: { [Op.in]: ['public', 'cohort'] },
      },
      include: [{ model: CommunityRoom, as: 'room' }],
      order: [['start_at', 'ASC']],
      limit: 100,
    });
    const visible = rows.filter((b) => {
      if (b.privacy === 'public') return true;
      // The 'room' include is not declared on RoomBooking's attribute type, so
      // read it off the instance; cast is scoped and justified by the include.
      const room = (b as unknown as { room?: CommunityRoom }).room;
      return !!room?.linked_cohort_id && room.linked_cohort_id === ctx.cohortId;
    });
    res.json({ events: visible.map(bookingCard) });
  } catch (err) { fail(res, err); }
}

export async function getHome(req: Request, res: Response): Promise<void> {
  const ctx = ctxOf(req);
  try {
    const audience = { [Op.in]: ['public', 'cohort'] };
    const [happeningNow, upNext, myMemberships] = await Promise.all([
      RoomBooking.findAll({ where: { state: { [Op.in]: ['live', 'lobby_open'] }, privacy: audience }, order: [['start_at', 'ASC']], limit: 10 }),
      RoomBooking.findAll({ where: { state: 'scheduled', privacy: audience, start_at: { [Op.gt]: new Date() } }, order: [['start_at', 'ASC']], limit: 3 }),
      RoomMembership.findAll({ where: { enrollment_id: ctx.enrollmentId, access_state: 'active' }, limit: 20 }),
    ]);
    const roomIds = myMemberships.map((m) => m.room_id);
    const myRooms = roomIds.length ? await CommunityRoom.findAll({ where: { id: { [Op.in]: roomIds } } }) : [];
    res.json({
      happening_now: happeningNow.map(bookingCard),
      up_next: upNext.map(bookingCard),
      my_rooms: myRooms.map((r) => ({ id: r.id, name: r.name, category: r.category, privacy: r.privacy })),
    });
  } catch (err) { fail(res, err); }
}

// People directory — reuses the existing CommunityMember profile store.
export async function getPeople(_req: Request, res: Response): Promise<void> {
  try {
    const people = await CommunityMember.findAll({
      order: [['last_active_at', 'DESC']],
      limit: 100,
    });
    res.json({
      people: people.map((m) => ({
        id: m.id,
        display_name: m.display_name,
        avatar_url: m.avatar_url,
        level: m.level,
        presence: derivePresence(m.last_active_at),
      })),
    });
  } catch (err) { fail(res, err); }
}
