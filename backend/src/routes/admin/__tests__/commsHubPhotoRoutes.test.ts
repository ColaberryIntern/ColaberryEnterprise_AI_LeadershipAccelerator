jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));
jest.mock('../../../config/env', () => require('../../../__tests__/testSupport/configMocks').envModuleMock({ jwtSecret: 'test-secret' }));
jest.mock('../../campusRoutes', () => ({ logFailure: jest.fn(), sendValidated: jest.fn() }));
jest.mock('../commsHubEventRoutes', () => ({ actorOf: () => ({ id: 'jackie-1', label: 'jackie@colaberry.com' }) }));
jest.mock('../../../services/commsHub/eventPhotos', () => {
  const actual = jest.requireActual('../../../services/commsHub/eventPhotos');
  return { PhotoRuleError: actual.PhotoRuleError, addPhoto: jest.fn(), listPhotos: jest.fn(), removePhoto: jest.fn() };
});

import jwt from 'jsonwebtoken';
import { Readable } from 'stream';
import router from '../commsHubPhotoRoutes';
import * as svc from '../../../services/commsHub/eventPhotos';
import { MAX_IMAGE_BYTES } from '../../../services/media/mediaStore';

/**
 * CH4.1 photo routes through the REAL multer middleware: a multipart body is streamed in, so the
 * size cap, the one-file rule and the alt-text rule are tested where they actually run.
 */
const verify = jwt.verify as unknown as jest.Mock;
const EVENT = '88888888-8888-4888-8888-888888888888';
const BOUNDARY = 'chboundary';

function multipart(parts: Array<{ name: string; value: string } | { name: string; filename: string; bytes: Buffer }>): Buffer {
  const chunks: Buffer[] = [];
  for (const p of parts) {
    chunks.push(Buffer.from(`--${BOUNDARY}\r\n`));
    if ('bytes' in p) {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${p.name}"; filename="${p.filename}"\r\nContent-Type: image/jpeg\r\n\r\n`), p.bytes, Buffer.from('\r\n'));
    } else {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${p.name}"\r\n\r\n${p.value}\r\n`));
    }
  }
  chunks.push(Buffer.from(`--${BOUNDARY}--\r\n`));
  return Buffer.concat(chunks);
}

async function call(method: string, path: string, params: Record<string, string>, body?: Buffer, who: Record<string, unknown> = { role: 'admin', mgmt_role: 'community_organizer' }) {
  const layer = (router as any).stack.find((l: any) => l.route?.path === path && l.route.methods[method]);
  const stream: any = body ? Readable.from([body]) : Readable.from([]);
  Object.assign(stream, {
    method: method.toUpperCase(), params, query: {}, url: path,
    headers: { authorization: 'Bearer t', ...(body ? { 'content-type': `multipart/form-data; boundary=${BOUNDARY}`, 'content-length': String(body.length) } : {}) },
  });
  const res: any = { statusCode: 200, body: undefined, status(c: number) { this.statusCode = c; return this; }, json(b: unknown) { this.body = b; return this; } };
  verify.mockReturnValue(who);
  for (const s of layer.route.stack) {
    // eslint-disable-next-line no-await-in-loop
    const advanced = await new Promise<boolean>((resolve) => {
      let done = false;
      const r = s.handle(stream, res, () => { done = true; resolve(true); });
      Promise.resolve(r).then(() => { if (!done) setTimeout(() => resolve(false), 20); });
    });
    if (!advanced) break;
  }
  return res;
}

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
beforeEach(() => { jest.clearAllMocks(); (svc.addPhoto as jest.Mock).mockResolvedValue([{ id: 'p1' }]); });

describe('CH4.1 POST /events/:id/photos', () => {
  it('a picture with alt text: 201 and the service gets the bytes, name and alt text', async () => {
    const res = await call('post', '/api/admin/comms-hub/events/:id/photos', { id: EVENT }, multipart([{ name: 'alt_text', value: 'Aleem, smiling' }, { name: 'file', filename: 'aleem.jpg', bytes: JPG }]));
    expect(res.statusCode).toBe(201);
    expect(svc.addPhoto).toHaveBeenCalledWith(EVENT, { bytes: JPG, originalName: 'aleem.jpg', altText: 'Aleem, smiling' }, expect.any(Object));
  });

  it('exactly at the 10 MB cap: accepted, all bytes reach the service (busboy counts reaching its limit as over it)', async () => {
    const exact = Buffer.alloc(MAX_IMAGE_BYTES, 1);
    const res = await call('post', '/api/admin/comms-hub/events/:id/photos', { id: EVENT }, multipart([{ name: 'alt_text', value: 'exactly ten' }, { name: 'file', filename: 'ten.jpg', bytes: exact }]));
    expect(res.statusCode).toBe(201);
    expect(((svc.addPhoto as jest.Mock).mock.calls[0][1] as { bytes: Buffer }).bytes.length).toBe(MAX_IMAGE_BYTES);
  });

  it('over the size cap: 413 with the limit in words, the service never called', async () => {
    const big = Buffer.alloc(MAX_IMAGE_BYTES + 1, 1);
    const res = await call('post', '/api/admin/comms-hub/events/:id/photos', { id: EVENT }, multipart([{ name: 'alt_text', value: 'big one' }, { name: 'file', filename: 'big.jpg', bytes: big }]));
    expect(res.statusCode).toBe(413);
    expect(res.body.error).toMatch(/10 MB limit/);
    expect(svc.addPhoto).not.toHaveBeenCalled();
  });

  it('no file, or no alt text: 400 in plain words', async () => {
    const noFile = await call('post', '/api/admin/comms-hub/events/:id/photos', { id: EVENT }, multipart([{ name: 'alt_text', value: 'a speaker' }]));
    expect(noFile.statusCode).toBe(400);
    expect(noFile.body.error).toMatch(/Choose a picture/);
    const noAlt = await call('post', '/api/admin/comms-hub/events/:id/photos', { id: EVENT }, multipart([{ name: 'file', filename: 'a.jpg', bytes: JPG }]));
    expect(noAlt.statusCode).toBe(400);
    expect(svc.addPhoto).not.toHaveBeenCalled();
  });

  it('a rule refusal keeps its status and words; a bad event id is a 400', async () => {
    (svc.addPhoto as jest.Mock).mockRejectedValueOnce(new svc.PhotoRuleError('An event can have 6 pictures. Remove one first.', 409));
    const full = await call('post', '/api/admin/comms-hub/events/:id/photos', { id: EVENT }, multipart([{ name: 'alt_text', value: 'one more' }, { name: 'file', filename: 'x.jpg', bytes: JPG }]));
    expect(full.statusCode).toBe(409);
    expect(full.body.error).toMatch(/6 pictures/);
    expect((await call('get', '/api/admin/comms-hub/events/:id/photos', { id: 'nope' })).statusCode).toBe(400);
  });

  it('every photo route refuses a role without comms_hub', async () => {
    const who = { role: 'admin', mgmt_role: 'revenue' };
    expect((await call('get', '/api/admin/comms-hub/events/:id/photos', { id: EVENT }, undefined, who)).statusCode).toBe(403);
    expect((await call('post', '/api/admin/comms-hub/events/:id/photos', { id: EVENT }, multipart([{ name: 'alt_text', value: 'x y z' }]), who)).statusCode).toBe(403);
    expect((await call('delete', '/api/admin/comms-hub/events/:id/photos/:photoId', { id: EVENT, photoId: EVENT }, undefined, who)).statusCode).toBe(403);
  });
});
