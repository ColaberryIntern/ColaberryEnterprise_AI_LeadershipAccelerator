import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { PlaybackGrantError, verifyPlaybackRequest } from '../services/broadcast/broadcastPlaybackGrant';

/**
 * broadcastMediaRoutes — `GET /bm/broadcast/<occurrenceId>/<asset>?e=<expiry>&s=<sig>`
 *
 * The route that finally makes a recording playable IN the portal. Today the only way to
 * watch one is `roomsApi.openSessionRecording`, which downloads the whole blob into a new
 * tab, because the existing route sets `Content-Disposition: attachment` and authenticates
 * from a Bearer header that a `<video src>` cannot send. This fixes both.
 *
 * A deliberate SIBLING of mediaFetchRoutes rather than a widening of it. That route buffers
 * the whole file (`res.end(bytes)`) and caps video at 200 MB, which is correct for an image
 * a provider fetches once and wrong for a 4 GB class recording. The safety properties are
 * copied exactly; only the delivery differs.
 *
 * MOUNT ORDER IS LOAD-BEARING. This must be mounted BEFORE `adminRoutes`, whose unscoped
 * guard 401s anything below it. `/r/`, `/i/` and `/m/` each learned that in production, and
 * mediaFetchRoutes pins its own order with a test. So does this one.
 *
 * What makes a URL-authenticated file route safe here, same four properties as `/m/`:
 *   - The key grammar admits exactly one shape, so there is nothing to traverse.
 *   - Every request carries an HMAC over (key, expiry) that only this server can mint, and
 *     for a preview viewer the window is bounded by the preview deadline, not by the TTL.
 *   - The resolved path is asserted to sit under the media root before anything is opened,
 *     so even a grammar bug cannot escape the directory.
 *   - No directory listing, no fallback, no `express.static`, and no unsigned path at all.
 */

const router = Router();

/**
 * Resolves a verified key to a file on disk. Injected so the route is testable without a
 * database, and because the occurrence-to-recording BINDING is not this route's job.
 *
 * L8.4 DECIDED THIS ROUTE IS NOT THE CLOUDFLARE REPLAY PATH, and that is why the default
 * still resolves nothing. A Cloudflare occurrence never reaches here: the grant controller
 * branches on `provider === 'cloudflare'` and signs a Cloudflare url, now for the RECORDING
 * once the show has ended. Routing those through `/bm/` would have meant downloading every
 * class to this box to re-serve what Cloudflare's edge already serves, signed.
 *
 * So this route waits on a recording that genuinely sits on local disk — a downloaded Zoom
 * cloud recording, or an OBS capture. The route is complete and tested and has no such
 * source yet, which is a different thing from broken.
 */
export type RecordingResolver = (
  occurrenceId: string,
  asset: string,
) => Promise<{ absolutePath: string; contentType: string } | null>;

const notYetBound: RecordingResolver = async (occurrenceId, asset) => {
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'warn', service: 'broadcast',
    event: 'broadcast_media_unbound', outcome: 'failure', error_class: 'RecordingNotBound',
    context: {
      occurrenceId,
      asset,
      remedy: 'L8.4: Cloudflare replay is signed by the grant controller, not served here. This route resolves nothing until a recording exists on local disk.',
    },
  }));
  return null;
};

let resolver: RecordingResolver = notYetBound;

/** Called at wiring time by whatever supplies on-disk recordings. Tests inject a stub. */
export function setRecordingResolver(next: RecordingResolver): void {
  resolver = next;
}

/**
 * Multi-range is refused rather than half-supported, and the END ANCHOR on this pattern is
 * what refuses it: `bytes=0-99,200-299` matches nothing, so it falls through as
 * unsatisfiable. An earlier version also tested `header.includes(',')` first; mutation
 * testing showed removing that line changed no outcome, so it is gone rather than left
 * there implying it does work the regex already does. An explicit `rawStart === '' &&
 * rawEnd === ''` guard went the same way for the same reason, found by an independent
 * verifier: `Number('')` is 0, so `bytes=-` already falls through to the `len <= 0` check.
 * A test now pins that boundary instead of a second code path agreeing with the first.
 */
