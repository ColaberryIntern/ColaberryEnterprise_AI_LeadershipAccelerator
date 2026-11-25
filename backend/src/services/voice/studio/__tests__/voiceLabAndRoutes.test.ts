import { randomBytes } from 'crypto';
import { PreviewLimiter, createTrial, clipVoice, scoreTrial, publicTrial, openAiSynth, LabError, type AbTrial, type TrialStore } from '../voiceLab';
import { voiceCatalog, REALTIME_VOICES, isPreviewable } from '../voiceCatalog';
import { checkValidationToken, describeImpact, mintValidationToken, validateRouteChange, LIVE_CONFIRMATION, VALIDATION_TTL_MS, type RouteChange } from '../routeChange';
import { stopTestCall, type StopDeps } from '../../testlab/stopTestCall';

/** An in-memory trial store with the SQL store's semantics (score only a pending trial). */
function memStore(): TrialStore & { rows: Map<string, AbTrial> } {
  const rows = new Map<string, AbTrial>();
  let n = 0;
  return {
    rows,
    create: async (t) => { const id = `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`; rows.set(id, { ...t, id, preferred: null, scoredBy: null }); return id; },
    get: async (id) => rows.get(id) ?? null,
    score: async (id, preferred, by) => { const t = rows.get(id); if (!t || t.preferred !== null) return null; const s = { ...t, preferred, scoredBy: by }; rows.set(id, s); return s; },
  };
}

describe('voice catalog (verified only)', () => {
  it('lists the 10 OpenAI Realtime voices with marin and cedar recommended, plus Twilio defaults', () => {
    const c = voiceCatalog();
    expect(c.filter((v) => v.engine === 'openai_realtime').map((v) => v.id)).toEqual([...REALTIME_VOICES]);
    expect(c.filter((v) => v.recommended && v.engine === 'openai_realtime').map((v) => v.id).sort()).toEqual(['cedar', 'marin']);
    expect(c.find((v) => v.engine === 'conversation_relay' && v.label.includes('en-US'))?.id).toBe('UgBBYS2sOqTuMpoF3BR0');
    expect(c.every((v) => v.source.length > 0)).toBe(true);
    expect(c.filter((v) => v.engine === 'conversation_relay').every((v) => v.preview === 'test_call_only')).toBe(true);
  });
  it('a configured relay voice appears; an unknown voice is not previewable', () => {
    expect(voiceCatalog('abcdefghij1234567890-v4').some((v) => v.id === 'abcdefghij1234567890')).toBe(true);
    expect(isPreviewable('nova')).toBe(false); // a TTS-only voice is not an Engine B voice
    expect(isPreviewable('marin')).toBe(true);
  });
});

describe('preview limiter', () => {
  it('per admin and global caps, over a sliding hour', () => {
    const l = new PreviewLimiter(2, 3);
    expect([l.take('a', 0), l.take('a', 1), l.take('a', 2)]).toEqual([true, true, false]);
    expect([l.take('b', 3), l.take('b', 4)]).toEqual([true, false]); // global 3 reached
    expect(l.take('a', 60 * 60 * 1000 + 10)).toBe(true); // the hour slid
  });
});

describe('blind A/B hides voice identity until scored', () => {
  const NAMES = /alloy|ash|ballad|coral|echo|sage|shimmer|verse|marin|cedar/;

  it('create and read-before-scoring never name a voice; clips map X/Y correctly; scoring reveals', async () => {
    const store = memStore();
    const created = await createTrial(store, { voiceA: 'marin', voiceB: 'cedar', text: 'Hi, this is the Colaberry assistant.' }, 'admin-1', () => 1);
    expect(JSON.stringify(created)).not.toMatch(NAMES);
    expect(created).toMatchObject({ scored: false, clips: [{ label: 'X' }, { label: 'Y' }] });
    const id = String(created.trialId);
    expect(JSON.stringify(publicTrial((await store.get(id))!))).not.toMatch(NAMES);
    const x = await clipVoice(store, id, 'X');
    const y = await clipVoice(store, id, 'Y');
    expect([x.voice, y.voice].sort()).toEqual(['cedar', 'marin']);
    expect(x.voice).toBe('cedar'); // coin 1 swapped the order: the order is not the request order
    const scored = await scoreTrial(store, id, { preferred: 'Y' }, 'admin-2');
    expect(scored).toMatchObject({ scored: true, preferred: 'Y', reveal: { X: 'cedar', Y: 'marin' } });
  });

  it('a trial is scored once; bad inputs are refused without a name leaking', async () => {
    const store = memStore();
    const { trialId } = await createTrial(store, { voiceA: 'ash', voiceB: 'echo', text: 'Hello' }, 'a', () => 0);
    await scoreTrial(store, String(trialId), { preferred: 'tie' }, 'a');
    await expect(scoreTrial(store, String(trialId), { preferred: 'X' }, 'b')).rejects.toMatchObject({ errorClass: 'Conflict' });
    await expect(scoreTrial(store, String(trialId), { preferred: 'Z' }, 'b')).rejects.toMatchObject({ errorClass: 'ValidationError' });
    await expect(createTrial(store, { voiceA: 'ash', voiceB: 'ash', text: 'x' }, 'a')).rejects.toMatchObject({ errorClass: 'ValidationError' });
    await expect(createTrial(store, { voiceA: 'nova', voiceB: 'ash', text: 'x' }, 'a')).rejects.toMatchObject({ errorClass: 'ValidationError' });
    await expect(clipVoice(store, String(trialId), 'Z')).rejects.toMatchObject({ errorClass: 'ValidationError' });
    await expect(clipVoice(store, '00000000-0000-4000-8000-999999999999', 'X')).rejects.toMatchObject({ errorClass: 'NotFound' });
  });
});

