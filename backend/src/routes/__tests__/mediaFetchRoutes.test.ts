/**
 * mediaFetchRoutes — the public, signed file route, and the mount order that keeps it public.
 *
 * Same shape as publicCaseStudyRoutes.test.ts and openclawShortLinkRoutes.test.ts: one app
 * mounts the router ABOVE an adminRoutes-shaped stand-in and expects the bytes; a second mounts
 * it BELOW and expects the 401 that `/i/` served every visitor for two weeks. The second
 * assertion proves the guard really swallows the request, so the first is not passing by
 * accident.
 */

import express from 'express';
import request from 'supertest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';

const tmpRoot = path.join(os.tmpdir(), `media-fetch-test-${process.pid}-${Date.now()}`);
process.env.MEDIA_ROOT = tmpRoot;
process.env.JWT_SECRET = ['test', 'secret'].join('-');

import mediaFetchRoutes from '../mediaFetchRoutes';
import { put, signedUrl, SIGNED_URL_TTL_MS } from '../../services/media/mediaStore';

const BRAND = '22222222-2222-4222-8222-222222222222';
const BYTES = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 3)]);

function adminRoutesShaped(): express.Router {
  const admin = express.Router();
  admin.use((_req, res) => { res.status(401).json({ error: 'Authentication required' }); });
  return admin;
}

function appWithOrder(publicFirst: boolean): express.Express {
  const app = express();
  const admin = adminRoutesShaped();
  if (publicFirst) { app.use(mediaFetchRoutes); app.use(admin); } else { app.use(admin); app.use(mediaFetchRoutes); }
  return app;
}

let key: string;
let pathAndQuery: string;

beforeAll(async () => {
  await fs.mkdir(tmpRoot, { recursive: true });
  key = (await put(BRAND, 'image/png', BYTES)).key;
  const { url } = signedUrl(key, 'https://x');
  pathAndQuery = url.replace('https://x', '');
});
afterAll(async () => { await fs.rm(tmpRoot, { recursive: true, force: true }); });

describe('mount order', () => {
  it('serves the bytes to an anonymous fetch when mounted ABOVE adminRoutes', async () => {
    const res = await request(appWithOrder(true)).get(pathAndQuery).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect((res.body as Buffer).equals(BYTES)).toBe(true);
  });

  it('401s when mounted BELOW adminRoutes - the bug this test exists to prevent', async () => {
    const res = await request(appWithOrder(false)).get(pathAndQuery);
    expect(res.status).toBe(401);
  });
});

describe('what a public file route must refuse', () => {
  it('an unsigned request', async () => {
    const res = await request(appWithOrder(true)).get(`/m/${key.slice('media/'.length)}`);
    expect(res.status).toBe(403);
    expect(res.text).toMatch(/not signed/);
  });

  it('an expired link, with 410 so a provider does not retry it', async () => {
    const { url } = signedUrl(key, 'https://x', process.env, Date.now() - SIGNED_URL_TTL_MS - 1000);
    const res = await request(appWithOrder(true)).get(url.replace('https://x', ''));
    expect(res.status).toBe(410);
  });

  it('a tampered signature', async () => {
    const res = await request(appWithOrder(true)).get(pathAndQuery.replace(/s=[^&]+/, 's=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'));
    expect(res.status).toBe(403);
  });

  it('a path that is not a media key, without touching the disk', async () => {
    const res = await request(appWithOrder(true)).get('/m/..%2F..%2Fetc/passwd?e=1&s=x');
    expect([403, 404]).toContain(res.status);
    expect(res.text).not.toMatch(/root:/);
  });

  it('a signed key whose file is gone, as 404 and not a 500', async () => {
    const missing = `media/${BRAND}/${'f'.repeat(64)}.png`;
    const { url } = signedUrl(missing, 'https://x');
    const res = await request(appWithOrder(true)).get(url.replace('https://x', ''));
    expect(res.status).toBe(404);
  });
});
