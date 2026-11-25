import express from 'express';
import request from 'supertest';

// The real guards are requireAdmin / requireFullAdmin (route-auth lint). Headers stand in for JWTs:
// x-test-admin = any admin (incl. a scoped staff role), x-test-full = a full admin (owner / legacy admin).
jest.mock('../../../middlewares/authMiddleware', () => ({
  requireAdmin: (req: { headers: Record<string, string>; admin?: unknown }, res: { status: (n: number) => { json: (b: unknown) => void } }, next: () => void) => {
    if (!req.headers['x-test-admin']) { res.status(401).json({ error: 'Unauthorized' }); return; }
    req.admin = { sub: req.headers['x-test-admin'], role: 'admin' };
    next();
  },
  requireFullAdmin: (req: { headers: Record<string, string> }, res: { status: (n: number) => { json: (b: unknown) => void } }, next: () => void) => {
    if (req.headers['x-test-full'] !== 'yes') { res.status(403).json({ error: 'Forbidden' }); return; }
    next();
  },
}));

import { buildVoiceStudioConsoleRouter, type ConsoleDeps } from '../voiceStudioConsoleRoutes';

const PID = '11111111-1111-4111-8111-111111111111';
const VID = '22222222-2222-4222-8222-222222222222';
const content = {
  prompt: '{prompt}', first_message: null, disclosure: "This is Colaberry's AI assistant. I'm an AI, not a person.",
  kb_refs: ['admissions_knowledge'], tool_permissions: ['admissions_knowledge', 'next_open_strategy_slots'], engine: 'conversation_relay',
  engine_config: { promptShell: true }, voice_id: null, language: 'en-US', safety_policy: { bookingRequiresHumanApproval: true, maxToolCallsPerCall: 6 }, max_call_seconds: 180,
};

function make(over: Partial<ConsoleDeps> = {}, enabled = true) {
  const deps: ConsoleDeps = {
    enabled: () => enabled,
    config: () => ({ VOICE_STUDIO_ENABLED: false, VOICE_TEST_ENABLED: false, VOICE_GATEWAY_LEGACY_ENABLED: false, VOICE_ENGINE_DEFAULT: 'synthflow_legacy' }) as never,
    queries: {
      loadOverviewRows: jest.fn().mockResolvedValue({ calls: [], agentLatenciesMs: [], usage: [], activeReservations: 0, routes: [] }),
      listAgentCards: jest.fn().mockResolvedValue([]),
      listVersions: jest.fn().mockResolvedValue([]),
      getProfile: jest.fn().mockResolvedValue({ id: PID, agent_key: 'edu-cory-outbound', brand_slug: 'colaberry' }),
    },
    store: {
      createDraftVersion: jest.fn().mockResolvedValue({ version: { id: VID, version: 1 }, created: true }),
      changeVersionStatus: jest.fn().mockResolvedValue({ id: VID, status: 'published' }),
    },
    ...over,
  };
  const a = express();
  a.use(express.json());
  a.use(buildVoiceStudioConsoleRouter(() => deps));
  a.use((_req, res) => res.status(404).json({ error: 'fell through' }));
  return { a, deps };
}

