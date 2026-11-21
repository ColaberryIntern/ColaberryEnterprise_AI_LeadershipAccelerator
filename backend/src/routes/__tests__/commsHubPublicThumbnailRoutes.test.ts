/**
 * CH4.4 the public chosen-thumbnail route, and the mount order that keeps it public (same shape as
 * mediaFetchRoutes.test.ts): above an adminRoutes-shaped guard it serves the PNG to an anonymous <img>;
 * below it, the 401 this test exists to prevent.
 */
jest.mock('../campusRoutes', () => ({ logFailure: jest.fn() }));
const mockPublic = jest.fn();
jest.mock('../../services/commsHub/thumbnails/thumbnailStudio', () => ({ THUMB_SIZES: ['16x9', '1x1', '3x1'], publicThumbnail: (...a: unknown[]) => mockPublic(...a) }));

import express from 'express';
import request from 'supertest';
import routes from '../commsHubPublicThumbnailRoutes';

const EVENT = '88888888-8888-4888-8888-888888888888';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7]);

function appWithOrder(publicFirst: boolean): express.Express {
  const app = express();
  const admin = express.Router();
  admin.use((_req, res) => { res.status(401).json({ error: 'Authentication required' }); });
  if (publicFirst) { app.use(routes); app.use(admin); } else { app.use(admin); app.use(routes); }
  return app;
}
const bytes = (r: request.Test) => r.buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });

beforeEach(() => { mockPublic.mockReset(); });

describe('mount order', () => {
  it('serves the PNG to an anonymous request when mounted ABOVE adminRoutes', async () => {
    mockPublic.mockResolvedValue(PNG);
    const res = await bytes(request(appWithOrder(true)).get(`/api/comms-hub/thumbnails/${EVENT}/16x9.png?v=x`));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('public, max-age=300');
    expect((res.body as Buffer).equals(PNG)).toBe(true);
    expect(mockPublic).toHaveBeenCalledWith(EVENT, '16x9');
  });

  it('401s when mounted BELOW adminRoutes - the bug this test exists to prevent', async () => {
    mockPublic.mockResolvedValue(PNG);
    expect((await request(appWithOrder(false)).get(`/api/comms-hub/thumbnails/${EVENT}/16x9.png`)).status).toBe(401);
  });
});

describe('what it refuses', () => {
  it('nothing to serve (draft, cancelled, not chosen): 404', async () => {
    mockPublic.mockResolvedValue(null);
    expect((await request(appWithOrder(true)).get(`/api/comms-hub/thumbnails/${EVENT}/1x1.png`)).status).toBe(404);
  });

  it('not an event id, or not a size: 404 without asking the service', async () => {
    // A traversal path never matches this route at all, so it falls through to the guard: refused, never served.
    expect((await request(appWithOrder(true)).get('/api/comms-hub/thumbnails/../../etc/16x9.png')).status).toBe(401);
    for (const path of ['/api/comms-hub/thumbnails/abc/16x9.png', `/api/comms-hub/thumbnails/${EVENT}/4x3.png`, `/api/comms-hub/thumbnails/${EVENT}/16x9`]) {
      expect((await request(appWithOrder(true)).get(path)).status).toBe(404);
    }
    expect(mockPublic).not.toHaveBeenCalled();
  });
});

describe('server.ts', () => {
  it('mounts the route above adminRoutes', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const src: string = require('fs').readFileSync(require('path').join(__dirname, '../../server.ts'), 'utf8');
    const pub = src.indexOf('app.use(commsHubPublicThumbnailRoutes)');
    const admin = src.indexOf('app.use(adminRoutes)');
    expect(pub).toBeGreaterThan(0);
    expect(pub).toBeLessThan(admin);
  });
});