function parseSingleRange(header: string, size: number): { start: number; end: number } | 'unsatisfiable' {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return 'unsatisfiable';
  const [, rawStart, rawEnd] = m;

  // A suffix range (`bytes=-500`) means the LAST 500 bytes, not bytes 0..500.
  if (rawStart === '') {
    const len = Number(rawEnd);
    if (!Number.isFinite(len) || len <= 0) return 'unsatisfiable';
    // Clamped at 0: a suffix longer than the file means the whole file, per RFC 9110. Without
    // the clamp the start goes negative and the stream constructor throws instead.
    return { start: Math.max(0, size - len), end: size - 1 };
  }

  const start = Number(rawStart);
  const end = rawEnd === '' ? size - 1 : Number(rawEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'unsatisfiable';
  // `start >= size`, not `start > size`: `bytes=1000-2000` on a 1000-byte file has start
  // == size, and clamping its end afterwards would produce the inverted range 1000-999.
  if (start > end || start >= size) return 'unsatisfiable';
  return { start, end: Math.min(end, size - 1) };
}

router.get('/bm/broadcast/:occurrenceId/:asset', async (req: Request, res: Response) => {
  try {
    // Same gate as broadcastRoutes, and for the same reason: "the feature is off" has to
    // mean nothing serves. A grant minted two minutes before the flag flipped stops working
    // as well, which is the correct direction for a kill switch.
    if (!env.broadcastEnabled) return void res.status(404).type('text/plain').send('Not found.');

    // Express types a route param as `string | string[]`. A single path segment is always
    // a string; coercing explicitly keeps that assumption visible, and an array would
    // stringify to `a,b` and be rejected by the key grammar below rather than slip through.
    const occurrenceId = String(req.params.occurrenceId);
    const asset = String(req.params.asset);
    const key = `broadcast/${occurrenceId}/${asset}`;
    const e = typeof req.query.e === 'string' ? req.query.e : undefined;
    const s = typeof req.query.s === 'string' ? req.query.s : undefined;

    // Throws 404 InvalidKey / 403 Unsigned / 403 BadSignature / 410 Expired — the same
    // status classes mediaStore uses, so the two media surfaces cannot disagree about what
    // a bad link means.
    verifyPlaybackRequest(key, e, s);

    const resolved = await resolver(occurrenceId, asset);
    if (!resolved) return void res.status(404).type('text/plain').send('Not found.');

    // Defence in depth: even if the key grammar were ever loosened, the file served must sit
    // under the media root. Checked on the RESOLVED path, after any symlink-free join.
    const root = path.resolve(process.env.ROOM_RECORDING_DIR || '/app/uploads/room-recordings');
    const abs = path.resolve(resolved.absolutePath);
    if (abs !== root && !abs.startsWith(root + path.sep)) {
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'error', service: 'broadcast',
        event: 'broadcast_media_path_escape', outcome: 'failure', error_class: 'PathEscape',
        context: { occurrenceId, asset },
      }));
      return void res.status(404).type('text/plain').send('Not found.');
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(abs);
    } catch {
      return void res.status(404).type('text/plain').send('Not found.');
    }
    if (!stat.isFile()) return void res.status(404).type('text/plain').send('Not found.');

    const base = {
      'Content-Type': resolved.contentType,
      // The two things the existing recording route does not do, and the whole reason this
      // route exists: play in place, and advertise that ranges are available.
      'Content-Disposition': 'inline',
      'Accept-Ranges': 'bytes',
      // Private and short. A signed URL's own window is the real bound; no shared cache
      // should hold a copy of paid content past it.
      'Cache-Control': 'private, max-age=60',
      'X-Content-Type-Options': 'nosniff',
    };

    const rangeHeader = req.headers.range;
    const range = rangeHeader ? parseSingleRange(String(rangeHeader), stat.size) : undefined;

    if (range === 'unsatisfiable') {
      res.writeHead(416, { ...base, 'Content-Range': `bytes */${stat.size}` });
      return void res.end();
    }

    // OPEN THE STREAM BEFORE WRITING ANY HEADER. ReadStream validates start/end
    // synchronously, so a range that violates start <= end throws HERE, where the catch
    // below can still answer 500. Written the other way round — header first — the throw
    // lands after a 206 has gone out, and the response wedges: the socket and the file
    // descriptor stay open until the client gives up. That is not hypothetical. Mutating
    // the `start >= size` guard by one character hung an entire jest run instead of failing
    // a test, which is what a wedged response looks like from the outside.
    const stream = range
      ? fs.createReadStream(abs, { start: range.start, end: range.end })
      : fs.createReadStream(abs);

    // A seeking player abandons range requests constantly, and an abandoned request leaves
    // the descriptor open for the life of the process unless the stream is told to close.
    res.on('close', () => stream.destroy());

    stream.on('error', (streamErr: NodeJS.ErrnoException) => {
      // The file passed statSync a moment ago and the open is async, so by the time this
      // fires the status line has already gone out — there is no 500 left to send. Cutting
      // the connection is the only honest answer: the player sees a truncated response and
      // retries the range, instead of waiting on a body that will never arrive. (An earlier
      // version branched on res.headersSent; writeHead runs synchronously below, so that
      // branch could not be reached and is gone.)
      console.error(JSON.stringify({
        timestamp: new Date().toISOString(), level: 'error', service: 'broadcast',
        event: 'broadcast_media_stream_failed', outcome: 'failure',
        error_class: streamErr?.code || streamErr?.name || 'StreamError',
        context: { occurrenceId, asset },
      }));
      res.destroy();
    });

    if (range) {
      res.writeHead(206, {
        ...base,
        'Content-Range': `bytes ${range.start}-${range.end}/${stat.size}`,
        'Content-Length': String(range.end - range.start + 1),
      });
    } else {
      res.writeHead(200, { ...base, 'Content-Length': String(stat.size) });
    }
    stream.pipe(res);
  } catch (err) {
    if (err instanceof PlaybackGrantError) {
      // Plain text, like `/m/`. A `<video>` element does not parse a JSON error, and a human
      // following an expired link deserves a sentence rather than a stack.
      return void res.status(err.status).type('text/plain').send(err.message);
    }
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'error', service: 'broadcast',
      event: 'broadcast_media_failed', outcome: 'failure',
      error_class: (err as Error)?.name ?? 'UnexpectedError',
      context: { error_name: (err as Error)?.name ?? 'unknown' },
    }));
    res.status(500).type('text/plain').send('Internal Error');
  }
});

export default router;
