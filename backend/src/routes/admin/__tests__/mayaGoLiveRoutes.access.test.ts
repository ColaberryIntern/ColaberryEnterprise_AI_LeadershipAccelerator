import express, { type Express } from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';

/**
 * T13 - the go-live console's single read, and the one switch that turns Maya's agent row on.
 *
 * Two properties are worth more than the payload shape:
 *
 *   1. ENABLING IS ALI'S, DISABLING IS ANY ADMIN'S. The same asymmetry promote/revert has, for
 *      the same reason: silencing her must never wait on one person.
 *   2. THE SWITCH WRITES ONE COLUMN. `enabled`, and none of the other three columns that turn an
 *      observing agent into an acting one. Her tools come from the grant spine and her
 *      capabilities from the promotion record, each with its own approver.
 */

const mockFindOne = jest.fn();
const mockUpdate = jest.fn();
jest.mock('../../../models', () => ({
  AiAgent: {
    findOne: (...a: unknown[]) => mockFindOne(...a),
    update: (...a: unknown[]) => mockUpdate(...a),
  },
}));

const mockCount = jest.fn();
jest.mock('../../../models/MayaOutboundApproval', () => ({
  __esModule: true,
  default: { count: (...a: unknown[]) => mockCount(...a) },
}));

// `config/database` is deliberately NOT mocked. The route hands the real sequelize instance to
// `listAllChangeRequests`, which is mocked, so nothing here opens a connection - and mocking the
// module instead broke `requireActual` on the promotion service, whose settings model needs a real
// `define`. The assertion below reads the argument with `expect.anything()` for that reason.
const mockKillSwitch = jest.fn();
jest.mock('../../../services/launchSafety', () => ({
  isKillSwitchActiveStrict: () => mockKillSwitch(),
}));

const mockListRequests = jest.fn();
jest.mock('../../../services/agentDomain/agentChangeRequestService', () => ({
  listAllChangeRequests: (...a: unknown[]) => mockListRequests(...a),
}));

jest.mock('../../../services/agentDomain/registeredTools', () => ({
  registeredToolNames: () => ['retrieve_knowledge', 'send_document', 'send_email'],
}));

const mockModes = jest.fn();
const mockRecord = jest.fn();
jest.mock('../../../services/maya/mayaPromotion', () => {
  const actual = jest.requireActual('../../../services/maya/mayaPromotion');
  return {
    ...actual,
    resolveAllMayaModes: () => mockModes(),
    readPromotionRecord: () => mockRecord(),
  };
});

import routes from '../mayaGoLiveRoutes';
import { env } from '../../../config/env';
import { MAYA_TOOL_GOVERNANCE } from '../../../services/maya/mayaToolGovernance';

const token = (email: string, role: string) =>
  `Bearer ${jwt.sign({ sub: 'u1', email, role }, env.jwtSecret, { expiresIn: '5m' })}`;
const ALI = token('ali@colaberry.com', 'admin');
const OTHER_ADMIN = token('ops@colaberry.com', 'admin');
const SUPER = token('ops2@colaberry.com', 'super_admin');

function app(): Express {
  const a = express();
  a.use(express.json());
  a.use(routes);
  return a;
}

const AGENT = { id: 'agent-1', agent_name: 'Maya', enabled: false, status: 'idle', autonomy_level: 'communicate', tools_granted: ['retrieve_knowledge'] };

