/**
 * The artifact viewer route: section-gated, UUID-validated, and silent (404) about anything that is
 * not an active intern's artifact.
 */
const mockGet = jest.fn();
jest.mock('../../../services/internship/internArtifactViewer', () => ({ getInternArtifact: (...a: unknown[]) => mockGet(...a) }));
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

beforeEach(() => mockGet.mockReset());

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
