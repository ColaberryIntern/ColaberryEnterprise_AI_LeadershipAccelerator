jest.mock('../../services/weeklyLive/deck/deckService', () => ({ ...jest.requireActual('../../services/weeklyLive/deck/deckService'), startDeck: jest.fn(), deckStatus: jest.fn() }));

import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { env } from '../../config/env';
import { MGMT_ROLES } from '../../services/access/mgmtRoles';
import { DeckError, deckStatus, startDeck } from '../../services/weeklyLive/deck/deckService';
import router from '../weeklyLivePlanRoutes';

/** WL4.2 deck routes: full administrators only, body validated, 202 while writing, 200 when built, honest 409s, checked answer. */
const PID = '5b8a95b7-1a88-42d5-b257-fd786d071f6e'; const SID = '8b8a95b7-1a88-42d5-b257-fd786d071f6e';
const app = express(); app.use(express.json()); app.use(router);
const bearer = (claims: Record<string, unknown> = {}) => `Bearer ${jwt.sign({ sub: 'u', email: 'a@example.com', role: 'admin', ...claims }, env.jwtSecret)}`;
const go = (m: 'get' | 'post', p: string, body: object = {}, auth: string | null = bearer()) => { let r = request(app)[m](p); if (auth) r = r.set('Authorization', auth); return m === 'post' ? r.send(body) : r; };
const URL = `/api/admin/live/plans/${PID}/deck`;
const status = (over: object = {}) => ({ status: 'writing', error: null, problems: [], saved: false, slides: 0, sessionId: SID, ...over });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  (startDeck as jest.Mock).mockResolvedValue(status());
  (deckStatus as jest.Mock).mockResolvedValue(status({ status: 'ready', saved: true, slides: 15 }));
});

it.each(['get', 'post'] as const)('%s: 401 without a login, 403 for every scoped role', async (m) => {
  expect((await go(m, URL, {}, null)).status).toBe(401);
  for (const mgmt_role of MGMT_ROLES.filter((r) => r !== 'owner' && r !== 'admin')) expect([mgmt_role, (await go(m, URL, {}, bearer({ mgmt_role }))).status]).toEqual([mgmt_role, 403]);
  expect((await go(m, URL, {}, bearer({ role: 'sales' }))).status).toBe(403);
  expect(startDeck).not.toHaveBeenCalled();
});

it('starts writing with 202, builds with 200, and passes rewrite through', async () => {
  expect((await go('post', URL)).status).toBe(202);
  expect(startDeck).toHaveBeenLastCalledWith(PID, false);
  (startDeck as jest.Mock).mockResolvedValue(status({ status: 'ready', saved: true, slides: 15 }));
  const r = await go('post', URL, { rewrite: true });
  expect([r.status, r.body.saved]).toEqual([200, true]);
  expect(startDeck).toHaveBeenLastCalledWith(PID, true);
});

it('refuses a bad id or body before doing anything', async () => {
  expect((await go('post', '/api/admin/live/plans/nope/deck')).status).toBe(404);
  expect((await go('post', URL, { rewrite: 'yes' })).status).toBe(400);
  expect((await go('post', URL, { extra: 1 })).status).toBe(400);
  expect(startDeck).not.toHaveBeenCalled();
});

it('passes the service\'s refusals through with their codes', async () => {
  (startDeck as jest.Mock).mockRejectedValue(new DeckError(409, 'This class was planned outside Studio.', 'adopted_session'));
  const r = await go('post', URL);
  expect([r.status, r.body.code]).toEqual([409, 'adopted_session']);
});

it('reports status, and a malformed answer fails outside production', async () => {
  expect((await go('get', URL)).body).toMatchObject({ status: 'ready', slides: 15 });
  (deckStatus as jest.Mock).mockResolvedValue(status({ status: 'lost' }));
  expect((await go('get', URL)).status).toBe(500);
});
