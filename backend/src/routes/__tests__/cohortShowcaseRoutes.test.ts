/**
 * C138 Showcase routes: participant-only, portfolio-entitled, the viewer from the TOKEN only, UUID-validated, and ONE identical 404
 * for every piece the viewer may not see (another cohort, unshared, deleted, made up). Who sees what is sharedWork's decision
 * (tested in sharedWork.test.ts); here the service is mocked.
 */
jest.mock('../../middlewares/authFailureLog', () => ({ logAuthFailure: jest.fn(), describeCaller: () => ({ forwarded_for: null, user_agent: null }) }));
let mockEntitled = true;
const mockGateFeatures: string[] = [];
jest.mock('../../middlewares/requireContentEntitlement', () => ({
  requireContentEntitlement: (feature: string) => {
    mockGateFeatures.push(feature);
    return (_req: unknown, res: { status: (n: number) => { json: (b: unknown) => void } }, next: () => void) => {
      if (mockEntitled) next(); else res.status(402).json({ error: 'not entitled' });
    };
  },
}));
const mockList = jest.fn();
const mockPiece = jest.fn();
const mockFile = jest.fn();
jest.mock('../../services/career/sharedWork', () => ({
  listCohortShowcase: (...a: unknown[]) => mockList(...a),
  getCohortSharedPiece: (...a: unknown[]) => mockPiece(...a),
  getCohortSharedFile: (...a: unknown[]) => mockFile(...a),
}));
jest.mock('../../services/internship/internArtifactXlsx', () => ({ csvRowsToXlsx: async () => Buffer.from('xlsx') }));

import fs from 'fs';
import os from 'os';
import path from 'path';
import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { env } from '../../config/env';
import cohortShowcaseRoutes, { SHOWCASE_NOT_FOUND } from '../cohortShowcaseRoutes';

const ID = '11111111-2222-4333-8444-555555555555';
const P = '/api/portal/career/showcase';
const token = (extra: Record<string, unknown> = {}) => jwt.sign({ sub: 'enr-9', email: 'l@example.com', role: 'participant', cohort_id: 'jwt-cohort', ...extra }, env.jwtSecret, { expiresIn: '5m' });
const app = (): Express => { const a = express(); a.use(express.json()); a.use(cohortShowcaseRoutes); return a; };
const get = (url: string, t: string | null = token()) => (t ? request(app()).get(url).set('Authorization', `Bearer ${t}`) : request(app()).get(url));
const CARD = { id: ID, group: 'written', title: 'Case study', from: 'Week 2', createdAt: '2026-08-25T15:00:00.000Z', week: 2, project: null, skills: [], author: 'Dana Learner', sharedAt: '2026-11-10T15:00:00.000Z', mine: false };

let errSpy: jest.SpyInstance;
beforeEach(() => {
  mockEntitled = true;
  [mockList, mockPiece, mockFile].forEach((m) => m.mockReset());
  errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => errSpy.mockRestore());

it('gates every route on the portfolio entitlement', () => {
  expect(new Set(mockGateFeatures)).toEqual(new Set(['portfolio']));
});

describe('GET /api/portal/career/showcase', () => {
  it('lists for the TOKEN enrollment (never a cohort from the token or the query), uncached', async () => {
    mockList.mockResolvedValue({ items: [CARD], newThisWeek: CARD });
    const res = await get(`${P}?cohort_id=other&enrollment_id=someone`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [CARD], newThisWeek: CARD });
    expect(mockList).toHaveBeenCalledWith('enr-9');
    expect(mockList.mock.calls[0]).toHaveLength(1);
    expect(res.headers['cache-control']).toContain('no-store');
  });

  it('refuses no token (401), a staff token (403), the unentitled (402), never reading', async () => {
    expect((await get(P, null)).status).toBe(401);
    expect((await get(P, token({ role: 'admin' }))).status).toBe(403);
    mockEntitled = false;
    expect((await get(P)).status).toBe(402);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('a failing read is a 500 with no rows and no leak, logged with its error class', async () => {
    mockList.mockRejectedValue(new RangeError('connection reset at 10.0.0.5'));
    const res = await get(P);
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Could not load the Showcase.' });
    expect(JSON.stringify(res.body)).not.toContain('10.0.0.5');
    expect(JSON.parse(String(errSpy.mock.calls.at(-1)?.[0]))).toMatchObject({ event: 'cohort_showcase_list_failed', error_class: 'RangeError' });
  });
});

describe('GET /api/portal/career/showcase/:id and its file routes', () => {
  it("serves a classmate's shared piece, asked for by the token enrollment", async () => {
    mockPiece.mockResolvedValue({ id: ID, title: 'Case study', author: 'Dana Learner' });
    const res = await get(`${P}/${ID}`);
    expect(res.status).toBe(200);
    expect(res.body.piece.author).toBe('Dana Learner');
    expect(mockPiece).toHaveBeenCalledWith('enr-9', ID);
  });

  it("streams a classmate's shared file and builds its xlsx, asked for by the token enrollment", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-'));
    const pdf = path.join(dir, 'a.pdf');
    fs.writeFileSync(pdf, '%PDF-1.4 test');
    mockFile.mockResolvedValue({ file: { absPath: pdf, name: 'a.pdf', kind: 'pdf', contentType: 'application/pdf', title: 'A' }, piece: { id: ID } });
    const f = await get(`${P}/${ID}/file`);
    expect(f.status).toBe(200);
    expect(f.headers['content-disposition']).toMatch(/^inline/);
    expect(f.headers['x-content-type-options']).toBe('nosniff');
    expect(mockFile).toHaveBeenCalledWith('enr-9', ID);
    mockPiece.mockResolvedValue({ id: ID, file: { name: 'x.csv', kind: 'csv', table: [['a'], ['1']] } });
    const x = await get(`${P}/${ID}/xlsx`);
    expect(x.status).toBe(200);
    expect(x.headers['content-disposition']).toContain('x.xlsx');
    expect(mockPiece).toHaveBeenCalledWith('enr-9', ID);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('every not-visible piece is the SAME 404 body on every route', async () => {
    mockPiece.mockResolvedValue(null);
    mockFile.mockResolvedValue(null);
    const bodies = await Promise.all(['', '/file', '/preview', '/xlsx'].map((s) => get(`${P}/${ID}${s}`)));
    for (const r of bodies) { expect(r.status).toBe(404); expect(r.body).toEqual(SHOWCASE_NOT_FOUND); }
  });

  it('400 for a malformed id, never reading', async () => {
    for (const s of ['', '/file', '/preview', '/xlsx']) expect((await get(`${P}/not-a-uuid${s}`)).status).toBe(400);
    expect(mockPiece).not.toHaveBeenCalled();
    expect(mockFile).not.toHaveBeenCalled();
  });

  it('refuses no token and the unentitled on the file route, never reading', async () => {
    expect((await get(`${P}/${ID}/file`, null)).status).toBe(401);
    mockEntitled = false;
    expect((await get(`${P}/${ID}/file`)).status).toBe(402);
    expect(mockFile).not.toHaveBeenCalled();
  });

  it('500 without leaking the error', async () => {
    mockPiece.mockRejectedValue(new Error('deadlock at 10.0.0.5'));
    const res = await get(`${P}/${ID}`);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('10.0.0.5');
  });
});
