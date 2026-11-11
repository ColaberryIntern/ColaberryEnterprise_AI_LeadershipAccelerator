/**
 * C130 public featured work: unauthenticated, and the same 404 ("Not found") for anything that is not an approved featured piece
 * on a viewable page, so a stranger cannot probe. noindex follows the page; files are always noindex.
 */
const mockPiece = jest.fn();
const mockFile = jest.fn();
jest.mock('../../services/career/featuredWork', () => ({
  getPublicFeaturedPiece: (...a: unknown[]) => mockPiece(...a),
  getPublicFeaturedFile: (...a: unknown[]) => mockFile(...a),
}));
jest.mock('../../services/internship/officeToHtml', () => {
  class OfficeParseError extends Error {}
  return { OfficeParseError, renderOfficeFile: async () => '<html>doc</html>' };
});
jest.mock('../../services/internship/internArtifactXlsx', () => ({ csvRowsToXlsx: async () => Buffer.from('xlsx') }));

import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';
import request from 'supertest';
import routes from '../publicFeaturedWorkRoutes';

const ID = '11111111-2222-4333-8444-555555555555';
const P = `/api/public/portfolios/ali-m/work/${ID}`;
const app = () => { const a = express(); a.use(routes); return a; };
let errSpy: jest.SpyInstance;
beforeEach(() => { mockPiece.mockReset(); mockFile.mockReset(); errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => errSpy.mockRestore());

it('serves an approved featured piece with no login; noindex unless the learner chose public', async () => {
  mockPiece.mockResolvedValue({ piece: { id: ID, title: 'Case study' }, indexable: false });
  const res = await request(app()).get(P);
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ ok: true, piece: { id: ID, title: 'Case study' } });
  expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
  expect(mockPiece).toHaveBeenCalledWith('ali-m', ID);
  mockPiece.mockResolvedValue({ piece: { id: ID }, indexable: true });
  expect((await request(app()).get(P)).headers['x-robots-tag']).toBeUndefined();
});

it('the same 404 body for not featured, not approved, not viewable, a bad slug and a bad id', async () => {
  mockPiece.mockResolvedValue(null);
  const a = await request(app()).get(P);
  const b = await request(app()).get(`/api/public/portfolios/ali-m/work/not-a-uuid`);
  const c = await request(app()).get(`/api/public/portfolios/${encodeURIComponent('bad slug!')}/work/${ID}`);
  for (const r of [a, b, c]) { expect(r.status).toBe(404); expect(r.body).toEqual({ error: 'Not found' }); }
  expect(mockPiece).toHaveBeenCalledTimes(1);
});

it('500 without leaking the error', async () => {
  mockPiece.mockRejectedValue(new Error('pool exhausted at 10.0.0.5'));
  const res = await request(app()).get(P);
  expect(res.status).toBe(500);
  expect(JSON.stringify(res.body)).not.toContain('10.0.0.5');
});

describe('files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pubfeat-'));
  const pdf = path.join(dir, 'a.pdf');
  fs.writeFileSync(pdf, '%PDF-1.4 test');
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('streams an approved PDF inline, nosniff and always noindex; 404 otherwise', async () => {
    mockFile.mockResolvedValue({ file: { absPath: pdf, name: 'a.pdf', kind: 'pdf', contentType: 'application/pdf', title: 'A' }, piece: {} });
    const res = await request(app()).get(`${P}/file`);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/^inline/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
    mockFile.mockResolvedValue(null);
    expect((await request(app()).get(`${P}/file`)).status).toBe(404);
    expect((await request(app()).get(`${P}/preview`)).status).toBe(404);
  });

  it('Excel only for an approved CSV', async () => {
    mockPiece.mockResolvedValue({ piece: { file: { name: 'x.csv', kind: 'csv', table: [['a']] } }, indexable: false });
    expect((await request(app()).get(`${P}/xlsx`)).status).toBe(200);
    mockPiece.mockResolvedValue(null);
    expect((await request(app()).get(`${P}/xlsx`)).status).toBe(404);
  });
});
