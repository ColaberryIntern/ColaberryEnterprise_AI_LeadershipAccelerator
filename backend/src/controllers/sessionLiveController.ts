import { Request, Response, NextFunction } from 'express';
import { recordPulse, getLiveState, isValidPulseState } from '../services/sessionLiveStateService';

// Live class pulse: students set their status from the phone; the instructor's
// Class Kit deck reads aggregate counts + recent questions.

/** POST /api/portal/sessions/:id/pulse — a student sets their live status. */
export async function handleRecordPulse(req: Request, res: Response, next: NextFunction) {
  try {
    const { state } = req.body || {};
    if (!isValidPulseState(state)) {
      return res.status(400).json({ error: 'state must be one of: here, building, stuck, finished' });
    }
    const enrollmentId = req.participant!.sub;
    await recordPulse(req.params.id as string, enrollmentId, state);
    res.json({ success: true, state });
  } catch (err) { next(err); }
}

/**
 * GET /api/portal/sessions/:id/live-state — aggregate pulse + recent questions.
 * Auth is applied at the route (kit token scoped to this session, OR an admin
 * JWT). Never exposes PII beyond first names already in the class chat.
 */
export async function handleGetLiveState(req: Request, res: Response, next: NextFunction) {
  try {
    const state = await getLiveState(req.params.id as string);
    res.json(state);
  } catch (err) { next(err); }
}
