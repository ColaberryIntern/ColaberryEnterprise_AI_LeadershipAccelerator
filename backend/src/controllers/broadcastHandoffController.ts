import { Request, Response, NextFunction } from 'express';
import { QueryTypes } from 'sequelize';
import { z } from 'zod';
import { sequelize } from '../config/database';
import {
  postShowCheck, handoffPackage, handoffNotice,
  type HandoffAiring, type HandoffClipSummary,
} from '../services/broadcast/broadcastHandoffPolicy';
import { listClipMarkers } from '../services/broadcast/broadcastClipMarkerService';
import { listClipMarks } from '../services/broadcast/broadcastClipMarkService';
import { listClipDecisions } from '../services/broadcast/broadcastClipDecisionService';
import { resolveDecision } from '../services/broadcast/broadcastClipDecisionPolicy';

/**
 * D12 — what the videographer is owed for one airing, and what is actually there.
 *
 * Admin only, and the same material as the clip list: editorial notes about a private
 * broadcast. Its own controller because `broadcastClipListController` already owns two handlers
 * and the size rule in CLAUDE.md is the reason the rundown and the clip mark each got their own.
 *
 * The verdicts are entirely in `broadcastHandoffPolicy`, which is pure. This is the four reads
 * that feed it.
 */

const Params = z.object({ id: z.string().uuid() });

interface AiringRow extends HandoffAiring { id: string }

async function findAiring(sessionId: string): Promise<AiringRow | null> {
  const rows = await sequelize.query<AiringRow>(
    `SELECT o.id, o.editorial_state, o.provider_session_id, o.provider_instance_uuid,
            o.content_started_at, o.ended_at, o.end_reason
       FROM broadcast_source_refs r
       JOIN broadcast_occurrences o ON o.id = r.occurrence_id
      WHERE r.source_type = 'live_session' AND r.source_id = :sid
      LIMIT 1`,
    { replacements: { sid: sessionId }, type: QueryTypes.SELECT },
  );
  return rows[0] ?? null;
}

/** GET /api/admin/accelerator/sessions/:id/handoff */
export async function handleGetSessionHandoff(req: Request, res: Response, next: NextFunction) {
  try {
    const params = Params.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: 'ValidationError', reason: 'session_id_must_be_a_uuid' });
      return;
    }

    const occurrence = await findAiring(params.data.id);
    /**
     * A class that never aired is not an error and not an empty handoff: it is a class with no
     * recording, and saying so is the whole answer. The clip list makes the same distinction
     * with the same shape, so the two panels agree about what "never aired" looks like.
     */
    if (!occurrence) {
      res.json({ aired: false, post_show: [], package: [], notice: null });
      return;
    }

    const [markers, marks, decisions] = await Promise.all([
      listClipMarkers(occurrence.id),
      listClipMarks(occurrence.id),
      listClipDecisions(occurrence.id),
    ]);

    /**
     * `kept` counts moments whose SEGMENT currently reads keep, defaults included, because that
     * is what an editor would actually carry forward. `decided` counts only segments a person
     * judged - the two are deliberately different, for the reason D11 exists: a default and a
     * decision can agree and still be different facts.
     */
    const allMoments = [
      ...markers.map((m) => ({ segmentId: (m.segment_id || '').trim() })),
      ...marks.map((m) => ({ segmentId: (m.segment_id || '').trim() })),
    ];
    const summary: HandoffClipSummary = {
      total: allMoments.length,
      live: marks.length,
      decided: Object.keys(decisions).length,
      kept: allMoments.filter(
        (m) => resolveDecision(m.segmentId, decisions[m.segmentId]).decision === 'keep',
      ).length,
    };

    const pkg = handoffPackage(occurrence, summary);
    res.json({
      aired: true,
      occurrence_id: occurrence.id,
      editorial_state: occurrence.editorial_state,
      post_show: postShowCheck(occurrence),
      package: pkg,
      // The notice is computed over the PACKAGE, not over both lists: the post-show check is a
      // thing to do in the room, and the package is the thing to hand over.
      notice: handoffNotice(pkg),
      post_show_notice: handoffNotice(postShowCheck(occurrence)),
    });
  } catch (err) { next(err); }
}
