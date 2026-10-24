import { Request, Response, NextFunction } from 'express';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { listClipMarkers } from '../services/broadcast/broadcastClipMarkerService';
import { formatTimecode } from '../services/broadcast/broadcastClipMarkerPolicy';

/**
 * The clip list for a class that aired (L7.3).
 *
 * WHY THIS ROUTE EXISTS AT ALL, rather than being left for later. This subsystem has a repeated
 * habit of shipping something complete and tested that nothing reads: the heartbeat route had
 * no caller, `ended_at` and `provider_instance_uuid` were never written, and the replay states
 * were legal but unreachable. Markers written on every advance with no way to read them would
 * be the same mistake in a new place, and it would not be visible from a passing test suite.
 *
 * ADMIN ONLY. A clip list names what is worth cutting out of a class, which is editorial
 * material about a private broadcast; it is not something a viewer should be able to enumerate.
 */

interface ClipListRow {
  slide_index: number;
  timecode_seconds: number;
  label: string;
  segment_label: string | null;
  slide_title: string | null;
}

export async function handleGetSessionClipList(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = req.params.id as string;

    // The source ref is the only join from a session to its airing.
    const rows = await sequelize.query<{ id: string; editorial_state: string; content_started_at: Date | null }>(
      `SELECT o.id, o.editorial_state, o.content_started_at
         FROM broadcast_source_refs r
         JOIN broadcast_occurrences o ON o.id = r.occurrence_id
        WHERE r.source_type = 'live_session' AND r.source_id = :sid
        LIMIT 1`,
      { replacements: { sid: sessionId }, type: QueryTypes.SELECT },
    );
    const occurrence = rows[0];

    if (!occurrence) {
      // Not an error: most sessions are taught without being broadcast. Saying "no airing" is
      // a different and more useful answer than an empty list, which would read as "this aired
      // and nobody marked anything".
      res.json({ aired: false, occurrence_id: null, markers: [] });
      return;
    }

    const markers = (await listClipMarkers(occurrence.id)) as ClipListRow[];

    res.json({
      aired: true,
      occurrence_id: occurrence.id,
      editorial_state: occurrence.editorial_state,
      // Null until a producer marks content as started. Without it no marker could have been
      // recorded at all, so an empty list alongside a null anchor explains itself.
      content_started_at: occurrence.content_started_at,
      markers: markers.map((m) => ({
        slide_index: m.slide_index,
        timecode_seconds: m.timecode_seconds,
        timecode: formatTimecode(m.timecode_seconds),
        label: m.label,
        segment_label: m.segment_label,
        slide_title: m.slide_title,
      })),
    });
  } catch (err) { next(err); }
}
