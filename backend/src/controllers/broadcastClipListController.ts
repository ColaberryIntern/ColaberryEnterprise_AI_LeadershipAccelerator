import { Request, Response, NextFunction } from 'express';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { listClipMarkers } from '../services/broadcast/broadcastClipMarkerService';
import {
  buildClipRows,
  clipListFilename,
  toCsv,
} from '../services/broadcast/broadcastClipListExport';

/**
 * The clip list for a class that aired (L7.3).
 *
 * WHY THIS ROUTE EXISTS AT ALL, rather than being left for later. This subsystem has a repeated
 * habit of shipping something complete and tested that nothing reads: the heartbeat route had
 * no caller, `ended_at` and `provider_instance_uuid` were never written, and the replay states
 * were legal but unreachable. Markers written on every advance with no way to read them would
 * be the same mistake in a new place, and it would not be visible from a passing test suite.
 *
 * AND IT WENT UNREAD ANYWAY, for a week, until 2026-11-01. The paragraph above names the exact
 * habit this route then fell into: it shipped with no caller in `frontend/src` and became the
 * last open item in spec §8 finding 2. Writing the warning did not prevent the thing it warned
 * about, which is the argument for the reader being part of the same change rather than a
 * follow-up — a comment is not a gate.
 *
 * ADMIN ONLY. A clip list names what is worth cutting out of a class, which is editorial
 * material about a private broadcast; it is not something a viewer should be able to enumerate.
 */

interface AiringRow {
  id: string;
  editorial_state: string;
  content_started_at: Date | null;
  /**
   * The recording's end, and the reason the last clip can have no out point. Null on real
   * production rows: the column existed from the start and nothing wrote it until L7.4.
   */
  ended_at: Date | null;
}

/**
 * The airing this session produced, or null.
 *
 * Extracted rather than written twice. The source ref is the only join from a session to its
 * occurrence, and both handlers below need the same three instants — a second copy of this
 * query is a second place to forget that `ended_at` is part of the answer.
 */
async function findAiring(sessionId: string): Promise<AiringRow | null> {
  const rows = await sequelize.query<AiringRow>(
    `SELECT o.id, o.editorial_state, o.content_started_at, o.ended_at
       FROM broadcast_source_refs r
       JOIN broadcast_occurrences o ON o.id = r.occurrence_id
      WHERE r.source_type = 'live_session' AND r.source_id = :sid
      LIMIT 1`,
    { replacements: { sid: sessionId }, type: QueryTypes.SELECT },
  );
  return rows[0] ?? null;
}

/**
 * The wire shape of one clip.
 *
 * Mapped rather than passed straight through, because the rest of this response — `aired`,
 * `occurrence_id`, `content_started_at` — is snake_case, and so is every other broadcast route
 * the frontend reads. One body with both conventions in it is a thing every future caller has to
 * remember. The camelCase `ClipRow` stays the internal type, where it belongs.
 */
function wireClip(r: ReturnType<typeof buildClipRows>[number]) {
  return {
    clip: r.clip,
    slide_index: r.slideIndex,
    in_seconds: r.inSeconds,
    out_seconds: r.outSeconds,
    duration_seconds: r.durationSeconds,
    in_timecode: r.inTimecode,
    out_timecode: r.outTimecode,
    duration_timecode: r.durationTimecode,
    candidate: r.candidate,
    label: r.label,
    segment_label: r.segmentLabel,
    slide_title: r.slideTitle,
  };
}

export async function handleGetSessionClipList(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = req.params.id as string;
    const occurrence = await findAiring(sessionId);

    if (!occurrence) {
      // Not an error: most sessions are taught without being broadcast. Saying "no airing" is
      // a different and more useful answer than an empty list, which would read as "this aired
      // and nobody marked anything".
      res.json({ aired: false, occurrence_id: null, clips: [] });
      return;
    }

    const markers = await listClipMarkers(occurrence.id);

    /**
     * THE RANGES ARE DERIVED HERE, ONCE.
     *
     * A marker is a start point; an editor needs in, out and duration. The pairing rule lives in
     * `broadcastClipListExport` and is shared with the CSV below, so the UI never implements a
     * second copy of "the out point is the next marker's in point" — which is exactly the
     * duplication this subsystem keeps paying for.
     *
     * This replaces the `markers` array the route used to return. That is a response-shape
     * change to a shipped route, and it is safe for the one reason that made this whole feature
     * a finding in the first place: nothing in `frontend/src` has ever read it. The first reader
     * lands in this same change.
     */
    res.json({
      aired: true,
      occurrence_id: occurrence.id,
      editorial_state: occurrence.editorial_state,
      // Null until a producer marks content as started. Without it no marker could have been
      // recorded at all, so an empty list alongside a null anchor explains itself.
      content_started_at: occurrence.content_started_at,
      ended_at: occurrence.ended_at,
      clips: buildClipRows(markers, {
        contentStartedAt: occurrence.content_started_at,
        endedAt: occurrence.ended_at,
      }).map(wireClip),
    });
  } catch (err) { next(err); }
}

/**
 * The same clip list as a file the editor opens (R7's first brick, §9 item 6).
 *
 * WHY A DOWNLOAD RATHER THAN A SCRIPT. The requirement is "clip candidates out of the system in
 * a form an editor can open", and the data lives only in production. A script would have to be
 * run on the production host, which nobody with the editing job has a shell on; a URL an admin
 * can click produces the same file from the machine they are already signed in on.
 *
 * A CLASS THAT NEVER AIRED GETS A REFUSAL, NOT AN EMPTY FILE. CSV has no room to say "this was
 * never broadcast" — a header-only file would assert that the class aired and nobody marked
 * anything, which is a different and wrong statement. A class that DID air with no markers gets
 * the header-only file, because that claim is true.
 */
export async function handleGetSessionClipListCsv(req: Request, res: Response, next: NextFunction) {
  try {
    const sessionId = req.params.id as string;
    const occurrence = await findAiring(sessionId);

    if (!occurrence) {
      res.status(404).json({ error: 'This session has no broadcast, so there is no clip list.' });
      return;
    }

    const markers = await listClipMarkers(occurrence.id);
    const clips = buildClipRows(markers, {
      contentStartedAt: occurrence.content_started_at,
      endedAt: occurrence.ended_at,
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${clipListFilename(sessionId, occurrence.content_started_at)}"`,
    );
    // Editorial material about a private broadcast: not something to leave in a shared cache.
    res.setHeader('Cache-Control', 'no-store');
    res.send(toCsv(clips));
  } catch (err) { next(err); }
}