describe('Voice Studio console API (VS3.3)', () => {
  it('does not exist while VOICE_STUDIO_UI_ENABLED is off', async () => {
    const { a } = make({}, false);
    for (const [m, p] of [['get', '/api/admin/voice-studio/overview'], ['get', '/api/admin/voice-studio/agents'], ['post', `/api/admin/voice-studio/versions/${VID}/publish`]] as const) {
      const res = await request(a)[m](p).set('x-test-admin', 'a1').set('x-test-full', 'yes');
      expect(res.body).toEqual({ error: 'fell through' });
    }
  });

  it('every route needs an admin (401 without)', async () => {
    const { a, deps } = make();
    expect((await request(a).get('/api/admin/voice-studio/overview')).status).toBe(401);
    expect((await request(a).get('/api/admin/voice-studio/agents')).status).toBe(401);
    expect((await request(a).post(`/api/admin/voice-studio/agents/${PID}/versions`).send({ content })).status).toBe(401);
    expect((await request(a).post(`/api/admin/voice-studio/versions/${VID}/publish`)).status).toBe(401);
    expect(deps.store.createDraftVersion).not.toHaveBeenCalled();
  });

  it('publish/approve/retire without the approval role returns 403 and changes nothing', async () => {
    const { a, deps } = make();
    for (const action of ['approve', 'publish', 'retire']) {
      const res = await request(a).post(`/api/admin/voice-studio/versions/${VID}/${action}`).set('x-test-admin', 'mentor-1');
      expect(res.status).toBe(403);
    }
    expect(deps.store.changeVersionStatus).not.toHaveBeenCalled();
  });

  it('a full admin publishes; the actor is the admin id; lifecycle refusals are 409', async () => {
    const { a, deps } = make();
    const ok = await request(a).post(`/api/admin/voice-studio/versions/${VID}/publish`).set('x-test-admin', 'ali-1').set('x-test-full', 'yes');
    expect(ok.status).toBe(200);
    expect(deps.store.changeVersionStatus).toHaveBeenCalledWith(VID, 'publish', 'ali-1');
    (deps.store.changeVersionStatus as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('approve refused: four_eyes_required'), { errorClass: 'LifecycleError' }));
    const no = await request(a).post(`/api/admin/voice-studio/versions/${VID}/approve`).set('x-test-admin', 'ali-1').set('x-test-full', 'yes');
    expect(no.status).toBe(409);
    expect(no.body.message).toMatch(/four_eyes_required/);
  });

  it('rejects malformed ids, actions, queries and bodies with 400', async () => {
    const { a, deps } = make();
    const h = { 'x-test-admin': 'a1', 'x-test-full': 'yes' };
    expect((await request(a).post('/api/admin/voice-studio/versions/not-a-uuid/publish').set(h)).status).toBe(400);
    expect((await request(a).post(`/api/admin/voice-studio/versions/${VID}/delete`).set(h)).status).toBe(400);
    expect((await request(a).get('/api/admin/voice-studio/overview?days=365').set(h)).status).toBe(400);
    expect((await request(a).get('/api/admin/voice-studio/overview?mode=prod').set(h)).status).toBe(400);
    expect((await request(a).post(`/api/admin/voice-studio/agents/${PID}/versions`).set(h).send({ content, extra: 1 })).status).toBe(400);
    expect(deps.store.changeVersionStatus).not.toHaveBeenCalled();
  });

  it('overview returns KPIs with null (no data) when there are no calls, plus the safety flags', async () => {
    const { a, deps } = make();
    const res = await request(a).get('/api/admin/voice-studio/overview?days=30&mode=test').set('x-test-admin', 'a1');
    expect(res.status).toBe(200);
    expect(deps.queries.loadOverviewRows).toHaveBeenCalledWith('test', 30);
    expect(res.body.kpis.find((k: { key: string }) => k.key === 'attempted').value).toBeNull();
    expect(res.body.safety).toMatchObject({ studioEnabled: false, testEnabled: false });
  });

  it('saving a draft passes the admin id as author; same content again is 200 not 201', async () => {
    const { a, deps } = make();
    const r1 = await request(a).post(`/api/admin/voice-studio/agents/${PID}/versions`).set('x-test-admin', 'a1').send({ content });
    expect(r1.status).toBe(201);
    expect(deps.store.createDraftVersion).toHaveBeenCalledWith(PID, content, 'a1');
    (deps.store.createDraftVersion as jest.Mock).mockResolvedValueOnce({ version: { id: VID }, created: false });
    expect((await request(a).post(`/api/admin/voice-studio/agents/${PID}/versions`).set('x-test-admin', 'a1').send({ content })).status).toBe(200);
    (deps.store.createDraftVersion as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('disclosure: must tell'), { errorClass: 'ValidationError' }));
    expect((await request(a).post(`/api/admin/voice-studio/agents/${PID}/versions`).set('x-test-admin', 'a1').send({ content })).status).toBe(400);
  });

  it('validate writes nothing and previews the rendered call and effective tools', async () => {
    const { a, deps } = make();
    const res = await request(a).post(`/api/admin/voice-studio/agents/${PID}/validate`).set('x-test-admin', 'a1').send({ content, samplePrompt: 'Follow up about the class.' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ valid: true, preview: { ok: true }, tools: { allowed: ['admissions_knowledge', 'next_open_strategy_slots'] } });
    expect(res.body.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(deps.store.createDraftVersion).not.toHaveBeenCalled();
    const bad = await request(a).post(`/api/admin/voice-studio/agents/${PID}/validate`).set('x-test-admin', 'a1').send({ content: { ...content, disclosure: 'Hello there friend' } });
    expect(bad.body.valid).toBe(false);
  });

  it('an unexpected failure is a 500 with a stable error class and no message leak', async () => {
    const { a } = make({ queries: { ...make().deps.queries, listAgentCards: jest.fn().mockRejectedValue(Object.assign(new Error('pg password=x'), { name: 'ConnectionError' })) } });
    const res = await request(a).get('/api/admin/voice-studio/agents').set('x-test-admin', 'a1');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'ConnectionError' });
  });
});
