import express from 'express';
import request from 'supertest';
import { randomBytes } from 'crypto';

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

import { buildVoiceStudioLabRouter, type LabDeps } from '../voiceStudioLabRoutes';
import { PreviewLimiter, type AbTrial, type TrialStore } from '../../../services/voice/studio/voiceLab';

const VID = '11111111-1111-4111-8111-111111111111';
const RID = '22222222-2222-4222-8222-222222222222';
const NAMES = /alloy|ash|ballad|coral|echo|sage|shimmer|verse|marin|cedar/;

function memTrials(): TrialStore {
  const rows = new Map<string, AbTrial>();
  let n = 0;
  return {
    create: async (t) => { const id = `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`; rows.set(id, { ...t, id, preferred: null, scoredBy: null }); return id; },
    get: async (id) => rows.get(id) ?? null,
    score: async (id, preferred, by) => { const t = rows.get(id); if (!t || t.preferred !== null) return null; const s = { ...t, preferred, scoredBy: by }; rows.set(id, s); return s; },
  };
}

function make(over: Partial<LabDeps> = {}, enabled = true) {
  const key = randomBytes(32);
  const deps: LabDeps = {
    enabled: () => enabled, relayVoice: () => undefined,
    synth: jest.fn().mockResolvedValue(Buffer.from([1, 2, 3])),
    limiter: new PreviewLimiter(3, 100), trials: memTrials(),
    store: {
      listNumbers: jest.fn().mockResolvedValue([{ id: 'n1', provider: 'twilio', provider_number_id: 'PN1', number_ref: 'test-line', ownership: 'owned', status: 'active' }]),
      listRoutes: jest.fn().mockResolvedValue([]),
      getRoute: jest.fn().mockResolvedValue({ id: RID, mode: 'legacy', calls_7d: 5 }),
      versionFacts: jest.fn().mockResolvedValue({ versionPublished: true, profileId: 'p1', engine: 'conversation_relay', versionBrand: 'colaberry', versionEngine: 'conversation_relay' }),
      applyRouteChange: jest.fn().mockResolvedValue({ id: RID }),
    },
    tokenKey: () => key, now: () => 1_790_000_000_000, ...over,
  };
  const a = express();
  a.use(express.json());
  a.use(buildVoiceStudioLabRouter(() => deps));
  a.use((_req, res) => res.status(404).json({ error: 'fell through' }));
  return { a, deps };
}
const A = { 'x-test-admin': 'admin-1' };
const FULL = { 'x-test-admin': 'admin-1', 'x-test-full': 'yes' };
const change = { pathKey: 'interest', callType: 'interest', brandSlug: 'colaberry', mode: 'canary', canaryPercent: 10, versionId: VID, fallback: { kind: 'legacy', audience: ['lead:42'] } };

