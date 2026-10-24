/**
 * broadcastMediaRoutes — the signed, inline, range-capable replay route.
 *
 * Three things are actually at stake here, and each gets its own block:
 *
 *  1. MOUNT ORDER. Mirrors mediaFetchRoutes.test.ts: one app mounts the router ABOVE an
 *     adminRoutes-shaped stand-in and expects bytes, a second mounts it BELOW and expects
 *     the 401 that `/i/` served every visitor for two weeks. The second assertion is what
 *     proves the first is not passing by accident.
 *
 *  2. THE GATE RUNS BEFORE THE FILESYSTEM. Every rejected-link test also asserts the
 *     resolver was never called. A route that 403s after reading the file is still a route
 *     that read the file.
 *
 *  3. RANGE ARITHMETIC. A player seeks by byte offset, so an off-by-one here surfaces as a
 *     corrupt video rather than an error. Every boundary is asserted against an exact
 *     `Content-Range` string and the exact bytes, never just a 206.
 */

import express from 'express';
import request from 'supertest';
import fs from 'fs';
import { Readable } from 'stream';
import http from 'http';
import os from 'os';
import path from 'path';

const tmpRoot = path.join(os.tmpdir(), `bm-test-${process.pid}-${Date.now()}`);
const outsideRoot = path.join(os.tmpdir(), `bm-outside-${process.pid}-${Date.now()}`);
process.env.ROOM_RECORDING_DIR = tmpRoot;
process.env.JWT_SECRET = ['test', 'secret'].join('-');
// config/env reads this at module-eval time, so it has to be set before the import below.
process.env.BROADCAST_ENABLED = 'true';

import broadcastMediaRoutes, { setRecordingResolver } from '../broadcastMediaRoutes';
import type { RecordingResolver } from '../broadcastMediaRoutes';
import { signPlayback, GRANT_TTL_MS, GRANT_SEGMENT_GRACE_MS } from '../../services/broadcast/broadcastPlaybackGrant';

const OCC = '11111111-2222-4333-8444-555555555555';
const ASSET = 'replay.mp4';
const SIZE = 1000;
// Positional content, so a wrong slice fails an assertion instead of coincidentally matching.
const BYTES = Buffer.from(Array.from({ length: SIZE }, (_, i) => i % 251));

const filePath = path.join(tmpRoot, 'replay.mp4');
const outsidePath = path.join(outsideRoot, 'secret.mp4');

function adminRoutesShaped(): express.Router {
  const admin = express.Router();
  admin.use((_req, res) => { res.status(401).json({ error: 'Authentication required' }); });
  return admin;
}

function appWithOrder(publicFirst: boolean, router: express.Router = broadcastMediaRoutes): express.Express {
  const app = express();
  const admin = adminRoutesShaped();
  if (publicFirst) { app.use(router); app.use(admin); } else { app.use(admin); app.use(router); }
  return app;
}

/** The real signer, never a hand-rolled HMAC — a test that signs its own way tests itself. */
function signedPath(key = `broadcast/${OCC}/${ASSET}`, nowMs = Date.now(), ttlMs = GRANT_TTL_MS): string {
  const signed = signPlayback(
    key,
    { grant: 'full' },
    { contentStartedAtMs: null, previewSeconds: 0 },
    '',
    process.env,
    nowMs,
    ttlMs,
  );
  if (!signed) throw new Error('fixture: the signer refused a full grant');
  return signed.url;
}

/** Collects the stream instead of letting superagent parse it as text. */
function getBinary(app: express.Express, url: string, range?: string) {
  let t = request(app).get(url);
  if (range) t = t.set('Range', range);
  return t.buffer(true).parse((r, cb) => {
    const chunks: Buffer[] = [];
    r.on('data', (c: Buffer) => chunks.push(c));
    r.on('end', () => cb(null, Buffer.concat(chunks)));
  });
}