beforeEach(() => {
  mockFindOne.mockReset().mockResolvedValue({ ...AGENT });
  mockUpdate.mockReset().mockResolvedValue([1]);
  mockCount.mockReset().mockResolvedValue(3);
  mockKillSwitch.mockReset().mockResolvedValue(false);
  mockListRequests.mockReset().mockResolvedValue([
    { id: 'cr-1', title: 'retrieve_knowledge', status: 'submitted', requested_at: '2026-11-15', requested_by_identity: 'claude-code', tool_request: { tool_name: 'retrieve_knowledge', capability_id: 'admissions.maya_applicant_chat_response', needed_by: '2026-11-20' } },
    // Somebody else's open tool request, which must not appear on Maya's console.
    { id: 'cr-2', title: 'read_attachments', status: 'submitted', requested_at: '2026-11-15', requested_by_identity: 'claude-code', tool_request: { tool_name: 'read_attachments', capability_id: 'support.x', needed_by: '2026-11-20' } },
  ]);
  mockModes.mockReset().mockResolvedValue([
    { capability: 'sendDocument', mode: 'review', reason: 'default_review' },
    { capability: 'sendSmsSummary', mode: 'off', reason: 'capability_refused' },
  ]);
  mockRecord.mockReset().mockResolvedValue({ capabilities: { sendDocument: { state: 'review', by: 'ali@colaberry.com', at: '2026-11-15', note: 'n' } }, history: [] });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('GET /api/admin/maya/golive', () => {
  it('401 without a token', async () => {
    expect((await request(app()).get('/api/admin/maya/golive')).status).toBe(401);
  });

  it('answers the whole question in one read, for any admin', async () => {
    const res = await request(app()).get('/api/admin/maya/golive').set('Authorization', OTHER_ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.agent).toMatchObject({ agent_name: 'Maya', enabled: false, status: 'idle' });
    expect(res.body.kill_switch).toBe('clear');
    expect(res.body.outbound).toEqual({ pending: 3 });
    expect(res.body.capabilities).toHaveLength(2);
    // Every tool on both belts, so the console can show what is granted and what is not.
    expect(res.body.tools).toHaveLength(Object.keys(MAYA_TOOL_GOVERNANCE).length);
  });

  it('says which tools are registered and which are actually granted', async () => {
    const res = await request(app()).get('/api/admin/maya/golive').set('Authorization', ALI);
    const byTool = new Map(res.body.tools.map((t: { tool: string }) => [t.tool, t]));
    expect(byTool.get('retrieve_knowledge')).toMatchObject({ registered: true, granted: true });
    expect(byTool.get('send_document')).toMatchObject({ registered: true, granted: false });
    // Not in the mocked registry and not granted: the honest answer is two falses, not a guess.
    expect(byTool.get('schedule_strategy_call')).toMatchObject({ registered: false, granted: false });
  });

  it('carries the resolved mode, its reason, the stored state and the shipped default', async () => {
    const res = await request(app()).get('/api/admin/maya/golive').set('Authorization', ALI);
    const doc = res.body.capabilities.find((c: { capability: string }) => c.capability === 'sendDocument');
    expect(doc).toMatchObject({
      mode: 'review', reason: 'default_review', refused: false,
      default_state: 'review', stored_state: 'review',
    });
    expect(doc.tools).toContain('send_document');
  });

  it('marks a refused capability as refused, with no dial to show', async () => {
    const res = await request(app()).get('/api/admin/maya/golive').set('Authorization', ALI);
    const sms = res.body.capabilities.find((c: { capability: string }) => c.capability === 'sendSmsSummary');
    // A refused capability has no default and no stored state, because it has no dial. Reporting
    // one would read as "it is off and could be turned on".
    expect(sms).toMatchObject({ refused: true, mode: 'off', default_state: null, stored_state: null });
  });

  it('shows only HER open tool requests', async () => {
    const res = await request(app()).get('/api/admin/maya/golive').set('Authorization', ALI);
    expect(mockListRequests).toHaveBeenCalledWith(expect.anything(), 'submitted', 'tool');
    expect(res.body.grant_requests).toHaveLength(1);
    expect(res.body.grant_requests[0]).toMatchObject({ tool_name: 'retrieve_knowledge', status: 'submitted' });
  });

  it('reports an UNREADABLE kill switch as its own state, not as clear', async () => {
    // The mode resolver uses the strict reader, so an unreadable switch turns everything off. A
    // console that said "clear" here would claim she is on while she refuses everything.
    mockKillSwitch.mockRejectedValue(new Error('settings unreadable'));
    const res = await request(app()).get('/api/admin/maya/golive').set('Authorization', ALI);
    expect(res.status).toBe(200);
    expect(res.body.kill_switch).toBe('unreadable');
  });

  it('reports an ACTIVE kill switch', async () => {
    mockKillSwitch.mockResolvedValue(true);
    const res = await request(app()).get('/api/admin/maya/golive').set('Authorization', ALI);
    expect(res.body.kill_switch).toBe('active');
  });

  it('returns a null agent rather than a 404 when her row is missing', async () => {
    mockFindOne.mockResolvedValue(null);
    const res = await request(app()).get('/api/admin/maya/golive').set('Authorization', ALI);
    expect(res.status).toBe(200);
    expect(res.body.agent).toBeNull();
    expect(res.body.tools.every((t: { granted: boolean }) => t.granted === false)).toBe(true);
  });

  it('500 with a classification when a read throws', async () => {
    mockModes.mockRejectedValue(new Error('boom'));
    const res = await request(app()).get('/api/admin/maya/golive').set('Authorization', ALI);
    expect(res.status).toBe(500);
    expect(res.body.error_class).toBeTruthy();
  });
});

describe('POST /api/admin/maya/enable — turning her on', () => {
  it('401 without a token', async () => {
    expect((await request(app()).post('/api/admin/maya/enable').send({ enabled: true, review_note: 'go' })).status)
      .toBe(401);
  });

  it('403 when an admin who is not Ali tries to turn her ON, and nothing is written', async () => {
    const res = await request(app()).post('/api/admin/maya/enable')
      .set('Authorization', OTHER_ADMIN).send({ enabled: true, review_note: 'turning her on' });
    expect(res.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('200 when Ali turns her on', async () => {
    const res = await request(app()).post('/api/admin/maya/enable')
      .set('Authorization', ALI).send({ enabled: true, review_note: 'reviewed the console' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ agent_id: 'agent-1', enabled: true, changed: true });
  });

  it('200 when a super_admin turns her on', async () => {
    const res = await request(app()).post('/api/admin/maya/enable')
      .set('Authorization', SUPER).send({ enabled: true, review_note: 'reviewed the console' });
    expect(res.status).toBe(200);
  });

  it('writes ONLY the enabled column', async () => {
    await request(app()).post('/api/admin/maya/enable')
      .set('Authorization', ALI).send({ enabled: true, review_note: 'reviewed the console' });
    const [patch, options] = mockUpdate.mock.calls[0];
    expect(Object.keys(patch)).toEqual(['enabled']);
    expect(patch.enabled).toBe(true);
    expect(options).toEqual({ where: { id: 'agent-1' } });
  });

  it('ANY admin may turn her OFF', async () => {
    mockFindOne.mockResolvedValue({ ...AGENT, enabled: true });
    const res = await request(app()).post('/api/admin/maya/enable')
      .set('Authorization', OTHER_ADMIN).send({ enabled: false, review_note: 'something looks wrong' });
    expect(res.status).toBe(200);
    expect(mockUpdate.mock.calls[0][0]).toEqual({ enabled: false });
  });

  it('400 on a malformed body, without writing', async () => {
    for (const body of [{}, { enabled: 'yes', review_note: 'ok then' }, { enabled: true }, { enabled: true, review_note: 'no' }]) {
      const res = await request(app()).post('/api/admin/maya/enable').set('Authorization', ALI).send(body);
      expect(res.status).toBe(400);
    }
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('is idempotent: the same request twice writes once', async () => {
    mockFindOne.mockResolvedValue({ ...AGENT, enabled: true });
    const res = await request(app()).post('/api/admin/maya/enable')
      .set('Authorization', ALI).send({ enabled: true, review_note: 'already on' });
    expect(res.status).toBe(200);
    expect(res.body.changed).toBe(false);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('404 when her row is missing', async () => {
    mockFindOne.mockResolvedValue(null);
    const res = await request(app()).post('/api/admin/maya/enable')
      .set('Authorization', ALI).send({ enabled: true, review_note: 'reviewed the console' });
    expect(res.status).toBe(404);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('500 when the write throws', async () => {
    mockUpdate.mockRejectedValue(new Error('boom'));
    const res = await request(app()).post('/api/admin/maya/enable')
      .set('Authorization', ALI).send({ enabled: true, review_note: 'reviewed the console' });
    expect(res.status).toBe(500);
  });
});
