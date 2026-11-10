/**
 * The intern video viewer's two halves:
 *   GET /api/admin/internship/videos/:id   section-gated metadata that MINTS a staff ticket
 *   GET /api/internship-video/:id/file     the bytes, authorized ONLY by that ticket, with Range
 */
const mockGet = jest.fn();
const mockResolve = jest.fn();
jest.mock('../../services/internship/internVideoViewer', () => ({ getInternVideo: (...a: unknown[]) => mockGet(...a) }));
jest.mock('../../services/presentation/recordingPlayback', () => ({ resolveStaffRecording: (...a: unknown[]) => mockResolve(...a) }));
jest.mock('../../services/presentation/recordingThumbnail', () => ({ ensureThumbnail: jest.fn().mockResolvedValue(null) }));
jest.mock('../../config/database', () => ({ sequelize: { fake: true } }));

import fs from 'fs';
import os from 'os';
import path from 'path';
import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import internVideoRoutes from '../admin/internVideoRoutes';
import internVideoStreamRoutes from '../internVideoStreamRoutes';
import { createRecordingTicket, createStaffRecordingTicket } from '../../services/presentation/recordingTicket';
import { env } from '../../config/env';

const ID = '588ada68-4795-4411-8cde-3b064f00045a';
const OTHER = '16bfbc61-5788-41dd-9281-298d5a483af1';
const admin = (): string => `Bearer ${jwt.sign({ id: 'a', email: 'ali@colaberry.com', role: 'admin' }, env.jwtSecret, { expiresIn: '5m' })}`;
function app(): Express { const a = express(); a.use(internVideoStreamRoutes); a.use(internVideoRoutes); return a; }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-video-'));
const file = path.join(dir, 'take.mp4');
fs.writeFileSync(file, Buffer.alloc(1000, 7));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
  mockGet.mockReset(); mockResolve.mockReset();
  mockResolve.mockResolvedValue({ ok: true, recording: { recordingId: ID, filePath: file, sizeBytes: 1000, mimeType: 'video/mp4', downloadName: 'PREP-1-review.mp4', ownerEnrollmentId: 'e1', durationSeconds: 71 } });
});

describe('GET /api/admin/internship/videos/:id (metadata + ticket)', () => {
  it('refuses an unauthenticated caller and never reads', async () => {
    expect([401, 403]).toContain((await request(app()).get(`/api/admin/internship/videos/${ID}`)).status);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('serves an admin, passing who asked as the ticket identity', async () => {
    mockGet.mockResolvedValue({ recordingId: ID, typeLabel: 'Project introduction', fileUrl: '/api/internship-video/x/file?t=y' });
    const res = await request(app()).get(`/api/admin/internship/videos/${ID}`).set('Authorization', admin());
    expect(res.status).toBe(200);
    expect(mockGet).toHaveBeenCalledWith(ID, 'ali@colaberry.com');
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  it('400 for a bad id, 404 for a recording that is not an active intern\'s', async () => {
    expect((await request(app()).get('/api/admin/internship/videos/nope').set('Authorization', admin())).status).toBe(400);
    mockGet.mockResolvedValue(null);
    expect((await request(app()).get(`/api/admin/internship/videos/${ID}`).set('Authorization', admin())).status).toBe(404);
  });
});

describe('GET /api/internship-video/:id/file (the bytes, ticket only)', () => {
  const url = (t: string, id = ID): string => `/api/internship-video/${id}/file?t=${encodeURIComponent(t)}`;

  it('no ticket, a learner ticket, a ticket for another recording, or a tampered one: all the same 404', async () => {
    expect((await request(app()).get(`/api/internship-video/${ID}/file`)).status).toBe(404);
    expect((await request(app()).get(url(createRecordingTicket(ID, 'e1')))).status).toBe(404);
    expect((await request(app()).get(url(createStaffRecordingTicket(OTHER, 'ali')))).status).toBe(404);
    expect((await request(app()).get(url(`${createStaffRecordingTicket(ID, 'ali')}x`))).status).toBe(404);
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it('an expired staff ticket is refused', async () => {
    const old = createStaffRecordingTicket(ID, 'ali', 60, new Date(Date.now() - 3600 * 1000));
    expect((await request(app()).get(url(old))).status).toBe(404);
  });

  it('a valid staff ticket streams the whole file, or a byte range for seeking', async () => {
    const t = createStaffRecordingTicket(ID, 'ali');
    const full = await request(app()).get(url(t));
    expect(full.status).toBe(200);
    expect(full.headers['content-type']).toBe('video/mp4');
    expect(full.headers['accept-ranges']).toBe('bytes');
    const part = await request(app()).get(url(t)).set('Range', 'bytes=100-199');
    expect(part.status).toBe(206);
    expect(part.headers['content-range']).toBe('bytes 100-199/1000');
    expect(part.headers['content-length']).toBe('100');
    expect((await request(app()).get(url(t)).set('Range', 'bytes=5000-6000')).status).toBe(416);
  });

  it('a recording whose file is gone says so (409); an unknown one is 404', async () => {
    const t = createStaffRecordingTicket(ID, 'ali');
    mockResolve.mockResolvedValue({ ok: false, reason: 'file_missing' });
    expect((await request(app()).get(url(t))).status).toBe(409);
    mockResolve.mockResolvedValue({ ok: false, reason: 'not_found' });
    expect((await request(app()).get(url(t))).status).toBe(404);
  });
});