async function waitUntil(cond: () => boolean, why: string, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`waitUntil timed out: ${why}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

let resolverCalls: Array<{ occurrenceId: string; asset: string }>;
let stub: RecordingResolver;

beforeAll(() => {
  fs.mkdirSync(tmpRoot, { recursive: true });
  fs.mkdirSync(outsideRoot, { recursive: true });
  fs.writeFileSync(filePath, BYTES);
  fs.writeFileSync(outsidePath, Buffer.from('this must never be served'));
});
afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  fs.rmSync(outsideRoot, { recursive: true, force: true });
});

beforeEach(() => {
  resolverCalls = [];
  stub = async (occurrenceId, asset) => {
    resolverCalls.push({ occurrenceId, asset });
    return { absolutePath: filePath, contentType: 'video/mp4' };
  };
  setRecordingResolver((o, a) => stub(o, a));
});

describe('the windows these tests depend on are pinned, not inferred', () => {
  it('pins the documented TTL and segment grace', () => {
    // A test that calibrates its own offsets from the constant it is checking cannot fail.
    // The first version of the expiry tests below did exactly that: widening the grace from
    // 10s to 10 minutes failed nothing at all, because every offset moved with it. These two
    // literals are the fixed point. Changing either constant now fails here, deliberately —
    // the grace is the window in which an expired paid link still serves bytes.
    expect(GRANT_TTL_MS).toBe(120_000);
    expect(GRANT_SEGMENT_GRACE_MS).toBe(10_000);
  });
});

describe('mount order', () => {
  it('serves the bytes to a session-less <video> fetch when mounted ABOVE adminRoutes', async () => {
    const res = await getBinary(appWithOrder(true), signedPath());
    expect(res.status).toBe(200);
    expect((res.body as Buffer).equals(BYTES)).toBe(true);
  });

  it('401s when mounted BELOW adminRoutes — the bug this test exists to prevent', async () => {
    const res = await request(appWithOrder(false)).get(signedPath());
    expect(res.status).toBe(401);
    // And the file was never even looked for, which is how you know it was the guard.
    expect(resolverCalls).toHaveLength(0);
  });
});

describe('a rejected link is refused before the filesystem is touched', () => {
  const app = () => appWithOrder(true);

  it('404s an asset that is not a legal key — and says nothing about what exists', async () => {
    const res = await request(app()).get(`/bm/broadcast/${OCC}/.env`);
    expect(res.status).toBe(404);
    expect(resolverCalls).toHaveLength(0);
  });

  it('404s an occurrence id that is not uuid-shaped', async () => {
    const res = await request(app()).get(`/bm/broadcast/not-a-uuid/${ASSET}?e=${Date.now() + 60_000}&s=x`);
    expect(res.status).toBe(404);
    expect(resolverCalls).toHaveLength(0);
  });

  it('403s an unsigned link rather than serving it', async () => {
    const res = await request(app()).get(`/bm/broadcast/${OCC}/${ASSET}?e=${Date.now() + 60_000}`);
    expect(res.status).toBe(403);
    expect(res.text).toMatch(/not signed/i);
    expect(resolverCalls).toHaveLength(0);
  });

  it('403s a forged signature', async () => {
    const url = new URL(`http://x${signedPath()}`);
    url.searchParams.set('s', 'A'.repeat(43));
    const res = await request(app()).get(url.pathname + url.search);
    expect(res.status).toBe(403);
    expect(resolverCalls).toHaveLength(0);
  });

  it('410s a link whose window has closed, past the segment grace', async () => {
    // Minted five minutes ago, so it expired ~3 minutes ago: a literal, not an offset
    // derived from the grace this test exists to hold in place.
    const stale = signedPath(undefined, Date.now() - 300_000);
    const res = await request(app()).get(stale);
    expect(res.status).toBe(410);
    expect(resolverCalls).toHaveLength(0);
  });

  it('still serves a link that expired INSIDE the grace window — an in-flight segment is not an attack', async () => {
    const res = await getBinary(app(), signedPath(undefined, Date.now() - GRANT_TTL_MS - 2_000));
    expect(res.status).toBe(200);
  });

  it('refuses a token minted for a DIFFERENT asset of the same occurrence', async () => {
    const minted = new URL(`http://x${signedPath(`broadcast/${OCC}/replay-hd.mp4`)}`);
    // Same e and s, pointed at another asset's path. This is the whole reason the signature
    // covers the key and not just the expiry.
    const res = await request(app()).get(`/bm/broadcast/${OCC}/${ASSET}${minted.search}`);
    expect(res.status).toBe(403);
    expect(resolverCalls).toHaveLength(0);
  });

  it('refuses a token minted for a different OCCURRENCE', async () => {
    const other = '99999999-8888-4777-8666-555555555555';
    const minted = new URL(`http://x${signedPath(`broadcast/${other}/${ASSET}`)}`);
    const res = await request(app()).get(`/bm/broadcast/${OCC}/${ASSET}${minted.search}`);
    expect(res.status).toBe(403);
    expect(resolverCalls).toHaveLength(0);
  });
});

