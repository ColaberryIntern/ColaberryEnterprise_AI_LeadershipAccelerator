/**
 * OH1i (T3): the Maya brain review desk. Who may call it (401 without a token, 403 for a
 * scoped role on a write), what it accepts (Zod: 400 on a bad body), and a refused approval
 * comes back as 422 with the reasons. The service is mocked; its gating is tested in
 * services/mayaBrain/__tests__/mayaBrainItems.test.ts.
 */
import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

const mockList = jest.fn();
const mockCreate = jest.fn();
const mockApprove = jest.fn();
const mockRetire = jest.fn();
const mockMark = jest.fn();
jest.mock('../../../services/mayaBrain/mayaBrainItems', () => {
  class BrainItemError extends Error {
    constructor(public code: string, message: string, public problems: string[] = []) { super(message); }
  }
  return {
    listItems: (...a: unknown[]) => mockList(...a),
    createDraft: (...a: unknown[]) => mockCreate(...a),
    approveItem: (...a: unknown[]) => mockApprove(...a),
    retireItem: (...a: unknown[]) => mockRetire(...a),
    markTestBuild: (...a: unknown[]) => mockMark(...a),
    BrainItemError,
  };
});
jest.mock('../../../config/database', () => ({ sequelize: { fake: true } }));

import mayaBrainRoutes from '../mayaBrainRoutes';
import { BrainItemError } from '../../../services/mayaBrain/mayaBrainItems';
import { env } from '../../../config/env';

const ID = '11111111-2222-4333-8444-555555555555';
const BASE = '/api/admin/maya-brain/items';

function token(mgmtRole: string | null = null): string {
  const payload: Record<string, unknown> = { sub: 'a1', email: 'admin@example.test', role: 'admin' };
  if (mgmtRole) payload.mgmt_role = mgmtRole;
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '5m' });
}

function app(): Express {
  const a = express();
  a.use(express.json());
  a.use(mayaBrainRoutes);
  return a;
}

beforeEach(() => jest.clearAllMocks());

describe('auth', () => {
  it('401s every route without a token', async () => {
    expect((await request(app()).get(BASE)).status).toBe(401);
    expect((await request(app()).post(`${BASE}/${ID}/approve`).send({})).status).toBe(401);
    expect(mockList).not.toHaveBeenCalled();
    expect(mockApprove).not.toHaveBeenCalled();
  });
  it('a scoped management role may read but not approve', async () => {
    mockList.mockResolvedValue([]);
    expect((await request(app()).get(BASE).set('Authorization', `Bearer ${token('support')}`)).status).toBe(200);
    const r = await request(app()).post(`${BASE}/${ID}/approve`).set('Authorization', `Bearer ${token('support')}`).send({});
    expect(r.status).toBe(403);
    expect(mockApprove).not.toHaveBeenCalled();
  });
  it('every registered route has a guard before its handler', () => {
    const stack = (mayaBrainRoutes as any).stack as any[];
    const routes = stack.filter((l) => l.route);
    expect(routes.length).toBe(5);
    const writes = routes.filter((l) => l.route.methods.post);
    for (const w of writes) expect(w.route.stack.length).toBeGreaterThanOrEqual(2);
  });
});

describe('validation', () => {
  const auth = () => ({ Authorization: `Bearer ${token()}` });
  it('lists with a valid filter and 400s a bad one', async () => {
    mockList.mockResolvedValue([{ id: ID }]);
    const ok = await request(app()).get(`${BASE}?kind=build_prompt&status=draft`).set(auth());
    expect(ok.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith({ kind: 'build_prompt', status: 'draft' });
    expect((await request(app()).get(`${BASE}?kind=gossip`).set(auth())).status).toBe(400);
  });
  it('creates only AI-fact drafts, with a strict body', async () => {
    mockCreate.mockResolvedValue({ id: ID, status: 'draft' });
    const ok = await request(app()).post(BASE).set(auth()).send({ kind: 'ai_fact', title: 'Pilots stall', body: 'Most pilots stall before production.', source_label: 'CLM-021' });
    expect(ok.status).toBe(201);
    const prompt = await request(app()).post(BASE).set(auth()).send({ kind: 'build_prompt', title: 'x'.repeat(5), body: 'y'.repeat(20) });
    expect(prompt.status).toBe(400);
    const extra = await request(app()).post(BASE).set(auth()).send({ kind: 'ai_fact', title: 'Pilots stall', body: 'Most pilots stall.', status: 'approved' });
    expect(extra.status).toBe(400);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
  it('400s a non-uuid id and a test-build without a result', async () => {
    expect((await request(app()).post(`${BASE}/not-a-uuid/retire`).set(auth())).status).toBe(400);
    expect((await request(app()).post(`${BASE}/${ID}/test-build`).set(auth()).send({ notes: 'ran it and it built' })).status).toBe(400);
    expect(mockRetire).not.toHaveBeenCalled();
    expect(mockMark).not.toHaveBeenCalled();
  });
  it('approves, passing who approved', async () => {
    mockApprove.mockResolvedValue({ id: ID, status: 'approved' });
    const r = await request(app()).post(`${BASE}/${ID}/approve`).set(auth()).send({ source_label: 'CLM-021' });
    expect(r.status).toBe(200);
    expect(mockApprove).toHaveBeenCalledWith(ID, 'admin@example.test', { expiresAt: null, sourceLabel: 'CLM-021' });
  });
  it('a refused approval is 422 with the reasons; an unknown id is 404', async () => {
    mockApprove.mockRejectedValueOnce(new BrainItemError('not_allowed', 'item cannot be approved', ['a build prompt must pass its test-build before it is approved']));
    const r = await request(app()).post(`${BASE}/${ID}/approve`).set(auth()).send({});
    expect(r.status).toBe(422);
    expect(r.body.problems[0]).toMatch(/test-build/);
    mockApprove.mockRejectedValueOnce(new BrainItemError('not_found', 'item not found'));
    expect((await request(app()).post(`${BASE}/${ID}/approve`).set(auth()).send({})).status).toBe(404);
  });
  it('records a test-build', async () => {
    mockMark.mockResolvedValue({ id: ID, test_build_status: 'passed' });
    const r = await request(app()).post(`${BASE}/${ID}/test-build`).set(auth()).send({ result: 'passed', notes: 'Claude Code built it; npm test green' });
    expect(r.status).toBe(200);
    expect(mockMark).toHaveBeenCalledWith(ID, 'passed', 'Claude Code built it; npm test green', 'admin@example.test');
  });
});
