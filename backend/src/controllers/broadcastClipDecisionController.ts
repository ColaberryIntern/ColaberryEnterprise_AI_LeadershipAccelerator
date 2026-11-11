import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { isClipDecision } from '../services/broadcast/broadcastClipDecisionPolicy';
import { setClipDecision, airedOccurrenceId } from '../services/broadcast/broadcastClipDecisionService';

/**
 * D11 — PUT the keep-or-cut decision for one segment of one airing.
 *
 * Its own controller for the reason the rundown and clip-mark handlers give:
 * `broadcastClipListController.ts` reads, this writes, and a file that does both grows into the
 * thing CLAUDE.md's size rule exists to prevent.
 *
 * ## Admin-gated, like the clip list it edits
 *
 * This sits on the ADMIN accelerator routes beside `GET .../clip-list`, not on the portal
 * broadcast routes beside the producer's controls. The producer's press happens during the
 * show, from the portal, by whoever is running it. An edit decision happens afterwards, in the
 * admin tool, by whoever is cutting the video. Different people, different time, different
 * surface - so it inherits `requireAdmin` from its route rather than the producer's staff check.
 *
 * ## PUT, not POST
 *
 * The decision for a segment is a value, not an event: setting it twice leaves the same state,
 * which is what idempotent means and what PUT promises. The service upserts, so changing your
 * mind is the normal path rather than a conflict.
 */

const Params = z.object({ id: z.string().uuid(), segmentId: z.string().min(1).max(120) });

/** PUT /api/admin/accelerator/sessions/:id/clip-decisions/:segmentId  { decision } */
export async function putClipDecision(req: Request, res: Response, next: NextFunction) {
  try {
    const params = Params.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: 'ValidationError', reason: 'bad_session_or_segment' });
      return;
    }

    const { decision } = (req.body || {}) as { decision?: unknown };
    /**
     * Rejected rather than defaulted. A route that read an unknown value as "keep" would answer
     * 200 to a request it did not understand, and the caller would believe a decision was
     * recorded - the failure mode that makes a review tool untrustworthy, because the screen
     * and the database disagree and nothing says so.
     */
    if (!isClipDecision(decision)) {
      res.status(400).json({ error: 'ValidationError', reason: 'decision_must_be_keep_or_cut' });
      return;
    }

    const occurrenceId = await airedOccurrenceId(params.data.id);
    if (!occurrenceId) {
      // Not 404 on the session: the session may well exist. What is missing is an AIRING, and
      // a decision about footage that was never recorded has nothing to attach to.
      res.status(409).json({ error: 'Conflict', reason: 'session_never_aired' });
      return;
    }

    await setClipDecision(occurrenceId, params.data.segmentId, decision);
    res.json({ segment_id: params.data.segmentId, decision, decided: true });
  } catch (err) { next(err); }
}
