import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import reeseBehaviourSwitchRoutes from '../../routes/admin/reeseBehaviourSwitchRoutes';

const mockAgentFindByPk = jest.fn();
jest.mock('../../models/AiAgent', () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => mockAgentFindByPk(...a) },
}));

const mockSetSwitch = jest.fn();
jest.mock('../../services/reese/reeseBehaviourSwitchService', () => {
  const actual = jest.requireActual('../../services/reese/reeseBehaviourSwitchService');
  return { ...actual, setReeseBehaviourSwitch: (...a: any[]) => mockSetSwitch(...a) };
});

const mockOrgMemberFindOne = jest.fn();
jest.mock('../../models/OrgMember', () => ({
  __esModule: true,
  default: { findOne: (...a: any[]) => mockOrgMemberFindOne(...a) },
}));

const mockIsAgentInHumanDownstream = jest.fn();
jest.mock('../../services/workforce/orgChartHierarchyService', () => ({
  isAgentInHumanDownstream: (...a: any[]) => mockIsAgentInHumanDownstream(...a),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(reeseBehaviourSwitchRoutes);
  return app;
}

function superAdminToken() {
  return jwt.sign({ sub: 'admin-1', email: 'ali@colaberry.com', role: 'super_admin' }, env.jwtSecret);
}
function managerToken(email = 'manager@colaberry.com') {
  return jwt.sign({ sub: 'admin-2', email, role: 'admin' }, env.jwtSecret);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAgentFindByPk.mockResolvedValue({ id: 'reese-id', agent_name: 'Reese' });
});

describe('PATCH /api/admin/agents/:id/behaviours/:key', () => {
  it('happy path: a super_admin can flip a switch', async () => {
    mockSetSwitch.mockResolvedValue({ key: 'welcome_dms', enabled: false, alsoChanged: ['welcome_dms'] });

    const res = await request(buildApp())
      .patch('/api/admin/agents/reese-id/behaviours/welcome_dms')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ enabled: false });

    expect(res.status).toBe(200);
    expect(mockSetSwitch).toHaveBeenCalledWith('welcome_dms', false);
    expect(res.body).toEqual({ key: 'welcome_dms', enabled: false, alsoChanged: ['welcome_dms'] });
  });

  it('happy path: Reese\'s real manager (in her reporting chain) can flip a switch', async () => {
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(true);
    mockSetSwitch.mockResolvedValue({ key: 'presence_heartbeat', enabled: true, alsoChanged: ['presence_heartbeat'] });

    const res = await request(buildApp())
      .patch('/api/admin/agents/reese-id/behaviours/presence_heartbeat')
      .set('Authorization', `Bearer ${managerToken()}`)
      .send({ enabled: true });

    expect(res.status).toBe(200);
  });

  it('BREAK: an admin outside Reese\'s reporting chain is 403d, never reaches the service', async () => {
    mockOrgMemberFindOne.mockResolvedValue({ id: 'org-member-1' });
    mockIsAgentInHumanDownstream.mockResolvedValue(false);

    const res = await request(buildApp())
      .patch('/api/admin/agents/reese-id/behaviours/welcome_dms')
      .set('Authorization', `Bearer ${managerToken()}`)
      .send({ enabled: true });

    expect(res.status).toBe(403);
    expect(mockSetSwitch).not.toHaveBeenCalled();
  });

  it('BREAK: an invalid key 400s before the service is called', async () => {
    const res = await request(buildApp())
      .patch('/api/admin/agents/reese-id/behaviours/not_a_real_key')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ enabled: true });

    expect(res.status).toBe(400);
    expect(mockSetSwitch).not.toHaveBeenCalled();
  });

  it('BREAK: a non-boolean enabled value 400s', async () => {
    const res = await request(buildApp())
      .patch('/api/admin/agents/reese-id/behaviours/welcome_dms')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ enabled: 'yes' });

    expect(res.status).toBe(400);
    expect(mockSetSwitch).not.toHaveBeenCalled();
  });

  it('BREAK: this route 404s for any agent other than Reese, never reaches the service', async () => {
    mockAgentFindByPk.mockResolvedValue({ id: 'dara-id', agent_name: 'Dara' });

    const res = await request(buildApp())
      .patch('/api/admin/agents/dara-id/behaviours/welcome_dms')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ enabled: true });

    expect(res.status).toBe(404);
    expect(mockSetSwitch).not.toHaveBeenCalled();
  });

  it('boundary: a nonexistent agent id 404s', async () => {
    mockAgentFindByPk.mockResolvedValue(null);

    const res = await request(buildApp())
      .patch('/api/admin/agents/does-not-exist/behaviours/welcome_dms')
      .set('Authorization', `Bearer ${superAdminToken()}`)
      .send({ enabled: true });

    expect(res.status).toBe(404);
  });

  it('auth: no token gets 401', async () => {
    const res = await request(buildApp())
      .patch('/api/admin/agents/reese-id/behaviours/welcome_dms')
      .send({ enabled: true });

    expect(res.status).toBe(401);
    expect(mockSetSwitch).not.toHaveBeenCalled();
  });
});
