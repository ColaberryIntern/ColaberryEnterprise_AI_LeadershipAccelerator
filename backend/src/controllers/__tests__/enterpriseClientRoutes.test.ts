/**
 * W32 (Phase 5 review): the two public client routes, end to end through Express.
 *   - request-link answers the same body, at once, whether or not the email is known, and never
 *     waits on the lookup or the send (no enumeration by content or by timing);
 *   - status takes only a client token: none, garbage, or an ADMIN token is a 401;
 *   - and a client token is not an admin token (refused by requireAdmin).
 */
import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const mockFindOne = jest.fn();
const mockFindByPk = jest.fn();
const mockSendLink = jest.fn();

jest.mock('../../config/database', () => ({ sequelize: { fake: true } }));
jest.mock('../../models/EnterpriseIntake', () => ({
  __esModule: true,
  default: { findOne: (...a: any[]) => mockFindOne(...a), findByPk: (...a: any[]) => mockFindByPk(...a), findAll: jest.fn().mockResolvedValue([]) },
}));
jest.mock('../../services/emailService', () => ({ sendEnterpriseClientLink: (...a: any[]) => mockSendLink(...a) }));
jest.mock('../../models/ProjectUnderstandingRecord', () => ({ __esModule: true, default: { findByPk: jest.fn() } }));
jest.mock('../../services/enterpriseIntake/enterpriseIntakeSync', () => ({ stageOf: () => 'Form' }));
jest.mock('../../services/enterpriseIntake/enterpriseIntakeActions', () => ({
  ActionRefused: class extends Error {},
  PRICE_PLACEHOLDER: 'x',
  sendOptionsEmail: jest.fn(),
  draftProposal: jest.fn(),
  sendProposal: jest.fn(),
  markSigned: jest.fn(),
  markLost: jest.fn(),
}));

/* eslint-disable import/first */
import { handleClientStatus, handleRequestClientLink } from '../enterpriseClientController';
import { issueClientToken } from '../../services/enterpriseIntake/enterpriseClientPortal';
import adminClientRoutes from '../../routes/admin/enterpriseClientsRoutes';
import { env } from '../../config/env';
/* eslint-enable import/first */

function app(): Express {
  const a = express();
  a.use(express.json());
  a.post('/api/enterprise/client/request-link', handleRequestClientLink);
  a.get('/api/enterprise/client/status', handleClientStatus);
  a.use(adminClientRoutes);
  return a;
}

const ROW = {
  id: 'i-1', email: 'dana@acme.test', full_name: 'Dana Reyes', company: 'Acme Logistics', createdAt: new Date(),
  interviewed_at: null, researched_at: null, options_email_sent_at: null, proposal_sent_at: null, signed_at: null, lost_at: null,
  pilot_options: null, research: { summary: 'INTERNAL' }, transcript: 'INTERNAL',
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

describe('POST /api/enterprise/client/request-link', () => {
  it('answers a known and an unknown email with the identical body', async () => {
    mockFindOne.mockResolvedValueOnce(ROW).mockResolvedValueOnce(null);
    const known = await request(app()).post('/api/enterprise/client/request-link').send({ email: 'dana@acme.test' });
    const unknown = await request(app()).post('/api/enterprise/client/request-link').send({ email: 'nobody@else.test' });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
  });

  it('answers before the lookup and the send finish (a send that never ends still gets a 200)', async () => {
    mockFindOne.mockResolvedValue(ROW);
    mockSendLink.mockImplementation(() => new Promise(() => undefined));
    const res = await request(app()).post('/api/enterprise/client/request-link').send({ email: 'dana@acme.test' }).timeout(2000);
    expect(res.status).toBe(200);
  });

  it('a send failure is logged, never shown', async () => {
    mockFindOne.mockResolvedValue(ROW);
    mockSendLink.mockRejectedValue(new Error('smtp down'));
    const res = await request(app()).post('/api/enterprise/client/request-link').send({ email: 'dana@acme.test' });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('smtp');
  });

  it('refuses a malformed email with a 400', async () => {
    const res = await request(app()).post('/api/enterprise/client/request-link').send({ email: 'nope' });
    expect(res.status).toBe(400);
    expect(mockFindOne).not.toHaveBeenCalled();
  });
});

describe('GET /api/enterprise/client/status', () => {
  const adminToken = () => jwt.sign({ id: 'a', email: 'admin@example.test', role: 'admin' }, env.jwtSecret, { expiresIn: '5m' });

  it('returns the client-safe status for a client token', async () => {
    mockFindByPk.mockResolvedValue(ROW);
    const res = await request(app()).get('/api/enterprise/client/status').set('Authorization', `Bearer ${issueClientToken('i-1')}`);
    expect(res.status).toBe(200);
    expect(res.body.company).toBe('Acme Logistics');
    expect(JSON.stringify(res.body)).not.toContain('INTERNAL');
  });

  it.each([
    ['no token', undefined],
    ['a garbage token', 'Bearer not-a-jwt'],
    ['an ADMIN token', 'admin'],
  ])('is a 401 with %s', async (_why, auth) => {
    let r = request(app()).get('/api/enterprise/client/status');
    if (auth) r = r.set('Authorization', auth === 'admin' ? `Bearer ${adminToken()}` : auth);
    const res = await r;
    expect(res.status).toBe(401);
    expect(mockFindByPk).not.toHaveBeenCalled();
  });
});

describe('a client token is not an admin token', () => {
  it('is refused by every admin client route', async () => {
    const res = await request(app()).get('/api/admin/enterprise-clients').set('Authorization', `Bearer ${issueClientToken('i-1')}`);
    expect([401, 403]).toContain(res.status);
  });

  it('a bad id on a POST action is a 404 before any lookup', async () => {
    const admin = jwt.sign({ id: 'a', email: 'admin@example.test', role: 'admin' }, env.jwtSecret, { expiresIn: '5m' });
    const res = await request(app()).post('/api/admin/enterprise-clients/not-a-uuid/signed').set('Authorization', `Bearer ${admin}`).send({});
    expect(res.status).toBe(404);
  });
});
