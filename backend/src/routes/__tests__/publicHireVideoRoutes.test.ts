/**
 * The public playback route: cross-origin by design, cacheable only when published, a uniform 404
 * for anything it may not serve, and byte ranges for seeking.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import helmet from 'helmet';
import request from 'supertest';

jest.mock('../../services/hire/hireVideoService', () => ({ resolveVideoFile: jest.fn() }));

import { resolveVideoFile } from '../../services/hire/hireVideoService';
import { createHireVideoRouter } from '../publicHireVideoRoutes';

const resolve = resolveVideoFile as unknown as jest.Mock;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'hire-video-route-'));
const FILE = path.join(DIR, 'stream.mp4');
fs.writeFileSync(FILE, Buffer.from('0123456789'));
const ID = 'c'.repeat(24);

// Mounted behind helmet() exactly as server.ts does, so the CORP override is tested against the real default.
const app = express().use(helmet()).use(createHireVideoRouter());

beforeEach(() => resolve.mockReset());
afterAll(() => fs.rmSync(DIR, { recursive: true, force: true }));

test('a published video is cross-origin readable and cached briefly', async () => {
  resolve.mockResolvedValue({ path: FILE, type: 'video/mp4', published: true });
  const r = await request(app).get(`/api/public/hire/video/${ID}/stream`);
  expect(r.status).toBe(200);
  expect(r.headers['content-type']).toBe('video/mp4');
  expect(r.headers['cross-origin-resource-policy']).toBe('cross-origin');
  expect(r.headers['cache-control']).toBe('public, max-age=300');
  expect(r.headers['x-robots-tag']).toBeUndefined();
  expect(resolve).toHaveBeenCalledWith(ID, 'stream', undefined);
});

test('a draft preview is never cached or indexed, and the token is passed through', async () => {
  resolve.mockResolvedValue({ path: FILE, type: 'video/mp4', published: false });
  const r = await request(app).get(`/api/public/hire/video/${ID}/stream?t=abc`);
  expect(r.headers['cache-control']).toBe('private, no-store');
  expect(r.headers['x-robots-tag']).toBe('noindex, nofollow');
  expect(resolve).toHaveBeenCalledWith(ID, 'stream', 'abc');
});

test('seeking works: a byte range gets a 206', async () => {
  resolve.mockResolvedValue({ path: FILE, type: 'video/mp4', published: true });
  const r = await request(app).get(`/api/public/hire/video/${ID}/stream`).set('Range', 'bytes=2-5');
  expect(r.status).toBe(206);
  expect(r.headers['content-range']).toBe('bytes 2-5/10');
});

test('anything it may not serve is the same plain 404, and an unknown kind never reaches the service', async () => {
  resolve.mockResolvedValue(null);
  const r = await request(app).get(`/api/public/hire/video/${ID}/stream`);
  expect(r.status).toBe(404);
  expect(r.headers['cache-control']).toBe('no-store');
  const k = await request(app).get(`/api/public/hire/video/${ID}/secrets`);
  expect(k.status).toBe(404);
  expect(resolve).toHaveBeenCalledTimes(1);
});

test('a failing lookup is a 500 with no detail', async () => {
  resolve.mockRejectedValue(new Error('db down: password=hunter2'));
  const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const r = await request(app).get(`/api/public/hire/video/${ID}/poster`);
  expect(r.status).toBe(500);
  expect(JSON.stringify(r.body)).not.toMatch(/hunter2/);
  expect(spy.mock.calls.join(' ')).not.toMatch(/hunter2/);
  spy.mockRestore();
});
