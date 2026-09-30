import { Router, Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { requireParticipant } from '../middlewares/participantAuth';
import { attachCommunityStaffContext } from '../middlewares/communityRoomsStaffContext';
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

// attachCommunityStaffContext resolves req.participant.isStaff (one DB lookup)
// so ctxOf() can populate RoomAccessContext.isAdmin — previously hardcoded
// false, which made every staff-only rule in this domain unenforceable.
const participantChain = [flagGate, requireParticipant, attachCommunityStaffContext];

// --- Participant surface ---
router.get(`${P}/home`, ...participantChain, c.getHome);
router.get(`${P}/people`, ...participantChain, c.getPeople);
router.get(`${P}/events`, ...participantChain, c.listEvents);
router.get(`${P}/impact`, ...participantChain, c.impact);
router.get(`${P}/library`, ...participantChain, c.getLibrary);

router.get(`${P}/rooms`, ...participantChain, c.listRooms);
router.post(`${P}/rooms`, ...participantChain, c.createRoom);
router.get(`${P}/rooms/:id`, ...participantChain, c.getRoom);
router.patch(`${P}/rooms/:id`, ...participantChain, c.updateRoom);
router.post(`${P}/rooms/:id/join`, ...participantChain, c.joinRoom);
router.post(`${P}/rooms/:id/join-video`, ...participantChain, c.joinVideoRoom);
router.post(`${P}/rooms/:id/presence`, ...participantChain, c.roomPresence);
router.post(`${P}/rooms/:id/invite`, ...participantChain, c.invite);
router.delete(`${P}/rooms/:id`, ...participantChain, c.deleteRoom);
router.post(`${P}/rooms/:id/request-access`, ...participantChain, c.requestAccess);
router.post(`${P}/rooms/:id/leave`, ...participantChain, c.leaveRoom);
router.patch(`${P}/rooms/:id/notification`, ...participantChain, c.setNotificationPref);
router.get(`${P}/rooms/:id/messages`, ...participantChain, c.listMessages);
router.post(`${P}/rooms/:id/messages`, ...participantChain, c.postMessage);
router.patch(`${P}/rooms/:id/messages/:messageId/question`, ...participantChain, c.setQuestionStatus);
router.post(`${P}/rooms/:id/messages/:messageId/verify-answer`, ...participantChain, c.verifyAnswer);

router.get(`${P}/rooms/:id/bookings`, ...participantChain, c.listRoomBookings);
router.get(`${P}/rooms/:id/resources`, ...participantChain, c.listResources);
router.post(`${P}/rooms/:id/resources`, ...participantChain, c.createResource);
router.post(`${P}/rooms/:id/resources/file`, ...participantChain, c.uploadResourceFile);
router.delete(`${P}/rooms/:id/resources/:resourceId`, ...participantChain, c.deleteResource);
router.get(`${P}/rooms/:id/resources/:resourceId/download`, ...participantChain, c.downloadResource);

router.post(`${P}/bookings`, ...participantChain, c.createBooking);
router.post(`${P}/bookings/:id/publish`, ...participantChain, c.publishBooking);
router.post(`${P}/bookings/:id/rsvp`, ...participantChain, c.rsvpBooking);
router.post(`${P}/bookings/:id/join`, ...participantChain, c.joinBooking);
router.post(`${P}/bookings/:id/complete`, ...participantChain, c.completeBooking);
router.post(`${P}/bookings/:id/cancel`, ...participantChain, c.cancelBooking);

router.post(`${P}/moderation/reports`, ...participantChain, c.report);

// --- Admin surface ---
router.get(`${A}/health`, flagGate, requireAdmin, admin.getHealth);
router.get(`${A}/reports`, flagGate, requireAdmin, admin.listReports);
router.patch(`${A}/reports/:id`, flagGate, requireAdmin, admin.resolveReport);

export default router;
