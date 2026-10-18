/**
 * presentationPlaybackRoutes — serving one learner's own rehearsal video.
 *
 * WHY THIS IS ITS OWN FILE, MOUNTED SEPARATELY.
 *
 * `participantRoutes` gates the whole `/api/portal/projects` prefix:
 *
 *     router.use('/api/portal/projects', requireParticipant, requireContentEntitlement('projects'));
 *
 * That line runs before the Studio routes are mounted, so EVERY path under that
 * prefix demands a bearer token no matter what the individual route declares. The
 * playback route cannot satisfy it: a `<video src>` issues a plain browser GET and
 * carries no Authorization header. Removing `requireParticipant` from the route
 * itself changed nothing, because the request never reached it — production returned
 * `{"error":"Authentication required"}` from the prefix gate (2026-10-15).
 *
 * This is the third time this codebase has hit "correct route, unreachable because of
 * an earlier mount" — see the calendar booking 401 and the `/i/` recurrence. The
 * answer here is not to poke a hole in the gate, which would weaken it for every
 * other project path, but to mount this one route BEFORE it.
 *
 * ORDERING IS LOAD-BEARING AND IS TESTED. `presentationPlaybackMountOrder.test.ts`
 * asserts this mount precedes the gate. Move it after, and playback silently 401s
 * again with every unit test still green.
 *
 * AUTHENTICATION IS THE SIGNED TICKET, AND THE ACCESS QUERY UNDERNEATH IT. The
 * ticket says "this link was issued to you"; `resolveViewableRecording` says "and you
 * are allowed to watch it". Either alone would be enough to serve somebody else's
 * video.
 *
 * THE RESOLVER IS THE AUDIENCE-AWARE ONE, AND THAT IS NOT A DETAIL. This route first
 * shipped calling `resolvePlayableRecording`, which proves OWNERSHIP — right for a
 * private rehearsal, and wrong the moment a demo is published to a cohort. The
 * audience-aware path existed, with eleven refusal tests, and nothing called it: every
 * peer clicking a published demo got a 404 while the page above it said "public". The
 * viewable resolver tries the owner path FIRST and only then falls through to
 * `canView`, so it is a strict superset — Step 4 is unaffected and Step 5 works.
 */
import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import { env } from '../config/env';
import { gate, fail } from './portalRouteHelpers';

const router = Router();

router.get('/api/portal/projects/:projectId/tasks/:storyId/recordings/:recordingId/file', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!gate(res)) return;
    if (!env.presentationStudioEnabled) return res.status(404).json({ error: 'Presentation Studio not enabled' });

    const { verifyRecordingTicket } = await import('../services/presentation/recordingTicket');
    const claims = verifyRecordingTicket(typeof req.query.t === 'string' ? req.query.t : null);
    // Same answer as a missing recording. A distinct code would tell an unauthorised
    // caller that the id they guessed is real.
    if (!claims || claims.recordingId !== String(req.params.recordingId)) {
      return res.status(404).json({ error: 'Not found' });
    }

    const { resolveViewableRecording } = await import('../services/presentation/recordingPlayback');
    const r = await resolveViewableRecording(
      claims.enrollmentId,
      String(req.params.projectId),
      String(req.params.storyId),
      String(req.params.recordingId),
    );
    if (!r.ok) {
      if (r.reason === 'file_missing') {
        // Distinct from "no such recording": the row is real and theirs, the bytes
        // are not here. A learner told "not found" about a rehearsal they remember
        // doing is the kind of answer that destroys trust in the feature.
        return res.status(409).json({ error: 'This take is recorded but the video file is not available. Staff can retry collecting it.' });
      }
      return res.status(404).json({ error: 'Not found' });
    }

    const { filePath, sizeBytes, mimeType, downloadName, ownerEnrollmentId } = r.recording;

    // COUNT THE VIEWER, NOT THE REQUEST, and never the owner.
    //
    // This route is the one chokepoint every byte passes through, so it is where a
    // view is observable - but a player makes many requests per watch, so the count
    // lives on DISTINCT viewers rather than a per-request counter. Deliberately not
    // awaited: recording a view must never delay or fail the serving of bytes. A
    // count one short is a smaller harm than a video that will not start.
    void import('../services/presentation/recordingViews')
      .then(({ recordView }) => recordView(String(req.params.recordingId), claims.enrollmentId, ownerEnrollmentId))
      .catch(() => { /* a missed view is not worth an error page */ });
    const { parseRange, contentRangeHeader, rangeLength } = await import('../services/presentation/byteRange');
    const outcome = parseRange(req.headers.range, sizeBytes);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', `inline; filename="${downloadName}"`);

    if (outcome.kind === 'unsatisfiable') {
      res.setHeader('Content-Range', `bytes */${sizeBytes}`);
      return res.status(416).end();
    }

    if (outcome.kind === 'partial') {
      const { range } = outcome;
      res.status(206);
      res.setHeader('Content-Range', contentRangeHeader(range, sizeBytes));
      res.setHeader('Content-Length', String(rangeLength(range)));
      return fs.createReadStream(filePath, { start: range.start, end: range.end }).pipe(res);
    }

    res.setHeader('Content-Length', String(sizeBytes));
    return fs.createReadStream(filePath).pipe(res);
  } catch (e) { fail(res, e, next); }
});

