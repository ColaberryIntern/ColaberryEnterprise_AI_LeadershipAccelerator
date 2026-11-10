/**
 * The artifact viewer route: section-gated, UUID-validated, and silent (404) about anything that is
 * not an active intern's artifact.
 */
const mockGet = jest.fn();
const mockFile = jest.fn();
jest.mock('../../../services/internship/internArtifactViewer', () => ({
  getInternArtifact: (...a: unknown[]) => mockGet(...a),
  getInternArtifactFile: (...a: unknown[]) => mockFile(...a),
}));
jest.mock('../../../config/database', () => ({ sequelize: { fake: true } }));

import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import internArtifactRoutes from '../internArtifactRoutes';
import { env } from '../../../config/env';

const ID = '11111111-2222-4333-8444-555555555555';
const URL = `/api/admin/internship/artifacts/${ID}`;

function tokenFor(mgmtRole: string | null, role = 'staff'): string {
  const payload: Record<string, unknown> = { id: 'test-admin', email: 'test@example.test', role };
  if (mgmtRole) payload.mgmt_role = mgmtRole;
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '5m' });
}
function app(): Express {
  const a = express();
  a.use(internArtifactRoutes);
  return a;
}

beforeEach(() => { mockGet.mockReset(); mockFile.mockReset(); });

describe('GET /api/admin/internship/artifacts/:id', () => {
  it('refuses an unauthenticated caller and never reads', async () => {
    const res = await request(app()).get(URL);
    expect([401, 403]).toContain(res.status);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('serves an admin', async () => {
    mockGet.mockResolvedValue({ id: ID, kind: 'field_guide', title: 'Guide', html: '<p>x</p>' });
    const res = await request(app()).get(URL).set('Authorization', `Bearer ${tokenFor(null, 'admin')}`);
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Guide');
    expect(mockGet).toHaveBeenCalledWith(ID);
  });

  it('rejects a non-UUID id with 400 before touching the database', async () => {
    const res = await request(app()).get('/api/admin/internship/artifacts/not-an-id').set('Authorization', `Bearer ${tokenFor(null, 'admin')}`);
    expect(res.status).toBe(400);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('answers 404 when the artifact is not an active intern\'s', async () => {
    mockGet.mockResolvedValue(null);
    const res = await request(app()).get(URL).set('Authorization', `Bearer ${tokenFor(null, 'admin')}`);
    expect(res.status).toBe(404);
  });

  it('answers 500 without leaking the error when the read fails', async () => {
    mockGet.mockRejectedValue(new Error('connection reset by peer at 10.0.0.5'));
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await request(app()).get(URL).set('Authorization', `Bearer ${tokenFor(null, 'admin')}`);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('10.0.0.5');
    err.mockRestore();
  });
});

describe('GET /api/admin/internship/artifacts/:id/file (the PDF viewer and downloads)', () => {
  const fs = jest.requireActual('fs') as typeof import('fs');
  const os = jest.requireActual('os') as typeof import('os');
  const path = jest.requireActual('path') as typeof import('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-artifact-'));
  const pdf = path.join(dir, 'brief.pdf');
  fs.writeFileSync(pdf, '%PDF-1.4 test');
  const admin = (): string => `Bearer ${tokenFor(null, 'admin')}`;
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('refuses an unauthenticated caller and never looks up the file', async () => {
    const res = await request(app()).get(`${URL}/file`);
    expect([401, 403]).toContain(res.status);
    expect(mockFile).not.toHaveBeenCalled();
  });

  it('serves a PDF inline so the browser viewer opens it', async () => {
    mockFile.mockResolvedValue({ absPath: pdf, name: 'brief.pdf', kind: 'pdf', contentType: 'application/pdf', title: 'Brief' });
    const res = await request(app()).get(`${URL}/file`).set('Authorization', admin());
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toMatch(/^inline; filename="brief.pdf"/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('?download=1 and every non-PDF file are attachments, never rendered on our origin', async () => {
    mockFile.mockResolvedValue({ absPath: pdf, name: 'brief.pdf', kind: 'pdf', contentType: 'application/pdf', title: 'Brief' });
    expect((await request(app()).get(`${URL}/file?download=1`).set('Authorization', admin())).headers['content-disposition']).toMatch(/^attachment/);
    mockFile.mockResolvedValue({ absPath: pdf, name: 'page.html', kind: 'other', contentType: 'application/octet-stream', title: 'x' });
    const res = await request(app()).get(`${URL}/file`).set('Authorization', admin());
    expect(res.headers['content-disposition']).toMatch(/^attachment/);
    expect(res.headers['content-type']).toBe('application/octet-stream');
  });

  it('404 when there is no file; 400 for a bad id', async () => {
    mockFile.mockResolvedValue(null);
    expect((await request(app()).get(`${URL}/file`).set('Authorization', admin())).status).toBe(404);
    expect((await request(app()).get('/api/admin/internship/artifacts/nope/file').set('Authorization', admin())).status).toBe(400);
  });
});

describe('GET /api/admin/internship/artifacts/:id/xlsx (open a CSV in Excel)', () => {
  const admin = (): string => `Bearer ${tokenFor(null, 'admin')}`;
  const csvArtifact = { id: ID, file: { name: 'inventory.csv', kind: 'csv', available: true, text: 'a,b\n1,2', table: [['Deliverable', 'Verdict'], ['MCP server', 'Solid']], note: null } };

  it('refuses an unauthenticated caller', async () => {
    expect([401, 403]).toContain((await request(app()).get(`${URL}/xlsx`)).status);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('returns a real .xlsx workbook for a CSV artifact', async () => {
    mockGet.mockResolvedValue(csvArtifact);
    const res = await request(app()).get(`${URL}/xlsx`).set('Authorization', admin()).buffer(true)
      .parse((r, cb) => { const chunks: Buffer[] = []; r.on('data', (c: Buffer) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))); });
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="inventory.xlsx"/);
    expect((res.body as Buffer).subarray(0, 2).toString()).toBe('PK'); // xlsx is a zip
  });

  it('400 for a non-CSV artifact, 404 with no file', async () => {
    mockGet.mockResolvedValue({ id: ID, file: { ...csvArtifact.file, kind: 'pdf', table: null } });
    expect((await request(app()).get(`${URL}/xlsx`).set('Authorization', admin())).status).toBe(400);
    mockGet.mockResolvedValue({ id: ID, file: null });
    expect((await request(app()).get(`${URL}/xlsx`).set('Authorization', admin())).status).toBe(404);
  });
});