describe('openAiSynth (failure paths)', () => {
  const res = (status: number) => ({ status, ok: status < 300, arrayBuffer: async () => new ArrayBuffer(3) }) as unknown as Response;
  it('no key, 429, 5xx and a timeout all become stable error classes; success returns audio', async () => {
    await expect(openAiSynth(undefined)('marin', 'hi')).rejects.toMatchObject({ errorClass: 'ConfigMissing' });
    await expect(openAiSynth('k', (async () => res(429)) as never)('marin', 'hi')).rejects.toMatchObject({ errorClass: 'RateLimitError' });
    await expect(openAiSynth('k', (async () => res(503)) as never)('marin', 'hi')).rejects.toMatchObject({ errorClass: 'UpstreamUnavailable' });
    await expect(openAiSynth('k', (async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); }) as never)('marin', 'hi')).rejects.toMatchObject({ errorClass: 'UpstreamUnavailable' });
    await expect(openAiSynth('k', (async () => res(200)) as never)('nova', 'hi')).rejects.toBeInstanceOf(LabError);
    let body = '';
    const ok = await openAiSynth('k', (async (_u: string, init: { body: string }) => { body = init.body; return res(200); }) as never)('marin', 'hi');
    expect(ok.length).toBe(3);
    expect(JSON.parse(body)).toEqual({ model: 'gpt-4o-mini-tts', voice: 'marin', input: 'hi', response_format: 'mp3' });
  });
});

const VID = '11111111-1111-4111-8111-111111111111';
const base = (p: Partial<RouteChange> = {}): RouteChange => ({ pathKey: 'interest', callType: 'interest', brandSlug: 'colaberry', mode: 'shadow', canaryPercent: 0, versionId: null, fallback: { kind: 'legacy' }, ...p });

describe('route change rules', () => {
  it.each<[string, Partial<RouteChange>, boolean, boolean]>([
    ['shadow, no version', {}, false, true],
    ['canary 10% with a published version and an audience', { mode: 'canary', canaryPercent: 10, versionId: VID, fallback: { kind: 'legacy', audience: ['lead:42'] } }, true, true],
    ['canary with no audience', { mode: 'canary', canaryPercent: 10, versionId: VID }, true, false],
    ['canary with a phone number as audience', { mode: 'canary', canaryPercent: 10, versionId: VID, fallback: { kind: 'legacy', audience: ['+15555550100'] } }, true, false],
    ['canary 0%', { mode: 'canary', canaryPercent: 0, versionId: VID }, true, false],
    ['canary 60%', { mode: 'canary', canaryPercent: 60, versionId: VID }, true, false],
    ['shadow with a canary percent', { canaryPercent: 5 }, false, false],
    ['test without a published version', { mode: 'test', versionId: VID }, false, false],
    ['live without confirmation', { mode: 'live', versionId: VID }, true, false],
    ['live with no fallback', { mode: 'live', versionId: VID, confirm: LIVE_CONFIRMATION, fallback: { kind: 'none' } }, true, false],
    ['live, confirmed, with fallback', { mode: 'live', versionId: VID, confirm: LIVE_CONFIRMATION }, true, true],
    ['human line without a reference', { fallback: { kind: 'human_line' } }, false, false],
  ])('%s', (_n, patch, published, ok) => {
    expect(validateRouteChange(base(patch), { versionPublished: published, versionBrand: 'colaberry', versionEngine: 'conversation_relay' }).ok).toBe(ok);
  });
  it('VS4.5: a version of another brand, or one whose brand was not looked up, cannot carry callers; Engine B cannot either', () => {
    const live = base({ mode: 'live', versionId: VID, confirm: LIVE_CONFIRMATION });
    for (const facts of [{ versionBrand: 'other', versionEngine: 'conversation_relay' }, { versionBrand: null, versionEngine: 'conversation_relay' }, {}, { versionBrand: 'colaberry', versionEngine: 'openai_realtime' }]) expect(validateRouteChange(live, { versionPublished: true, ...facts }).ok).toBe(false);
    expect(validateRouteChange(base({ mode: 'test', versionId: VID }), { versionPublished: true, versionBrand: 'colaberry', versionEngine: 'openai_realtime' }).ok).toBe(true);
  });
  it('unknown fields and bad keys are refused', () => {
    expect(validateRouteChange({ ...base(), purchaseNumber: true }, { versionPublished: false }).ok).toBe(false);
    expect(validateRouteChange(base({ pathKey: 'Bad Key' }), { versionPublished: false }).ok).toBe(false);
  });
  it('impact says how many real callers would move', () => {
    expect(describeImpact('legacy', base({ mode: 'canary', canaryPercent: 10, versionId: VID }), 42)).toMatchObject({ movesRealCallers: true, callsLast7Days: 42 });
    expect(describeImpact(null, base(), 0)).toMatchObject({ movesRealCallers: false, currentMode: null });
  });
});