describe('a verified link', () => {
  const app = () => appWithOrder(true);

  it('plays in place: inline, range-capable, private and nosniff', async () => {
    const res = await getBinary(app(), signedPath());
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('video/mp4');
    // The two headers the existing recording route gets wrong, and the reason this exists.
    expect(res.headers['content-disposition']).toBe('inline');
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(res.headers['cache-control']).toBe('private, max-age=60');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-length']).toBe(String(SIZE));
    expect((res.body as Buffer).equals(BYTES)).toBe(true);
    expect(resolverCalls).toEqual([{ occurrenceId: OCC, asset: ASSET }]);
  });

  it('serves the exact first 100 bytes for bytes=0-99', async () => {
    const res = await getBinary(app(), signedPath(), 'bytes=0-99');
    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe(`bytes 0-99/${SIZE}`);
    expect(res.headers['content-length']).toBe('100');
    expect((res.body as Buffer).equals(BYTES.subarray(0, 100))).toBe(true);
  });

  it('serves to the end for an open-ended range', async () => {
    const res = await getBinary(app(), signedPath(), 'bytes=900-');
    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe(`bytes 900-999/${SIZE}`);
    expect((res.body as Buffer).equals(BYTES.subarray(900))).toBe(true);
  });

  it('reads a SUFFIX range from the tail, not from byte zero — the moov-atom probe', async () => {
    const res = await getBinary(app(), signedPath(), 'bytes=-50');
    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe(`bytes 950-999/${SIZE}`);
    expect((res.body as Buffer).equals(BYTES.subarray(950))).toBe(true);
  });

  it('treats a suffix longer than the file as the whole file, not a negative offset', async () => {
    const res = await getBinary(app(), signedPath(), `bytes=-${SIZE * 5}`);
    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe(`bytes 0-999/${SIZE}`);
    expect((res.body as Buffer).equals(BYTES)).toBe(true);
  });

  it('clamps an end past EOF instead of failing — a player routinely over-asks', async () => {
    const res = await getBinary(app(), signedPath(), 'bytes=0-99999');
    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe(`bytes 0-999/${SIZE}`);
    expect((res.body as Buffer).length).toBe(SIZE);
  });

  it('serves exactly the final byte for bytes=999-999', async () => {
    const res = await getBinary(app(), signedPath(), 'bytes=999-999');
    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe(`bytes 999-999/${SIZE}`);
    expect(res.headers['content-length']).toBe('1');
    expect((res.body as Buffer).equals(BYTES.subarray(999))).toBe(true);
  });

  it('416s a start at or past the end, and reports the real size', async () => {
    const res = await request(app()).get(signedPath()).set('Range', `bytes=${SIZE}-`);
    expect(res.status).toBe(416);
    expect(res.headers['content-range']).toBe(`bytes */${SIZE}`);
  });

  it('416s a start AT the end with an explicit end past it — the range that would invert', async () => {
    // bytes=1000-2000 on a 1000-byte file. The open-ended form above is caught by start > end
    // once end defaults to size-1; this form is only caught by `start >= size`, and mutation
    // testing found nothing covering it.
    const res = await request(app()).get(signedPath()).set('Range', `bytes=${SIZE}-${SIZE * 2}`);
    expect(res.status).toBe(416);
    expect(res.headers['content-range']).toBe(`bytes */${SIZE}`);
  });

  it('416s a start PAST the end with an explicit end', async () => {
    const res = await request(app()).get(signedPath()).set('Range', `bytes=${SIZE + 1}-${SIZE + 500}`);
    expect(res.status).toBe(416);
  });

  it('416s an inverted range', async () => {
    const res = await request(app()).get(signedPath()).set('Range', 'bytes=500-200');
    expect(res.status).toBe(416);
  });

  it('416s a multi-range request rather than half-answering it', async () => {
    const res = await request(app()).get(signedPath()).set('Range', 'bytes=0-99,200-299');
    expect(res.status).toBe(416);
    expect(res.headers['content-range']).toBe(`bytes */${SIZE}`);
  });

  it('416s a bare `bytes=-`, which names no range at all', async () => {
    // The verifier found that the explicit empty-empty guard could be deleted with nothing
    // failing: Number('') is 0, so it fell through to the len <= 0 check and returned
    // unsatisfiable anyway. The guard is gone now and this test is what holds the boundary.
    const res = await request(app()).get(signedPath()).set('Range', 'bytes=-');
    expect(res.status).toBe(416);
    expect(res.headers['content-range']).toBe(`bytes */${SIZE}`);
  });

  it('416s a malformed Range header', async () => {
    const res = await request(app()).get(signedPath()).set('Range', 'bytes=abc');
    expect(res.status).toBe(416);
  });
});

