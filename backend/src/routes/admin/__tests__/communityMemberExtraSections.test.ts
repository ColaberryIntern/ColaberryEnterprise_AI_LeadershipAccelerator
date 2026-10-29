/**
 * C82 (Campus HQ H4, option A): PATCH /api/admin/community/members/:id/mgmt-extra-sections, end to end through the real
 * router and auth middleware, plus the section gate letting an extra section through. Models are mocked; tokens are real.
 */
jest.mock('../../../config/database', () => ({ sequelize: { fake: true } }));
const mockMember: Record<string, unknown> & { update: jest.Mock } = { id: 'm1', role: 'staff', mgmt_role: 'marketing', mgmt_extra_sections: [], update: jest.fn() };
jest.mock('../../../models/CommunityMember', () => ({ __esModule: true, default: { findByPk: jest.fn(async () => mockMember) } }));

import express, { type Express, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import communityMemberRoutes from '../communityMemberRoutes';
import { mgmtSectionGate } from '../../../middlewares/mgmtSectionGate';
import { env } from '../../../config/env';
import { ALL_SECTIONS, sectionsForRole } from '../../../services/access/mgmtRoles';

const URL = '/api/admin/community/members/m1/mgmt-extra-sections';
const token = (claims: Record<string, unknown>) => jwt.sign({ sub: 'caller', email: 'c@example.test', ...claims }, env.jwtSecret, { expiresIn: '5m' });
const OWNER = token({ role: 'super_admin', mgmt_role: 'owner' });
const app = (): Express => { const a = express(); a.use(express.json()); a.use(communityMemberRoutes); return a; };
const patch = (t: string, body: unknown) => request(app()).patch(URL).set('Authorization', `Bearer ${t}`).send(body as object);

beforeEach(() => {
  Object.assign(mockMember, { role: 'staff', mgmt_role: 'marketing', mgmt_extra_sections: [] });
  mockMember.update = jest.fn(async (v: Record<string, unknown>) => { Object.assign(mockMember, v); });
});

describe('PATCH mgmt-extra-sections', () => {
  it('an owner grants Sarbjit AI Internship on top of Marketing; keys the role already gives are dropped', async () => {
    const res = await patch(OWNER, { sections: ['internship', 'campaigns', 'internship'] });
    expect(res.status).toBe(200);
    expect(res.body.member).toEqual({ id: 'm1', mgmt_role: 'marketing', mgmt_extra_sections: ['internship'] });
    expect(mockMember.update).toHaveBeenCalledWith({ mgmt_extra_sections: ['internship'] });
  });
  it('a revoke (empty list) stores nothing extra', async () => {
    mockMember.mgmt_extra_sections = ['internship'];
    const res = await patch(OWNER, { sections: [] });
    expect(res.status).toBe(200);
    expect(mockMember.update).toHaveBeenCalledWith({ mgmt_extra_sections: [] });
  });
  it('no escalation: a curriculum holder cannot grant a section it does not hold, nor edit someone with more', async () => {
    const curriculum = token({ role: 'admin', mgmt_role: 'curriculum' });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const res = await patch(curriculum, { sections: ['inbox_content'] });
    expect(res.status).toBe(403);
    expect(mockMember.update).not.toHaveBeenCalled();
    expect(JSON.parse(String(warn.mock.calls[0][0]))).toMatchObject({ event: 'mgmt_extra_sections_grant_denied', error_class: 'AuthorizationError' });
    warn.mockRestore();
  });
  it('a caller can pass on a section they hold only through their own extras', async () => {
    mockMember.mgmt_role = 'mentor';
    // the caller holds everything the mentor role gives (so editing a mentor is not reaching above) plus internship, as extras
    const t = token({ role: 'admin', mgmt_role: 'marketing', mgmt_extra_sections: [...sectionsForRole('mentor'), 'internship'] });
    const res = await patch(t, { sections: ['internship'] });
    expect(res.status).toBe(200);
    expect(mockMember.update).toHaveBeenCalledWith({ mgmt_extra_sections: ['internship'] });
  });
  it('validation: unknown keys and malformed bodies are 400; a member without a role or not staff is 400', async () => {
    expect((await patch(OWNER, { sections: ['wizardry'] })).status).toBe(400);
    expect((await patch(OWNER, { sections: 'internship' })).status).toBe(400);
    expect((await patch(OWNER, { sections: ['internship'], extra: 1 })).status).toBe(400);
    mockMember.mgmt_role = null;
    expect((await patch(OWNER, { sections: ['internship'] })).status).toBe(400);
    Object.assign(mockMember, { mgmt_role: 'marketing', role: 'student' });
    expect((await patch(OWNER, { sections: ['internship'] })).status).toBe(400);
    expect(mockMember.update).not.toHaveBeenCalled();
  });
  it('no token is 401', async () => {
    expect((await request(app()).patch(URL).send({ sections: [] })).status).toBe(401);
  });
  it('clearing the role clears the extras too', async () => {
    mockMember.mgmt_extra_sections = ['internship'];
    const res = await request(app()).patch('/api/admin/community/members/m1/mgmt-role').set('Authorization', `Bearer ${OWNER}`).send({ mgmt_role: null });
    expect(res.status).toBe(200);
    expect(mockMember.update).toHaveBeenCalledWith({ mgmt_role: null, mgmt_extra_sections: [] });
  });
});

describe('the section gate lets an extra section through, and only that one', () => {
  const gated = (t: string, path: string) => {
    const a = express();
    a.use(mgmtSectionGate);
    a.get(path, (_req: Request, res: Response) => { res.json({ ok: true }); });
    return request(a).get(path).set('Authorization', `Bearer ${t}`);
  };
  it('marketing + internship reaches /api/admin/internship; plain marketing does not', async () => {
    expect((await gated(token({ role: 'admin', mgmt_role: 'marketing', mgmt_extra_sections: ['internship'] }), '/api/admin/internship')).status).toBe(200);
    expect((await gated(token({ role: 'admin', mgmt_role: 'marketing' }), '/api/admin/internship')).status).toBe(403);
  });
  it('the extra does not open an unrelated section', async () => {
    expect((await gated(token({ role: 'admin', mgmt_role: 'marketing', mgmt_extra_sections: ['internship'] }), '/api/admin/revenue')).status).toBe(403);
    expect(ALL_SECTIONS).toContain('revenue');
  });
});
