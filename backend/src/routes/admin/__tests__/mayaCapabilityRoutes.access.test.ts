import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

/**
 * M37 routes: who may see, promote and revert Maya's capabilities. The service is mocked; its decisions are covered
 * in services/maya/__tests__/mayaPromotion.test.ts. This file is about the route boundary only.
 */
const mockPromote = jest.fn();
const mockRevert = jest.fn();
jest.mock('../../../services/maya/mayaPromotion', () => {
  const actual = jest.requireActual('../../../services/maya/mayaPromotion');
  return {
    ...actual,
    resolveAllMayaModes: jest.fn(async () => [{ capability: 'respondToExplorerDm', mode: 'live', reason: 'default_live' }]),
    readPromotionRecord: jest.fn(async () => ({ capabilities: {}, history: [] })),
    promoteMayaCapability: (...a: unknown[]) => mockPromote(...a),
    revertMayaCapability: (...a: unknown[]) => mockRevert(...a),
  };
});

import routes from '../mayaCapabilityRoutes';
import { env } from '../../../config/env';

const token = (email: string, role: string) => `Bearer ${jwt.sign({ sub: 'u1', email, role }, env.jwtSecret, { expiresIn: '5m' })}`;
const ALI = token('ali@colaberry.com', 'admin');
const OTHER_ADMIN = token('ops@colaberry.com', 'admin');

function app(): Express {
  const a = express();
  a.use(express.json());
  a.use(routes);
  return a;
}

beforeEach(() => {
  mockPromote.mockReset().mockResolvedValue({ capability: 'sendInAppWelcome', state: 'live', changed: true });
  mockRevert.mockReset().mockResolvedValue({ capability: 'sendInAppWelcome', state: 'shadow', changed: true });
});

describe('GET /api/admin/maya/capabilities', () => {
  it('401 without a token', async () => {
    expect((await request(app()).get('/api/admin/maya/capabilities')).status).toBe(401);
  });
  it('200 for an admin, with modes and promotions', async () => {
    const res = await request(app()).get('/api/admin/maya/capabilities').set('Authorization', OTHER_ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.modes[0]).toMatchObject({ capability: 'respondToExplorerDm', mode: 'live' });
  });
});

describe('POST promote', () => {
  const url = '/api/admin/maya/capabilities/sendInAppWelcome/promote';
  it('401 without a token', async () => {
    expect((await request(app()).post(url).send({ review_note: 'ok to go' })).status).toBe(401);
  });
  it('403 for an admin who is not Ali or a super_admin (nobody else promotes)', async () => {
    const res = await request(app()).post(url).set('Authorization', OTHER_ADMIN).send({ review_note: 'ok to go' });
    expect(res.status).toBe(403);
    expect(mockPromote).not.toHaveBeenCalled();
  });
  it('400 with no review note, and nothing is promoted', async () => {
    const res = await request(app()).post(url).set('Authorization', ALI).send({});
    expect(res.status).toBe(400);
    expect(mockPromote).not.toHaveBeenCalled();
  });
  it('400 for an unknown capability', async () => {
    const res = await request(app()).post('/api/admin/maya/capabilities/sendEmail/promote').set('Authorization', ALI).send({ review_note: 'ok to go' });
    expect(res.status).toBe(400);
  });
  it('200 for Ali; the reviewer is the token identity, never a body field', async () => {
    const res = await request(app()).post(url).set('Authorization', ALI).send({ review_note: 'Reviewed it', reviewerId: 'someone-else' });
    expect(res.status).toBe(200);
    expect(mockPromote).toHaveBeenCalledWith('sendInAppWelcome', { reviewerId: 'ali@colaberry.com', reviewNote: 'Reviewed it' });
  });
});

describe('POST revert', () => {
  const url = '/api/admin/maya/capabilities/respondToExplorerDm/revert';
  it('any admin may silence a capability', async () => {
    const res = await request(app()).post(url).set('Authorization', OTHER_ADMIN).send({ review_note: 'Pausing her' });
    expect(res.status).toBe(200);
    expect(mockRevert).toHaveBeenCalledWith('respondToExplorerDm', { reviewerId: 'ops@colaberry.com', reviewNote: 'Pausing her' });
  });
  it('401 without a token', async () => {
    expect((await request(app()).post(url).send({ review_note: 'Pausing her' })).status).toBe(401);
  });
});