describe('a route change without validation is refused', () => {
  const key = randomBytes(32);
  const RID = '22222222-2222-4222-8222-222222222222';
  it('missing, malformed, expired, other route, other change, other key: all refused; the exact one passes', () => {
    const c = base({ mode: 'canary', canaryPercent: 10, versionId: VID });
    const t = mintValidationToken(key, RID, c, 1_790_000_000_000);
    expect(checkValidationToken(key, undefined, RID, c, 1_790_000_000_001)).toEqual({ ok: false, reason: 'validation_required' });
    expect(checkValidationToken(key, 'nope', RID, c, 1_790_000_000_001)).toEqual({ ok: false, reason: 'validation_required' });
    expect(checkValidationToken(key, t, RID, c, 1_790_000_000_000 + VALIDATION_TTL_MS + 1)).toEqual({ ok: false, reason: 'validation_expired' });
    expect(checkValidationToken(key, t, null, c, 1_790_000_000_001)).toEqual({ ok: false, reason: 'validation_mismatch' });
    expect(checkValidationToken(key, t, RID, { ...c, canaryPercent: 11 }, 1_790_000_000_001)).toEqual({ ok: false, reason: 'validation_mismatch' });
    expect(checkValidationToken(randomBytes(32), t, RID, c, 1_790_000_000_001)).toEqual({ ok: false, reason: 'validation_mismatch' });
    expect(checkValidationToken(key, t, RID, c, 1_790_000_000_001)).toEqual({ ok: true });
  });
});

describe('stop button (test calls only)', () => {
  const deps = (row: Awaited<ReturnType<StopDeps['lookup']>>, hangup: StopDeps['hangup'] = jest.fn().mockResolvedValue(undefined)) => ({ lookup: async () => row, hangup, log: jest.fn() });
  it('hangs up an in-progress test call', async () => {
    const d = deps({ provider_call_id: 'CA1', state: 'session_active', test_mode: true });
    expect(await stopTestCall('c', d)).toEqual({ status: 200, body: { stopped: true } });
    expect(d.hangup).toHaveBeenCalledWith('CA1');
  });
  it('never touches a customer call, an ended call, or one not dialed yet; Twilio failure is a 502', async () => {
    const h = jest.fn();
    expect((await stopTestCall('c', deps({ provider_call_id: 'CA1', state: 'session_active', test_mode: false }, h))).status).toBe(409);
    expect((await stopTestCall('c', deps({ provider_call_id: 'CA1', state: 'completed', test_mode: true }, h))).status).toBe(409);
    expect((await stopTestCall('c', deps({ provider_call_id: null, state: 'dispatching', test_mode: true }, h))).status).toBe(409);
    expect((await stopTestCall('c', deps(null, h))).status).toBe(404);
    expect(h).not.toHaveBeenCalled();
    const fail = deps({ provider_call_id: 'CA1', state: 'ringing', test_mode: true }, jest.fn().mockRejectedValue(Object.assign(new Error('x'), { errorClass: 'UpstreamUnavailable' })));
    expect(await stopTestCall('c', fail)).toEqual({ status: 502, body: { error: 'UpstreamUnavailable' } });
  });
});
