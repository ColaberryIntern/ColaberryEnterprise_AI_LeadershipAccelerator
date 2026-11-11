import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { isStaff } from '../middlewares/participantStaff';
import { recordLiveClipMark } from '../services/broadcast/broadcastClipMarkService';

/**
 * D10 — POST a moment the producer chose.
 *
 * A SEPARATE CONTROLLER, for the reason the rundown handler gives: `broadcastController.ts` is
 * past CLAUDE.md's 500-line hard ceiling, so the next change to it owes a split before it may
 * add code. This handler is new code, so it goes in its own file rather than borrowing that
 * file's grandfathering.
 *
 * ## The body carries nothing about the moment
 *
 * Only the session id, from the path. Not the timecode, not the slide, not a label. The server
 * reads which airing this session is bound to, how far into the recording it is now, where the
 * deck says the class is, and whether that slide can be trusted. A client allowed to name its
 * own timecode could point a clip at any second of the recording, including one in a class it
 * is not watching.
 *
 * ## Why the refusals are 409 and not 400
 *
 * Nothing the caller sent is malformed. "The class is not on air" and "content has not started"
 * are facts about the world at this instant that will be different in a minute, which is what
 * 409 means and 400 does not. The one 400 case would be a malformed session id, which the
 * schema rejects before any of this runs.
 */

const SessionParam = z.object({ sessionId: z.string().uuid() });

/**
 * Refusal reason to status. Everything here is a state conflict rather than a bad request.
 *
 * `failed` is deliberately 500: the press did not land and the producer must not be told it
 * did. The strip says so out loud, because a producer who believes a moment is captured stops
 * paying attention to it.
 */
const REFUSAL_STATUS: Record<string, number> = {
  no_occurrence: 409,
  not_on_air: 409,
  no_content_anchor: 409,
  before_content_start: 409,
  no_slide_context: 409,
};

/** POST /api/portal/broadcasts/session/:sessionId/clip-mark */
export async function postClipMark(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const params = SessionParam.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: 'ValidationError', reason: 'session_id_must_be_a_uuid' });
      return;
    }

    /**
     * The same gate the producer's other controls use, asserted rather than inferred.
     *
     * A viewer who could mark clips could write rows against an airing they are merely watching.
     * The strip hides itself for anyone the server does not call a producer, but a hidden
     * control is a UI fact and this is the security one.
     */
    if (!isStaff(req)) {
      res.status(403).json({ error: 'Forbidden', reason: 'not_a_producer' });
      return;
    }

    const result = await recordLiveClipMark({ sessionId: params.data.sessionId });

    if (result.outcome === 'marked') {
      res.status(201).json({
        outcome: 'marked',
        timecode_seconds: result.timecodeSeconds,
        labelled: result.labelled,
      });
      return;
    }
    if (result.outcome === 'duplicate') {
      // 200, not 201: nothing was created. The press was correct and did nothing, and the strip
      // says "already marked" rather than claiming a second clip.
      res.status(200).json({ outcome: 'duplicate', timecode_seconds: result.timecodeSeconds });
      return;
    }
    if (result.outcome === 'refused') {
      res.status(REFUSAL_STATUS[result.reason] ?? 409).json({
        outcome: 'refused', reason: result.reason,
      });
      return;
    }
    res.status(500).json({ outcome: 'failed', reason: 'mark_not_recorded' });
  } catch (err) { next(err); }
}
