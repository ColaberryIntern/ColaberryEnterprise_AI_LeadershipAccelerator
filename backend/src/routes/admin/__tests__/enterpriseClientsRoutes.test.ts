/**
 * W32: Admin, Enterprise clients. Every route is admin-only (asserted per route against the live
 * Express stack), the path is classified for the section gate, and an action's refusal reaches
 * the page as its own status and reason.
 */
import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const mockFindAll = jest.fn();
const mockFindByPk = jest.fn();
const mockSendOptions = jest.fn();
const mockDraft = jest.fn();
const mockSendProposal = jest.fn();
const mockSigned = jest.fn();
const mockLost = jest.fn();

jest.mock('../../../config/database', () => ({ sequelize: { fake: true } }));
jest.mock('../../../models/EnterpriseIntake', () => ({
  __esModule: true,
  default: { findAll: (...a: any[]) => mockFindAll(...a), findByPk: (...a: any[]) => mockFindByPk(...a) },
}));
jest.mock('../../../models/ProjectUnderstandingRecord', () => ({ __esModule: true, default: { findByPk: jest.fn().mockResolvedValue({ items: [{ dimension: 'systems', value: 'McLeod' }] }) } }));
jest.mock('../../../services/enterpriseIntake/enterpriseIntakeSync', () => ({ stageOf: () => 'Interviewed' }));
jest.mock('../../../services/enterpriseIntake/enterpriseIntakeActions', () => {
  class ActionRefused extends Error {
    constructor(message: string, readonly status = 409) {
      super(message);
    }
  }
  return {
    ActionRefused,
    PRICE_PLACEHOLDER: '[Ali to add the investment]',
    sendOptionsEmail: (...a: any[]) => mockSendOptions(...a),
    draftProposal: (...a: any[]) => mockDraft(...a),
    sendProposal: (...a: any[]) => mockSendProposal(...a),
    markSigned: (...a: any[]) => mockSigned(...a),
    markLost: (...a: any[]) => mockLost(...a),
  };
});

/* eslint-disable import/first */
import routes from '../enterpriseClientsRoutes';
import { env } from '../../../config/env';
import { ActionRefused } from '../../../services/enterpriseIntake/enterpriseIntakeActions';
/* eslint-enable import/first */

const ID = '11111111-2222-4333-8444-555555555555';
const BASE = '/api/admin/enterprise-clients';

const admin = () => `Bearer ${jwt.sign({ id: 'a', email: 'admin@example.test', role: 'admin' }, env.jwtSecret, { expiresIn: '5m' })}`;

function app(): Express {
  const a = express();
  a.use(express.json());
  a.use(routes);
  return a;
}

const ROW = {
  id: ID, company: 'Acme Logistics', full_name: 'Dana Reyes', role: 'COO', email: 'dana@acme.test', service: 'Build',
  start_timing: 'This quarter', people_count: 4, hours_per_week: '20.0', createdAt: new Date(), interviewed_at: new Date(),
  bc_todolist_id: '101', understanding_id: 'u-1', pilot_options: [{ title: 'Order intake agent' }], bc_project_id: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFindAll.mockResolvedValue([ROW]);
  mockFindByPk.mockResolvedValue(ROW);
});

describe('every route is admin-only', () => {
  const routesList: Array<[string, string]> = [
    ['get', BASE],
    ['get', `${BASE}/${ID}`],
    ['post', `${BASE}/${ID}/options-email`],
    ['post', `${BASE}/${ID}/proposal/draft`],
    ['post', `${BASE}/${ID}/proposal/send`],
    ['post', `${BASE}/${ID}/signed`],
    ['post', `${BASE}/${ID}/lost`],
  ];

  it('the router has exactly these routes, each behind requireAdmin', () => {
    const stack = (routes as any).stack.filter((l: any) => l.route);
    expect(stack.map((l: any) => `${Object.keys(l.route.methods)[0]} ${l.route.path}`).sort()).toEqual(
      routesList.map(([m, p]) => `${m} ${p.replace(ID, ':id')}`).sort(),
    );
    for (const l of stack) expect(l.route.stack.map((s: any) => s.name)).toContain('requireAdmin');
  });

  it.each(routesList)('%s %s refuses no token', async (method, path) => {
    const res = await (request(app()) as any)[method](path).send({});
    expect(res.status).toBe(401);
  });
});

describe('reads', () => {
  it('lists clients with their stage, figures and list link', async () => {
    const res = await request(app()).get(BASE).set('Authorization', admin());
    expect(res.status).toBe(200);
    expect(res.body.clients[0]).toMatchObject({ company: 'Acme Logistics', stage: 'Interviewed', hoursPerWeek: 20, hoursPerYear: 1040 });
  });

  it('one client carries the write-up and the actions\' inputs', async () => {
    const res = await request(app()).get(`${BASE}/${ID}`).set('Authorization', admin());
    expect(res.body.client.writeup).toEqual([{ dimension: 'systems', value: 'McLeod' }]);
    expect(res.body.client.pricePlaceholder).toBe('[Ali to add the investment]');
  });

  it('a bad id is a 404, not a database error', async () => {
    const res = await request(app()).get(`${BASE}/not-a-uuid`).set('Authorization', admin());
    expect(res.status).toBe(404);
    expect(mockFindByPk).not.toHaveBeenCalled();
  });
});

describe('actions', () => {
  it('sends the options email with the edited subject and body', async () => {
    mockSendOptions.mockResolvedValue({ sent: true, already: false });
    const res = await request(app()).post(`${BASE}/${ID}/options-email`).set('Authorization', admin()).send({ subject: 'Your options', body: 'Hi Dana' });
    expect(res.status).toBe(200);
    expect(mockSendOptions).toHaveBeenCalledWith(ID, 'Your options', 'Hi Dana');
  });

  it('a missing subject is a 400 and sends nothing', async () => {
    const res = await request(app()).post(`${BASE}/${ID}/proposal/send`).set('Authorization', admin()).send({ body: 'x' });
    expect(res.status).toBe(400);
    expect(mockSendProposal).not.toHaveBeenCalled();
  });

  it('a refusal reaches the page with its status and reason', async () => {
    mockSendProposal.mockRejectedValue(new ActionRefused('Not sent: the investment has not been added yet.', 422));
    const res = await request(app()).post(`${BASE}/${ID}/proposal/send`).set('Authorization', admin()).send({ subject: 'P', body: 'B' });
    expect(res.status).toBe(422);
    expect(res.body.error).toContain('investment');
  });

  it('marks lost with the reason', async () => {
    mockLost.mockResolvedValue(undefined);
    await request(app()).post(`${BASE}/${ID}/lost`).set('Authorization', admin()).send({ reason: 'Went with another vendor' });
    expect(mockLost).toHaveBeenCalledWith(ID, 'Went with another vendor');
  });
});
