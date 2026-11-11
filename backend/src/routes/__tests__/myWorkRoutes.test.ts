/**
 * C128 My work routes: participant-only, entitlement-gated, the enrollment from the TOKEN only, UUID-validated,
 * and silent (404) about any piece that is not the caller's. The service is mocked; myWorkModel tests cover shapes.
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
jest.mock('../../services/myWork/myWorkService', () => ({
  listMyWork: (...a: unknown[]) => mockList(...a),
  getMyWorkPiece: (...a: unknown[]) => mockPiece(...a),
  getMyWorkFile: (...a: unknown[]) => mockFile(...a),
}));
const mockRender = jest.fn();
jest.mock('../../services/internship/officeToHtml', () => {
  class OfficeParseError extends Error {}
  return { OfficeParseError, renderOfficeFile: (...a: unknown[]) => mockRender(...a) };
});
jest.mock('../../services/internship/internArtifactXlsx', () => ({ csvRowsToXlsx: async () => Buffer.from('xlsx') }));

import fs from 'fs';
import os from 'os';
import path from 'path';
import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { env } from '../../config/env';
import myWorkRoutes from '../myWorkRoutes';

const ID = '11111111-2222-4333-8444-555555555555';
const P = '/api/portal/career/work';
const token = (extra: Record<string, unknown> = {}) => jwt.sign({ sub: 'enr-9', email: 'l@example.com', role: 'participant', ...extra }, env.jwtSecret, { expiresIn: '5m' });
const app = (): Express => { const a = express(); a.use(myWorkRoutes); return a; };
const get = (url: string, t: string | null = token()) => (t ? request(app()).get(url).set('Authorization', `Bearer ${t}`) : request(app()).get(url));

let errSpy: jest.SpyInstance;
beforeEach(() => {
  mockEntitled = true;
  [mockList, mockPiece, mockFile, mockRender].forEach((m) => m.mockReset());
  errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => errSpy.mockRestore());

it('gates every route on the portfolio entitlement', () => {
  expect(mockGateFeatures.length).toBeGreaterThan(0);
  expect(new Set(mockGateFeatures)).toEqual(new Set(['portfolio']));
});

describe('GET /api/portal/career/work', () => {
  it('lists the TOKEN enrollment\'s pieces, uncached', async () => {
    mockList.mockResolvedValue([{ id: ID, title: 'Guide' }]);
    const res = await get(P);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [{ id: ID, title: 'Guide' }] });
    expect(mockList).toHaveBeenCalledWith('enr-9');
    expect(res.headers['cache-control']).toContain('no-store');
  });

  it('ignores an enrollment id in the query string: the subject is the token', async () => {
    mockList.mockResolvedValue([]);
    await get(`${P}?enrollment_id=someone-else`);
    expect(mockList).toHaveBeenCalledWith('enr-9');
  });

  it('refuses no token (401), a staff token (403), and a learner without the entitlement (402), never reading', async () => {
    expect((await get(P, null)).status).toBe(401);
    expect((await get(P, token({ role: 'admin' }))).status).toBe(403);
    mockEntitled = false;
    expect((await get(P)).status).toBe(402);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('500 without leaking the error', async () => {
    mockList.mockRejectedValue(new Error('connection reset at 10.0.0.5'));
    const res = await get(P);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('10.0.0.5');
  });

  it('an empty list is a 200 with no items, not an error', async () => {
    mockList.mockResolvedValue([]);
    const res = await get(P);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });
});

describe('GET /api/portal/career/work/:id', () => {
  it('serves the caller\'s own piece, asking for it by the token enrollment', async () => {
    mockPiece.mockResolvedValue({ id: ID, title: 'Case study' });
    const res = await get(`${P}/${ID}`);
    expect(res.status).toBe(200);
    expect(mockPiece).toHaveBeenCalledWith('enr-9', ID);
  });

  it('404 for a piece that is not the caller\'s (the service answers null), with no detail', async () => {
    mockPiece.mockResolvedValue(null);
    const res = await get(`${P}/${ID}`);
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain(ID);
  });

  it('400 for a non-UUID id before any read, on every piece route', async () => {
    for (const s of ['', '/file', '/preview', '/xlsx']) {
      expect((await get(`${P}/not-an-id${s}`)).status).toBe(400);
    }
    expect(mockPiece).not.toHaveBeenCalled();
    expect(mockFile).not.toHaveBeenCalled();
  });

  it('refuses no token on every piece route', async () => {
    for (const s of ['', '/file', '/preview', '/xlsx']) expect((await get(`${P}/${ID}${s}`, null)).status).toBe(401);
  });
});

describe('the file routes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mywork-'));
  const pdf = path.join(dir, 'a.pdf');
  const docx = path.join(dir, 'b.docx');
  fs.writeFileSync(pdf, '%PDF-1.4 test');
  fs.writeFileSync(docx, 'PK');
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('streams the caller\'s PDF inline with nosniff; download=1 makes it an attachment', async () => {
    mockFile.mockResolvedValue({ absPath: pdf, name: 'a.pdf', kind: 'pdf', contentType: 'application/pdf', title: 'A' });
    const res = await get(`${P}/${ID}/file`);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/^inline/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(mockFile).toHaveBeenCalledWith('enr-9', ID);
    expect((await get(`${P}/${ID}/file?download=1`)).headers['content-disposition']).toMatch(/^attachment/);
  });

  it('a Word file is always an attachment, never inline', async () => {
    mockFile.mockResolvedValue({ absPath: docx, name: 'b.docx', kind: 'word', contentType: 'application/x', title: 'B' });
    expect((await get(`${P}/${ID}/file`)).headers['content-disposition']).toMatch(/^attachment/);
  });

  it('404 when the piece is not the caller\'s or has no file', async () => {
    mockFile.mockResolvedValue(null);
    expect((await get(`${P}/${ID}/file`)).status).toBe(404);
    expect((await get(`${P}/${ID}/preview`)).status).toBe(404);
  });

  it('previews Word as HTML, 400 for a PDF, 422 when the document cannot be read', async () => {
    mockFile.mockResolvedValue({ absPath: docx, name: 'b.docx', kind: 'word', contentType: 'x', title: 'B' });
    mockRender.mockResolvedValue('<html>doc</html>');
    const ok = await get(`${P}/${ID}/preview`);
    expect(ok.status).toBe(200);
    expect(ok.body.html).toBe('<html>doc</html>');
    const { OfficeParseError } = jest.requireMock('../../services/internship/officeToHtml') as { OfficeParseError: new (m: string) => Error };
    mockRender.mockRejectedValue(new OfficeParseError('Not a Word file.'));
    expect((await get(`${P}/${ID}/preview`)).status).toBe(422);
    mockFile.mockResolvedValue({ absPath: pdf, name: 'a.pdf', kind: 'pdf', contentType: 'application/pdf', title: 'A' });
    expect((await get(`${P}/${ID}/preview`)).status).toBe(400);
  });

  it('builds Excel from the caller\'s CSV; 400 for anything else; 404 when not theirs', async () => {
    mockPiece.mockResolvedValue({ id: ID, file: { name: 'x.csv', kind: 'csv', table: [['a'], ['1']] } });
    const ok = await get(`${P}/${ID}/xlsx`);
    expect(ok.status).toBe(200);
    expect(ok.headers['content-disposition']).toContain('x.xlsx');
    mockPiece.mockResolvedValue({ id: ID, file: { name: 'x.pdf', kind: 'pdf', table: null } });
    expect((await get(`${P}/${ID}/xlsx`)).status).toBe(400);
    mockPiece.mockResolvedValue(null);
    expect((await get(`${P}/${ID}/xlsx`)).status).toBe(404);
  });
});
