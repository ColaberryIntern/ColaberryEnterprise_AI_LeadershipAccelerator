/**
 * The studio's video routes act on the SESSION's enrollment only, refuse what is not a video with a
 * readable sentence, and always delete the uploaded temp file.
 */
import fs from 'fs';
import express from 'express';
import request from 'supertest';

jest.mock('../../services/hire/hireVideoService', () => {
  const actual = jest.requireActual('../../services/hire/hireVideoService');
  return { ...actual, saveVideo: jest.fn(), updateVideo: jest.fn(), deleteVideo: jest.fn(), readStudioVideo: jest.fn() };
});
jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import * as svc from '../../services/hire/hireVideoService';
import { hireVideoTempPaths } from '../../config/hireVideoUpload';
import { handleDeleteHireVideo, handleGetHireVideo, handleUpdateHireVideo, handleUploadHireVideo } from '../hireVideoController';

const m = (f: unknown) => f as jest.Mock;
const ME = '11111111-1111-4111-8111-111111111111';
let seenTemp: string[] = [];

const app = express();
app.use(express.json());
app.use((req, _res, next) => { (req as any).participant = { sub: ME }; next(); });
app.get('/v', handleGetHireVideo);
app.post('/v', (req, res, next) => {
  res.on('finish', () => { seenTemp = hireVideoTempPaths(req); });
  handleUploadHireVideo(req, res, next);
});
app.put('/v', handleUpdateHireVideo);
app.delete('/v', handleDeleteHireVideo);

beforeEach(() => { jest.clearAllMocks(); seenTemp = []; });

test('an upload is saved for the caller, and its temp file is gone afterwards', async () => {
  m(svc.saveVideo).mockResolvedValue({ status: 'draft' });
  const r = await request(app).post('/v').attach('video', Buffer.from('webm-bytes'), { filename: 'take.webm', contentType: 'video/webm' });
  expect(r.status).toBe(200);
  expect(m(svc.saveVideo).mock.calls[0][0]).toBe(ME);
  expect(seenTemp).toHaveLength(1);
  expect(fs.existsSync(seenTemp[0])).toBe(false);
});

test('a rejected video still cleans up, and says why', async () => {
  m(svc.saveVideo).mockRejectedValue(Object.assign(new Error('That video is too short. Aim for about 90 seconds.'), { status: 400, error_class: 'ValidationError' }));
  const r = await request(app).post('/v').attach('video', Buffer.from('x'), { filename: 'a.mp4', contentType: 'video/mp4' });
  expect(r.status).toBe(400);
  expect(r.body.error).toMatch(/too short/);
  expect(fs.existsSync(seenTemp[0])).toBe(false);
});

test('not a video, or no file at all: a 400 with a sentence, and nothing saved', async () => {
  const a = await request(app).post('/v').attach('video', Buffer.from('%PDF'), { filename: 'resume.pdf', contentType: 'application/pdf' });
  expect(a.status).toBe(400);
  expect(a.body.error).toMatch(/not a video/);
  const b = await request(app).post('/v').field('x', '1');
  expect(b.status).toBe(400);
  expect(b.body.error).toMatch(/Choose a video/);
  expect(svc.saveVideo).not.toHaveBeenCalled();
});

test('settings are validated; an id in the body changes nothing about whose video it is', async () => {
  expect((await request(app).put('/v').send({})).status).toBe(400);
  expect((await request(app).put('/v').send({ published: 'yes' })).status).toBe(400);
  expect((await request(app).put('/v').send({ published: true, enrollmentId: 'someone-else' })).status).toBe(400); // strict
  m(svc.updateVideo).mockResolvedValue({ status: 'published' });
  expect((await request(app).put('/v').send({ published: true })).status).toBe(200);
  expect(m(svc.updateVideo).mock.calls[0]).toEqual([ME, { published: true }]);
});

test('read and delete are the caller\'s own', async () => {
  m(svc.readStudioVideo).mockResolvedValue(null);
  expect((await request(app).get('/v')).body).toEqual({ ok: true, video: null });
  expect((await request(app).delete('/v')).status).toBe(200);
  expect(svc.deleteVideo).toHaveBeenCalledWith(ME);
});