describe('Voice Lab / Numbers & Routing API (VS3.4)', () => {
  it('does not exist while the console flag is off; needs an admin', async () => {
    const off = make({}, false);
    expect((await request(off.a).get('/api/admin/voice-studio/lab/catalog').set(A)).body).toEqual({ error: 'fell through' });
    const on = make();
    expect((await request(on.a).get('/api/admin/voice-studio/lab/catalog')).status).toBe(401);
    expect((await request(on.a).get('/api/admin/voice-studio/numbers')).status).toBe(401);
  });

  it('numbers never include a phone number field', async () => {
    const { a } = make();
    const r = await request(a).get('/api/admin/voice-studio/numbers').set(A);
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).not.toMatch(/e164|\+1\d{10}/);
  });

  it('preview: audio, validated, and rate-limited per admin', async () => {
    const { a, deps } = make();
    const ok = await request(a).post('/api/admin/voice-studio/lab/preview').set(A).send({ voice: 'marin', text: 'Hello there' });
    expect(ok.status).toBe(200);
    expect(ok.headers['content-type']).toMatch(/audio\/mpeg/);
    expect((await request(a).post('/api/admin/voice-studio/lab/preview').set(A).send({ voice: 'nova', text: 'x' })).status).toBe(400);
    expect((await request(a).post('/api/admin/voice-studio/lab/preview').set(A).send({ voice: 'marin', text: 'x'.repeat(301) })).status).toBe(400);
    await request(a).post('/api/admin/voice-studio/lab/preview').set(A).send({ voice: 'marin', text: 'a' });
    await request(a).post('/api/admin/voice-studio/lab/preview').set(A).send({ voice: 'marin', text: 'b' });
    expect((await request(a).post('/api/admin/voice-studio/lab/preview').set(A).send({ voice: 'marin', text: 'c' })).status).toBe(429);
    expect(deps.synth).toHaveBeenCalledTimes(3);
  });

  it('every lab and routing route refuses an unauthenticated caller and spends nothing', async () => {
    const { a, deps } = make();
    const id = '00000000-0000-4000-8000-000000000001';
    for (const p of ['lab/catalog', 'numbers', 'routes', `lab/ab/${id}`, `lab/ab/${id}/clip/X`]) expect((await request(a).get(`/api/admin/voice-studio/${p}`)).status).toBe(401);
    for (const p of ['lab/preview', 'lab/ab', `lab/ab/${id}/score`, 'routes/validate', 'routes/apply']) expect((await request(a).post(`/api/admin/voice-studio/${p}`).send({ voice: 'marin', text: 'hi' })).status).toBe(401);
    expect(deps.synth).not.toHaveBeenCalled();
  });

  it('A/B clips count against the same rate limit as previews', async () => {
    const { a, deps } = make({ limiter: new PreviewLimiter(1, 100) });
    const c = await request(a).post('/api/admin/voice-studio/lab/ab').set(A).send({ voiceA: 'marin', voiceB: 'cedar', text: 'Hello' });
    const clip = (l: string) => request(a).get(`/api/admin/voice-studio/lab/ab/${c.body.trialId}/clip/${l}`).set(A);
    expect((await clip('X')).status).toBe(200);
    expect((await clip('Y')).status).toBe(429);
    expect(deps.synth).toHaveBeenCalledTimes(1);
  });

  it.each([['a typo', 'v3'], ['an array', ['x', 'y']], ['an object', { a: 1 }], ['a number', 7]])('malformed versionId (%s) is an issue, never a database call', async (_n, versionId) => {
    const { a, deps } = make();
    const v = await request(a).post('/api/admin/voice-studio/routes/validate').set(A).send({ routeId: RID, change: { ...change, versionId } });
    expect(v.status).toBe(200);
    expect(v.body.ok).toBe(false);
    expect(v.body.issues.join()).toContain('versionId');
    const ap = await request(a).post('/api/admin/voice-studio/routes/apply').set(FULL).send({ routeId: RID, change: { ...change, versionId } });
    expect(ap.status).toBe(400);
    expect(deps.store.versionFacts).not.toHaveBeenCalled();
    expect(deps.store.getRoute).not.toHaveBeenCalled();
  });

  it('blind A/B: no response names a voice until it is scored, then it reveals', async () => {
    const { a } = make();
    const c = await request(a).post('/api/admin/voice-studio/lab/ab').set(A).send({ voiceA: 'marin', voiceB: 'cedar', text: 'Hello' });
    expect(c.status).toBe(201);
    const id = c.body.trialId;
    const read = await request(a).get(`/api/admin/voice-studio/lab/ab/${id}`).set(A);
    const clip = await request(a).get(`/api/admin/voice-studio/lab/ab/${id}/clip/X`).set(A);
    for (const r of [c, read]) expect(JSON.stringify(r.body)).not.toMatch(NAMES);
    expect(JSON.stringify(clip.headers)).not.toMatch(NAMES);
    expect(clip.headers['content-type']).toMatch(/audio\/mpeg/);
    const s = await request(a).post(`/api/admin/voice-studio/lab/ab/${id}/score`).set(A).send({ preferred: 'X' });
    expect(s.body.reveal).toBeDefined();
    expect([s.body.reveal.X, s.body.reveal.Y].sort()).toEqual(['cedar', 'marin']);
    expect((await request(a).post(`/api/admin/voice-studio/lab/ab/${id}/score`).set(A).send({ preferred: 'Y' })).status).toBe(409);
  });

  it('a route change without validate is refused (409); validate then apply succeeds', async () => {
    const { a, deps } = make();
    const no = await request(a).post('/api/admin/voice-studio/routes/apply').set(FULL).send({ routeId: RID, change });
    expect(no.status).toBe(409);
    expect(no.body.error).toBe('validation_required');
    const v = await request(a).post('/api/admin/voice-studio/routes/validate').set(A).send({ routeId: RID, change });
    expect(v.body).toMatchObject({ ok: true, impact: { movesRealCallers: true, callsLast7Days: 5 } });
    const edited = await request(a).post('/api/admin/voice-studio/routes/apply').set(FULL).send({ routeId: RID, change: { ...change, canaryPercent: 20 }, validationToken: v.body.validationToken });
    expect(edited.body.error).toBe('validation_mismatch');
    expect(deps.store.applyRouteChange).not.toHaveBeenCalled();
    const yes = await request(a).post('/api/admin/voice-studio/routes/apply').set(FULL).send({ routeId: RID, change, validationToken: v.body.validationToken });
    expect(yes.status).toBe(200);
    expect(deps.store.applyRouteChange).toHaveBeenCalledWith(RID, expect.objectContaining({ mode: 'canary', canaryPercent: 10 }), 'admin-1');
  });

  it('apply needs the approver role; an invalid change is reported by validate and refused by apply', async () => {
    const { a, deps } = make();
    const v = await request(a).post('/api/admin/voice-studio/routes/validate').set(A).send({ routeId: RID, change });
    expect((await request(a).post('/api/admin/voice-studio/routes/apply').set(A).send({ routeId: RID, change, validationToken: v.body.validationToken })).status).toBe(403);
    const bad = await request(a).post('/api/admin/voice-studio/routes/validate').set(A).send({ routeId: RID, change: { ...change, canaryPercent: 0 } });
    expect(bad.body.ok).toBe(false);
    (deps.store.versionFacts as jest.Mock).mockResolvedValue({ versionPublished: false, profileId: null, engine: null }); // retired since validation
    const stale = await request(a).post('/api/admin/voice-studio/routes/apply').set(FULL).send({ routeId: RID, change, validationToken: v.body.validationToken });
    expect(stale.status).toBe(400);
    expect(deps.store.applyRouteChange).not.toHaveBeenCalled();
  });

  it('unknown route is 404; a path-key clash is 409', async () => {
    const { a, deps } = make();
    (deps.store.getRoute as jest.Mock).mockResolvedValueOnce(null);
    expect((await request(a).post('/api/admin/voice-studio/routes/validate').set(A).send({ routeId: RID, change })).status).toBe(404);
    const v = await request(a).post('/api/admin/voice-studio/routes/validate').set(A).send({ routeId: null, change });
    (deps.store.applyRouteChange as jest.Mock).mockResolvedValueOnce(null);
    expect((await request(a).post('/api/admin/voice-studio/routes/apply').set(FULL).send({ routeId: null, change, validationToken: v.body.validationToken })).status).toBe(409);
  });
});
