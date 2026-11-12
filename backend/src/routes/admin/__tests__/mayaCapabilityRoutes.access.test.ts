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
    // This used to probe `sendEmail`, which did not exist. MR2 added it, so the probe moved to a
    // name nothing will ever register - otherwise the next capability to ship silently turns this
    // assertion into a test of its own existence rather than of the unknown-name rejection.
    const res = await request(app()).post('/api/admin/maya/capabilities/notACapability/promote').set('Authorization', ALI).send({ review_note: 'ok to go' });
    expect(res.status).toBe(400);
    expect(mockPromote).not.toHaveBeenCalled();
  });
  it('200 for sendEmail, because MR2 registered it as a real capability', async () => {
    // The inverse of the assertion above, and the reason it had to move: before MR2 this route
    // rejected `sendEmail` as unknown. That rejection WAS the proof the capability was missing,
    // so turning it into a 200 is the proof it now exists and is promotable through the same
    // reviewed path as every other one. Promotion still requires Ali or a super_admin, still
    // requires a note, and still leaves the capability in shadow until the M29 flags are on.
    const res = await request(app()).post('/api/admin/maya/capabilities/sendEmail/promote').set('Authorization', ALI).send({ review_note: 'Reviewed the shadow drafts' });
    expect(res.status).toBe(200);
    expect(mockPromote).toHaveBeenCalledWith('sendEmail', { reviewerId: 'ali@colaberry.com', reviewNote: 'Reviewed the shadow drafts' });
  });
  it('403 for sendEmail when the admin is not Ali or a super_admin', async () => {
    // The new capability is the one that can reach a stranger's inbox, so it must not be
    // promotable by any admin who happens to be signed in.
    const res = await request(app()).post('/api/admin/maya/capabilities/sendEmail/promote').set('Authorization', OTHER_ADMIN).send({ review_note: 'ok to go' });
    expect(res.status).toBe(403);
    expect(mockPromote).not.toHaveBeenCalled();
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