describe('the preview deadline is enforced HERE, not only when the grant is minted', () => {
  const app = () => appWithOrder(true);
  const PREVIEW_SECONDS = 900;

  /** A preview-bounded token, minted 5s before its deadline so its expiry IS the deadline. */
  function previewToken(deadlineOffsetMs: number): string {
    const contentStartedAtMs = Date.now() + deadlineOffsetMs - PREVIEW_SECONDS * 1000;
    const deadline = contentStartedAtMs + PREVIEW_SECONDS * 1000;
    const signed = signPlayback(
      `broadcast/${OCC}/${ASSET}`,
      { grant: 'preview' },
      { contentStartedAtMs, previewSeconds: PREVIEW_SECONDS },
      '',
      process.env,
      deadline - 5_000,
    );
    if (!signed) throw new Error('fixture: the signer refused a preview still inside its window');
    // The point of the bound: the token dies at the deadline, not 120s after it was minted.
    expect(signed.expiresAt).toBe(deadline);
    return signed.url;
  }

  it('mints nothing at all once the window is already spent', () => {
    const spent = signPlayback(
      `broadcast/${OCC}/${ASSET}`,
      { grant: 'preview' },
      { contentStartedAtMs: Date.now() - (PREVIEW_SECONDS + 1) * 1000, previewSeconds: PREVIEW_SECONDS },
      '',
    );
    expect(spent).toBeNull();
  });

  it('serves a RANGE request while the preview window is still open', async () => {
    const res = await getBinary(app(), previewToken(60_000), 'bytes=0-99');
    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe(`bytes 0-99/${SIZE}`);
  });

  it('410s a RANGE request once the deadline has passed — seeking does not buy more preview', async () => {
    // This is the criterion in full: a paid-content range request after the deadline is
    // refused by the server. A hidden button is not enforcement, and neither is a player
    // that stops asking.
    //
    // 20s past the deadline is a literal, deliberately more than the 10s grace pinned above
    // and deliberately NOT computed from it.
    const res = await request(app()).get(previewToken(-20_000)).set('Range', 'bytes=0-99');
    expect(res.status).toBe(410);
    expect(resolverCalls).toHaveLength(0);
  });

  it('410s an unranged request on the same spent token', async () => {
    const res = await request(app()).get(previewToken(-20_000));
    expect(res.status).toBe(410);
  });
});

describe('every asset goes through the same gate, not just the video', () => {
  const app = () => appWithOrder(true);
  const vttPath = path.join(tmpRoot, 'captions.vtt');

  beforeAll(() => {
    // A real cue, assembled from lines rather than escapes. The bytes do not matter to the
    // route; what matters is that a .vtt is gated identically to an .mp4.
    fs.writeFileSync(vttPath, ['WEBVTT', '', '00:00.000 --> 00:02.000', 'hello', ''].join('\n'));
  });

  it('serves a captions track inline, signed, with its own content type', async () => {
    stub = async () => ({ absolutePath: vttPath, contentType: 'text/vtt' });
    const res = await request(app()).get(signedPath(`broadcast/${OCC}/captions.vtt`));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/vtt');
    expect(res.headers['content-disposition']).toBe('inline');
    expect(res.headers['cache-control']).toBe('private, max-age=60');
  });

  it('refuses an UNSIGNED captions request exactly as it refuses an unsigned video', async () => {
    stub = async () => ({ absolutePath: vttPath, contentType: 'text/vtt' });
    const res = await request(app()).get(`/bm/broadcast/${OCC}/captions.vtt`);
    expect(res.status).toBe(403);
    expect(resolverCalls).toHaveLength(0);
  });

  it('refuses a video token reused for the captions track', async () => {
    const minted = new URL(`http://x${signedPath()}`);
    const res = await request(app()).get(`/bm/broadcast/${OCC}/captions.vtt${minted.search}`);
    expect(res.status).toBe(403);
  });
});