/**
 * THE POSTER FRAME — same authority as the video, because it IS the video.
 *
 * A still of a private rehearsal is the learner's face. Serving thumbnails on a
 * looser rule than playback would mean the picture leaks where the footage does
 * not, so this resolves through exactly the same `resolveViewableRecording` and
 * the same signed ticket. The only difference is what gets sent.
 *
 * A MISSING THUMBNAIL IS A 404, NEVER AN ERROR. Generation fails for real and
 * ordinary reasons — a camera-off recording has no frame worth showing at all —
 * and the card simply falls back to its poster-less player. Nothing about a demo
 * should break because a picture could not be made.
 *
 * NOT COUNTED AS A VIEW. The feed renders a poster for every demo on the page
 * whether or not anybody watches; counting those would make the number mean
 * "scrolled past" instead of "watched", which is worse than having no number.
 */
router.get('/api/portal/projects/:projectId/tasks/:storyId/recordings/:recordingId/thumbnail', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!gate(res)) return;
    if (!env.presentationStudioEnabled) return res.status(404).json({ error: 'Presentation Studio not enabled' });

    const { verifyRecordingTicket } = await import('../services/presentation/recordingTicket');
    const claims = verifyRecordingTicket(typeof req.query.t === 'string' ? req.query.t : null);
    if (!claims || claims.recordingId !== String(req.params.recordingId)) {
      return res.status(404).json({ error: 'Not found' });
    }

    const { resolveViewableRecording } = await import('../services/presentation/recordingPlayback');
    const r = await resolveViewableRecording(
      claims.enrollmentId,
      String(req.params.projectId),
      String(req.params.storyId),
      String(req.params.recordingId),
    );
    if (!r.ok) return res.status(404).json({ error: 'Not found' });

    const { ensureThumbnail } = await import('../services/presentation/recordingThumbnail');
    const thumb = await ensureThumbnail(
      String(req.params.recordingId),
      r.recording.filePath,
      r.recording.durationSeconds,
    );
    // No frame worth showing. The card falls back; see the note above.
    if (!thumb) return res.status(404).json({ error: 'No thumbnail' });

    res.setHeader('Content-Type', 'image/jpeg');
    // A recording is immutable once ingested, so its still can be cached hard.
    // PRIVATE, because the audience check above is per viewer and a shared cache
    // would serve one learner's frame to whoever asked next.
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return fs.createReadStream(thumb.path).pipe(res);
  } catch (e) { fail(res, e, next); }
});

export default router;
