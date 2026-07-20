import { Router, Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { requireParticipant } from '../middlewares/participantAuth';
import { requireAdmin } from '../middlewares/authMiddleware';
import * as c from '../controllers/communityRoomsController';
import * as admin from '../controllers/communityRoomsAdminController';

// Colaberry Commons — Community Rooms routes. Participant surface under
// /api/portal/community/* (matches the existing community feed convention),
// admin under /api/admin/community/rooms/*. Every route is flag-gated: when
// COMMUNITY_ROOMS_ENABLED is off the whole surface 404s (feature ships dark).

const router = Router();

// Placed BEFORE auth so a disabled feature returns a clean 404 rather than a 401.
function flagGate(_req: Request, res: Response, next: NextFunction): void {
  if (!env.communityRoomsEnabled) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  next();
}

const P = '/api/portal/community';
const A = '/api/admin/community/rooms';

// --- Participant surface ---
router.get(`${P}/home`, flagGate, requireParticipant, c.getHome);
router.get(`${P}/people`, flagGate, requireParticipant, c.getPeople);
router.get(`${P}/events`, flagGate, requireParticipant, c.listEvents);

router.get(`${P}/rooms`, flagGate, requireParticipant, c.listRooms);
router.post(`${P}/rooms`, flagGate, requireParticipant, c.createRoom);
router.get(`${P}/rooms/:id`, flagGate, requireParticipant, c.getRoom);
router.patch(`${P}/rooms/:id`, flagGate, requireParticipant, c.updateRoom);
router.post(`${P}/rooms/:id/join`, flagGate, requireParticipant, c.joinRoom);
router.post(`${P}/rooms/:id/join-video`, flagGate, requireParticipant, c.joinVideoRoom);
router.post(`${P}/rooms/:id/presence`, flagGate, requireParticipant, c.roomPresence);
router.post(`${P}/rooms/:id/invite`, flagGate, requireParticipant, c.invite);
router.delete(`${P}/rooms/:id`, flagGate, requireParticipant, c.deleteRoom);
router.post(`${P}/rooms/:id/request-access`, flagGate, requireParticipant, c.requestAccess);
router.post(`${P}/rooms/:id/leave`, flagGate, requireParticipant, c.leaveRoom);
router.patch(`${P}/rooms/:id/notification`, flagGate, requireParticipant, c.setNotificationPref);
router.get(`${P}/rooms/:id/messages`, flagGate, requireParticipant, c.listMessages);
router.post(`${P}/rooms/:id/messages`, flagGate, requireParticipant, c.postMessage);
router.patch(`${P}/rooms/:id/messages/:messageId/question`, flagGate, requireParticipant, c.setQuestionStatus);

router.post(`${P}/bookings`, flagGate, requireParticipant, c.createBooking);
router.post(`${P}/bookings/:id/publish`, flagGate, requireParticipant, c.publishBooking);
router.post(`${P}/bookings/:id/rsvp`, flagGate, requireParticipant, c.rsvpBooking);
router.post(`${P}/bookings/:id/join`, flagGate, requireParticipant, c.joinBooking);
router.post(`${P}/bookings/:id/complete`, flagGate, requireParticipant, c.completeBooking);
router.post(`${P}/bookings/:id/cancel`, flagGate, requireParticipant, c.cancelBooking);

router.post(`${P}/moderation/reports`, flagGate, requireParticipant, c.report);

// --- Admin surface ---
router.get(`${A}/health`, flagGate, requireAdmin, admin.getHealth);
router.get(`${A}/reports`, flagGate, requireAdmin, admin.listReports);
router.patch(`${A}/reports/:id`, flagGate, requireAdmin, admin.resolveReport);

export default router;
