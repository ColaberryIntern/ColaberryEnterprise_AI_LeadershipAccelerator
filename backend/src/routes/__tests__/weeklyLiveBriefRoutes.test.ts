jest.mock('../../services/weeklyLive/brief/briefService', () => ({ ...jest.requireActual('../../services/weeklyLive/brief/briefService'), startBrief: jest.fn(), briefView: jest.fn(), approveBrief: jest.fn() }));

import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { env } from '../../config/env';
import { MGMT_ROLES } from '../../services/access/mgmtRoles';
import { approveBrief, BriefError, briefView, startBrief } from '../../services/weeklyLive/brief/briefService';
import router from '../weeklyLivePlanRoutes';

/** WL4.4 brief routes: full administrators only, bodies validated, approver recorded, honest codes, checked answer. */
const PID = '5b8a95b7-1a88-42d5-b257-fd786d071f6e';
const app = express(); app.use(express.json()); app.use(router);
const bearer = (claims: Record<string, unknown> = {}) => `Bearer ${jwt.sign({ sub: 'u', email: 'a@example.com', role: 'admin', ...claims }, env.jwtSecret)}`;
const go = (m: 'get' | 'post', p: string, body: object = {}, auth: string | null = bearer()) => { let r = request(app)[m](p); if (auth) r = r.set('Authorization', auth); return m === 'post' ? r.send(body) : r; };
const view = (over: object = {}) => ({ status: 'ready', error: null, problems: [], html: '<html></html>', approved: false, sending: false, sendError: null, todoUrl: null, ...over });
const ROUTES: ['get' | 'post', string][] = [['get', `/api/admin/live/plans/${PID}/brief`], ['post', `/api/admin/live/plans/${PID}/brief`], ['post', `/api/admin/live/plans/${PID}/brief/approve`]];

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  (briefView as jest.Mock).mockResolvedValue(view());
  (startBrief as jest.Mock).mockResolvedValue(view({ status: 'writing', html: null }));
  (approveBrief as jest.Mock).mockResolvedValue(view({ approved: true, todoUrl: 'https://3.basecamp.com/x/todos/1' }));
});

it.each(ROUTES)('%s %s: 401 without a login, 403 for every scoped role', async (m, p) => {
  expect((await go(m, p, {}, null)).status).toBe(401);
  for (const mgmt_role of MGMT_ROLES.filter((r) => r !== 'owner' && r !== 'admin')) expect([mgmt_role, (await go(m, p, {}, bearer({ mgmt_role }))).status]).toEqual([mgmt_role, 403]);
  expect(startBrief).not.toHaveBeenCalled(); expect(approveBrief).not.toHaveBeenCalled();
});

it('writes with 202 and passes rewrite through', async () => {
  expect((await go('post', ROUTES[1][1], { rewrite: true })).status).toBe(202);
  expect(startBrief).toHaveBeenCalledWith(PID, true);
});

it('approve records who approved and answers with the to-do link', async () => {
  const r = await go('post', ROUTES[2][1]);
  expect([r.status, r.body.todoUrl]).toEqual([200, 'https://3.basecamp.com/x/todos/1']);
  expect(approveBrief).toHaveBeenCalledWith(PID, 'a@example.com');
});

it('refuses bad input before doing anything, and passes refusals through', async () => {
  expect((await go('post', ROUTES[2][1], { send: true })).status).toBe(400);
  expect((await go('post', ROUTES[1][1], { rewrite: 'yes' })).status).toBe(400);
  expect((await go('get', '/api/admin/live/plans/x/brief')).status).toBe(404);
  (approveBrief as jest.Mock).mockRejectedValue(new BriefError(409, 'The brief is being sent right now.', 'sending'));
  const r = await go('post', ROUTES[2][1]);
  expect([r.status, r.body.code]).toEqual([409, 'sending']);
});

it('a malformed answer fails outside production', async () => {
  (briefView as jest.Mock).mockResolvedValue(view({ status: 'sent' }));
  expect((await go('get', ROUTES[0][1])).status).toBe(500);
});