describe('resolution failures all look the same from outside', () => {
  const app = () => appWithOrder(true);
  let errLines: string[];

  beforeEach(() => {
    errLines = [];
    jest.spyOn(console, 'error').mockImplementation((s: unknown) => { errLines.push(String(s)); });
  });
  afterEach(() => jest.restoreAllMocks());

  it('404s a resolved path OUTSIDE the media root even though the file exists', async () => {
    stub = async () => ({ absolutePath: outsidePath, contentType: 'video/mp4' });
    const res = await request(app()).get(signedPath());
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('never be served');
    expect(JSON.parse(errLines[0])).toMatchObject({
      error_class: 'PathEscape', event: 'broadcast_media_path_escape',
    });
  });

  it('404s a traversal that climbs out of the root and back down to a real file', async () => {
    stub = async () => ({
      absolutePath: path.join(tmpRoot, '..', path.basename(outsideRoot), 'secret.mp4'),
      contentType: 'video/mp4',
    });
    const res = await request(app()).get(signedPath());
    expect(res.status).toBe(404);
    expect(errLines.some((l) => l.includes('PathEscape'))).toBe(true);
  });

  it('404s a sibling directory whose name merely starts with the root — a prefix is not a parent', async () => {
    const sibling = `${tmpRoot}-evil`;
    fs.mkdirSync(sibling, { recursive: true });
    fs.writeFileSync(path.join(sibling, 'x.mp4'), Buffer.from('nope'));
    try {
      stub = async () => ({ absolutePath: path.join(sibling, 'x.mp4'), contentType: 'video/mp4' });
      const res = await request(app()).get(signedPath());
      expect(res.status).toBe(404);
      expect(errLines.some((l) => l.includes('PathEscape'))).toBe(true);
    } finally {
      fs.rmSync(sibling, { recursive: true, force: true });
    }
  });

  it('404s a path that does not exist', async () => {
    stub = async () => ({ absolutePath: path.join(tmpRoot, 'gone.mp4'), contentType: 'video/mp4' });
    expect((await request(app()).get(signedPath())).status).toBe(404);
  });

  it('404s a directory', async () => {
    stub = async () => ({ absolutePath: tmpRoot, contentType: 'video/mp4' });
    expect((await request(app()).get(signedPath())).status).toBe(404);
  });

  it('cuts the connection and logs when the read fails mid-stream, rather than hanging', async () => {
    // By the time a read fails the status line is already out, so there is no 500 to send.
    // The requirement is that the viewer does not wait forever on a body that never comes.
    const broken = new Readable({ read() {} });
    jest.spyOn(fs, 'createReadStream').mockImplementation(() => {
      process.nextTick(() => broken.emit('error', Object.assign(new Error('read failed'), { code: 'EIO' })));
      return broken as unknown as fs.ReadStream;
    });

    const outcome = await request(app()).get(signedPath()).then(() => 'resolved', () => 'rejected');
    expect(outcome).toBe('rejected');
    const line = errLines.map((l) => JSON.parse(l)).find((l) => l.event === 'broadcast_media_stream_failed');
    expect(line).toMatchObject({ error_class: 'EIO', outcome: 'failure' });
  });

  it('destroys the stream when the viewer abandons the request — a seeking player does this constantly', async () => {
    // Without this the descriptor stays open for the life of the process, and a viewer
    // scrubbing a two-hour recording abandons dozens of range requests a minute.
    //
    // The server is created and closed explicitly rather than left to supertest: an aborted
    // request never lets supertest tear its own ephemeral listener down, and the leaked
    // handle stops jest exiting at the end of the whole file.
    const stalled = new Readable({ read() {} });   // never pushes, never ends
    const destroySpy = jest.spyOn(stalled, 'destroy');
    let created = false;
    jest.spyOn(fs, 'createReadStream').mockImplementation(() => {
      created = true;
      return stalled as unknown as fs.ReadStream;
    });

    const server = http.createServer(appWithOrder(true));
    await new Promise<void>((resolve) => server.listen(0, () => resolve()));
    try {
      const pending = request(server).get(signedPath());
      const settled = pending.then(() => 'resolved', () => 'rejected');
      // Wait for the route to actually open the stream, so the abort cannot land first and
      // make this pass for the wrong reason.
      await waitUntil(() => created, 'the route never opened a stream');
      pending.abort();
      await settled;
      await waitUntil(() => destroySpy.mock.calls.length > 0, 'the abandoned stream was never destroyed');
    } finally {
      destroySpy.mockRestore();
      stalled.destroy();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('500s without leaking the message when the resolver throws', async () => {
    stub = async () => {
      throw Object.assign(new Error('connect ECONNREFUSED db.internal:5432'), { name: 'SequelizeConnectionError' });
    };
    const res = await request(app()).get(signedPath());
    expect(res.status).toBe(500);
    expect(res.text).toBe('Internal Error');
    expect(errLines.join('')).not.toContain('db.internal');
    expect(JSON.parse(errLines[0])).toMatchObject({ error_class: 'SequelizeConnectionError' });
  });
});

describe('module-level wiring', () => {
  /** Fresh registry, so config/env re-reads the flag and the resolver is the shipped default. */
  function isolated(flag: string | undefined): {
    router: express.Router;
    setResolver: (r: RecordingResolver) => void;
  } {
    const prev = process.env.BROADCAST_ENABLED;
    if (flag === undefined) delete process.env.BROADCAST_ENABLED;
    else process.env.BROADCAST_ENABLED = flag;

    let mod: Record<string, unknown> = {};
    jest.isolateModules(() => { mod = require('../broadcastMediaRoutes'); });

    if (prev === undefined) delete process.env.BROADCAST_ENABLED;
    else process.env.BROADCAST_ENABLED = prev;

    return {
      router: mod.default as express.Router,
      setResolver: mod.setRecordingResolver as (r: RecordingResolver) => void,
    };
  }

  const servesTheFixture: RecordingResolver = async () => ({ absolutePath: filePath, contentType: 'video/mp4' });

  it('404s every request when BROADCAST_ENABLED is off, valid signature and all', async () => {
    const { router, setResolver } = isolated(undefined);
    setResolver(servesTheFixture);
    const res = await request(appWithOrder(true, router)).get(signedPath());
    expect(res.status).toBe(404);
    expect(res.text).toBe('Not found.');
  });

  it('serves once the flag is on — the positive control for the test above', async () => {
    const { router, setResolver } = isolated('true');
    setResolver(servesTheFixture);
    expect((await request(appWithOrder(true, router)).get(signedPath())).status).toBe(200);
  });

  it('the SHIPPED default resolver resolves nothing and says why — L8.4 routes Cloudflare replay elsewhere', async () => {
    const warns: string[] = [];
    jest.spyOn(console, 'warn').mockImplementation((s: unknown) => { warns.push(String(s)); });
    try {
      const { router } = isolated('true');
      const res = await request(appWithOrder(true, router)).get(signedPath());
      expect(res.status).toBe(404);
      expect(JSON.parse(warns[0])).toMatchObject({
        error_class: 'RecordingNotBound', event: 'broadcast_media_unbound',
      });
      // L8.4 decided this route is NOT the Cloudflare replay path, so the default still
      // resolves nothing — but the remedy must now name that decision rather than a phase key
      // with no ticket behind it. A reader hitting this log needs somewhere real to go.
      const remedy = JSON.parse(warns[0]).context.remedy;
      expect(remedy).toMatch(/L8\.4/);
      expect(remedy).not.toMatch(/P6-01/);
    } finally {
      jest.restoreAllMocks();
    }
  });
});
