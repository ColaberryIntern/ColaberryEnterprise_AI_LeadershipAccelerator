import { Request, Response, NextFunction } from 'express';
import { isStaffEnrollment } from '../services/access/staffAccess';

// Populates req.participant.isStaff for the Community Rooms surface. Must run
// after requireParticipant (needs req.participant.sub). This is the single
// place Rooms learns "is this participant staff" — communityRoomsController's
// ctxOf() reads it synchronously so the ~25 existing call sites don't need to
// become async. Fail-safe to false on lookup error (isStaffEnrollment's own
// contract), so a DB blip never silently grants staff-only actions.
export async function attachCommunityStaffContext(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const enrollmentId = req.participant?.sub;
  req.participant!.isStaff = enrollmentId ? await isStaffEnrollment(enrollmentId) : false;
  next();
}
