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
 * AUTHENTICATION IS THE SIGNED TICKET, AND THE OWNERSHIP QUERY UNDERNEATH IT. The
 * ticket says "this link was issued to you"; `resolvePlayableRecording` says "and the
 * recording is yours". Either alone would be enough to serve somebody else's video.
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

    const { resolvePlayableRecording } = await import('../services/presentation/recordingPlayback');
    const r = await resolvePlayableRecording(
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

    const { filePath, sizeBytes, mimeType, downloadName } = r.recording;
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

export default router;
