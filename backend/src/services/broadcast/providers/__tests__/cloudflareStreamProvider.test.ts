/**
 * The Cloudflare adapter's tests. Two questions drive all of them:
 *
 *   1. Can anything in this module produce a PLAYABLE url when it should not? That is the
 *      fail-closed requirement, and every branch that could is reversed in the mutation notes
 *      on the PR. Missing credentials, a malformed uid, a subdomain that is not ours, an
 *      expiry in the past and an expiry past Cloudflare's own ceiling each get their own test
 *      because each is a separate way to leak paid media.
 *
 *   2. Does the signed token say exactly what the grant contract decided? The preview deadline
 *      is enforced in milliseconds and Cloudflare's `exp` is in seconds, so the conversion is
 *      asserted on the floor, not on "roughly right".
 *
 * NO NETWORK. `globalThis.fetch` is replaced with a throwing stub and asserted never called,
 * so a test that forgets to inject `fetchImpl` fails loudly instead of quietly reaching
 * Cloudflare. The RSA key is generated in-process; nothing here reads a file or a real secret.
 */
import { generateKeyPairSync } from 'crypto';
import jwt from 'jsonwebtoken';
import {
  readCloudflareStreamConfig,
  decodeSigningKey,
  signLivePlayback,
  createLiveInput,
  readLiveInput,
  readLiveLifecycle,
  createSigningKey,
  CloudflareStreamError,
  CLOUDFLARE_MAX_TOKEN_LIFETIME_MS,
  type CloudflareStreamConfig,
} from '../cloudflareStreamProvider';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString();
const PUBLIC_PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString();

const UID = 'f256e6ea9341d51eea64c9454659e576';
const NOW = Date.parse('2026-10-14T19:00:00.000Z');

const CONFIG: CloudflareStreamConfig = {
  accountId: 'test-account-id-not-real',
  subdomain: 'customer-keedfbz9hw',
  apiToken: 'test-api-token-not-real',
  signingKeyId: 'cdc935982f8075f2ef96106d85fcd838',
  signingKeyPem: PEM,
};

/** A Cloudflare success envelope. */
const envelope = (result: unknown) => JSON.stringify({ success: true, errors: [], messages: [], result });

const LIVE_INPUT_RESULT = {
  uid: UID,
  rtmps: { url: 'rtmps://live.cloudflare.com:443/live/', streamKey: 'sk_test_key' },
  recording: { mode: 'automatic', requireSignedURLs: true },
  status: null,
};

interface FakeCall { url: string; init: RequestInit | undefined }

/** A fetch double that answers once with the given status/body and records what it was asked. */
function fakeFetch(reply: { status?: number; body?: string; throws?: Error }): { impl: typeof fetch; calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    if (reply.throws) throw reply.throws;
    const status = reply.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => JSON.parse(reply.body ?? '{}'),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const realFetch = globalThis.fetch;
let globalFetchCalls = 0;
beforeAll(() => {
  globalThis.fetch = (() => {
    globalFetchCalls += 1;
    throw new Error('a test reached the real network');
  }) as unknown as typeof fetch;
});
afterAll(() => { globalThis.fetch = realFetch; });
afterEach(() => { expect(globalFetchCalls).toBe(0); });

/* ───────────────────────────────────────────────────────────── configuration ─ */

describe('reading configuration', () => {
  const FULL = {
    CLOUDFLARE_ACCOUNT_ID: 'acct',
    CLOUDFLARE_STREAM_SUBDOMAIN: 'customer-abc123',
    CLOUDFLARE_STREAM_TOKEN: 'not-a-real-token',
    CLOUDFLARE_STREAM_SIGNING_KEY_ID: 'kid',
    CLOUDFLARE_STREAM_SIGNING_KEY_PEM: Buffer.from(PEM).toString('base64'),
  } as NodeJS.ProcessEnv;

  it('returns a config when every credential is present', () => {
    const cfg = readCloudflareStreamConfig(FULL);
    expect(cfg).not.toBeNull();
    expect(cfg!.signingKeyPem.startsWith('-----BEGIN')).toBe(true);
  });

  // One case per credential: a partial config is the state in which a caller is most likely to
  // believe the provider works.
  it.each(Object.keys(FULL))('returns null when %s is missing', (missing) => {
    const env = { ...FULL };
    delete (env as Record<string, unknown>)[missing];
    expect(readCloudflareStreamConfig(env as NodeJS.ProcessEnv)).toBeNull();
  });

  it('treats an empty or whitespace-only credential as missing', () => {
    expect(readCloudflareStreamConfig({ ...FULL, CLOUDFLARE_STREAM_TOKEN: '   ' })).toBeNull();
  });

  it('accepts a PEM that an operator already decoded by hand', () => {
    expect(decodeSigningKey(PEM).startsWith('-----BEGIN')).toBe(true);
  });

  it('refuses a signing key that is neither PEM nor base64 PEM, rather than guessing', () => {
    expect(() => decodeSigningKey('not-a-key')).toThrow(CloudflareStreamError);
  });
});

/* ────────────────────────────────────────────────────────── signed playback ─ */

describe('signing live playback', () => {
  const EXPIRES = NOW + 120_000;

  it('puts the token in the PATH and never the uid', () => {
    const signed = signLivePlayback(UID, EXPIRES, NOW, CONFIG);
    expect(signed.url.startsWith('https://customer-keedfbz9hw.cloudflarestream.com/')).toBe(true);
    expect(signed.url.endsWith('/manifest/video.m3u8')).toBe(true);
    expect(signed.url).not.toContain(UID);
    expect(signed.url).not.toContain('?');
  });

  it('signs a token Cloudflare could verify, carrying the uid as sub', () => {
    const signed = signLivePlayback(UID, EXPIRES, NOW, CONFIG);
    const token = signed.url.split('/')[3];
    // Verified AT the injected instant. Without `clockTimestamp` this throws NotBeforeError
    // against the real clock — which is itself evidence that `nbf` is set and enforced.
    const decoded = jwt.verify(token, PUBLIC_PEM, {
      algorithms: ['RS256'], clockTimestamp: Math.floor(NOW / 1000),
    }) as Record<string, unknown>;
    expect(decoded.sub).toBe(UID);
    expect(decoded.kid).toBe(CONFIG.signingKeyId);
    const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString()) as Record<string, unknown>;
    expect(header.alg).toBe('RS256');
    expect(header.kid).toBe(CONFIG.signingKeyId);
  });

  /**
   * The whole point of the module, asserted as a property rather than a field read: the token
   * verifies one second before the granted instant and is REFUSED one second after it. This is
   * request §4.2's "prove the viewer cannot continue obtaining paid content after expiry",
   * checked by the same RS256 verification Cloudflare's edge performs.
   */
  it('verifies before the deadline and is refused after it', () => {
    const token = signLivePlayback(UID, EXPIRES, NOW, CONFIG).url.split('/')[3];
    const verifyAt = (ms: number) => jwt.verify(token, PUBLIC_PEM, {
      algorithms: ['RS256'], clockTimestamp: Math.floor(ms / 1000),
    });
    expect(() => verifyAt(EXPIRES - 1_000)).not.toThrow();
    expect(() => verifyAt(EXPIRES + 1_000)).toThrow(/jwt expired/);
  });

  it('sets exp to the FLOOR of the granted instant in seconds, never past it', () => {
    // 1750ms past a second boundary: ceiling would hand the viewer 250ms beyond the deadline.
    const ragged = NOW + 1_750;
    const signed = signLivePlayback(UID, ragged, NOW, CONFIG);
    const decoded = jwt.decode(signed.url.split('/')[3]) as Record<string, number>;
    expect(decoded.exp).toBe(Math.floor(ragged / 1000));
    expect(decoded.exp * 1000).toBeLessThanOrEqual(ragged);
  });

  it('reports the grant shape the player already understands', () => {
    const signed = signLivePlayback(UID, NOW + 119_900, NOW, CONFIG);
    expect(signed.expiresAt).toBe(NOW + 119_900);
    expect(signed.ttlSeconds).toBe(119); // floored, so a client never rounds past the deadline
  });

  // ── fail-closed. Each of these would otherwise hand out a playable url. ──
  it('fails closed when the provider is not configured', () => {
    expect(() => signLivePlayback(UID, EXPIRES, NOW, null)).toThrow(/not configured/);
  });

  it.each([
    ['uppercase hex', 'F256E6EA9341D51EEA64C9454659E576'],
    ['too short', 'f256e6ea'],
    ['a path traversal', '../../etc/passwd'],
    ['an empty string', ''],
    ['a full url', 'https://evil.example/x'],
  ])('fails closed on a uid that is %s', (_label, uid) => {
    expect(() => signLivePlayback(uid, EXPIRES, NOW, CONFIG)).toThrow(CloudflareStreamError);
  });

  it.each([
    ['a foreign host', 'evil.example'],
    ['a path segment', 'customer-abc/../evil'],
    ['the wrong prefix', 'client-abc123'],
  ])('fails closed when the subdomain is %s', (_label, subdomain) => {
    expect(() => signLivePlayback(UID, EXPIRES, NOW, { ...CONFIG, subdomain })).toThrow(CloudflareStreamError);
  });

  it('fails closed when the window has already closed', () => {
    expect(() => signLivePlayback(UID, NOW, NOW, CONFIG)).toThrow(/already closed/);
    expect(() => signLivePlayback(UID, NOW - 1, NOW, CONFIG)).toThrow(/already closed/);
  });

  it('fails closed on a window beyond the provider ceiling, rather than letting Cloudflare decide', () => {
    const past = NOW + CLOUDFLARE_MAX_TOKEN_LIFETIME_MS + 1;
    expect(() => signLivePlayback(UID, past, NOW, CONFIG)).toThrow(/exceeds the provider maximum/);
    // And the boundary itself is still allowed, so the guard is a ceiling and not an off-by-one.
    expect(() => signLivePlayback(UID, NOW + CLOUDFLARE_MAX_TOKEN_LIFETIME_MS, NOW, CONFIG)).not.toThrow();
  });

  it('fails closed on a non-finite expiry', () => {
    expect(() => signLivePlayback(UID, Number.NaN, NOW, CONFIG)).toThrow(CloudflareStreamError);
  });
});

/* ──────────────────────────────────────────────────────────── creating inputs ─ */

describe('creating a live input', () => {
  it('asks for the two settings that are not Cloudflare defaults', async () => {
    const f = fakeFetch({ body: envelope(LIVE_INPUT_RESULT) });
    await createLiveInput({ name: 'Week 12', idempotencyKey: 'occ-1' }, { fetchImpl: f.impl, config: CONFIG });
    const body = JSON.parse(String(f.calls[0].init!.body)) as { recording: Record<string, unknown> };
    expect(body.recording.mode).toBe('automatic');     // `off` is the default and is unplayable
    expect(body.recording.requireSignedURLs).toBe(true); // false is the default and is public
  });

  it('sends an idempotency key so a double-click does not leave two inputs', async () => {
    const f = fakeFetch({ body: envelope(LIVE_INPUT_RESULT) });
    await createLiveInput({ name: 'Week 12', idempotencyKey: 'occ-abc' }, { fetchImpl: f.impl, config: CONFIG });
    const headers = f.calls[0].init!.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBe('occ-abc');
  });

  it('returns the ingest details a producer needs', async () => {
    const f = fakeFetch({ body: envelope(LIVE_INPUT_RESULT) });
    const input = await createLiveInput({ name: 'x', idempotencyKey: 'k' }, { fetchImpl: f.impl, config: CONFIG });
    expect(input).toEqual({
      uid: UID,
      rtmpsUrl: 'rtmps://live.cloudflare.com:443/live/',
      rtmpsStreamKey: 'sk_test_key',
      requireSignedURLs: true,
      status: null,
    });
  });

  it('refuses an input Cloudflare did not actually protect', async () => {
    const unprotected = { ...LIVE_INPUT_RESULT, recording: { mode: 'automatic', requireSignedURLs: false } };
    const f = fakeFetch({ body: envelope(unprotected) });
    await expect(createLiveInput({ name: 'x', idempotencyKey: 'k' }, { fetchImpl: f.impl, config: CONFIG }))
      .rejects.toThrow(/without signed-URL protection/);
  });

  it('never calls Cloudflare at all when the provider is unconfigured', async () => {
    const f = fakeFetch({ body: envelope(LIVE_INPUT_RESULT) });
    await expect(createLiveInput({ name: 'x', idempotencyKey: 'k' }, { fetchImpl: f.impl, config: null }))
      .rejects.toThrow(/not configured/);
    expect(f.calls).toHaveLength(0);
  });
});

/* ─────────────────────────────────────────────────────────────── failure paths ─ */

describe('failure paths are classified, not leaked', () => {
  const call = (reply: Parameters<typeof fakeFetch>[0]) =>
    createLiveInput({ name: 'x', idempotencyKey: 'k' }, { fetchImpl: fakeFetch(reply).impl, config: CONFIG });

  it.each([
    [401, 'Unauthorized'],
    [403, 'Unauthorized'],
    [404, 'NotFound'],
    [429, 'RateLimited'],
    [500, 'UpstreamUnavailable'],
    [503, 'UpstreamUnavailable'],
  ])('maps HTTP %s to %s', async (status, expected) => {
    await expect(call({ status: status as number })).rejects.toMatchObject({ error_class: expected });
  });

  it('classifies an abort as Timeout, not as an unreachable host', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    await expect(call({ throws: timeout })).rejects.toMatchObject({ error_class: 'Timeout' });
  });

  it('classifies a network failure as UpstreamUnavailable', async () => {
    await expect(call({ throws: new TypeError('fetch failed') })).rejects.toMatchObject({ error_class: 'UpstreamUnavailable' });
  });

  it('rejects a body that is not JSON', async () => {
    await expect(call({ body: 'not json at all' })).rejects.toMatchObject({ error_class: 'MalformedResponse' });
  });

  it('rejects a 200 that carries success:false', async () => {
    const body = JSON.stringify({ success: false, errors: [{ code: 10004, message: 'bad' }], result: null });
    await expect(call({ body })).rejects.toMatchObject({ error_class: 'MalformedResponse' });
  });

  /**
   * THE POSITIVE CONTROL for the envelope check, and it was added because it was missing.
   *
   * The test above passes even with the `success !== true` guard deleted — with a null result
   * the shape check downstream throws anyway, so it proves the symptom, not the guard. Mutation
   * M12 survived on exactly that. Here the result is a PERFECTLY VALID live input, so the only
   * thing standing between Cloudflare's "this failed" and a caller believing it succeeded is
   * the guard itself.
   */
  it('rejects success:false EVEN when the result underneath looks valid', async () => {
    const body = JSON.stringify({ success: false, errors: [{ code: 10004, message: 'bad' }], result: LIVE_INPUT_RESULT });
    await expect(call({ body })).rejects.toMatchObject({ error_class: 'MalformedResponse' });
  });

  it('rejects a result missing the fields this server needs', async () => {
    await expect(call({ body: envelope({ uid: UID }) })).rejects.toMatchObject({ error_class: 'MalformedResponse' });
  });

  it('never puts the API token in the error message', async () => {
    await expect(call({ status: 401 })).rejects.not.toThrow(new RegExp(CONFIG.apiToken));
  });
});

/* ─────────────────────────────────────────────────────────────────── lifecycle ─ */

describe('is the input actually live', () => {
  /**
   * THE 15 OCTOBER 2026 DEFECT, pinned.
   *
   * This used to call /lifecycle on the DELIVERY domain, exactly as Cloudflare documents.
   * During the first production airing that endpoint returned 401 the moment the input was
   * actually broadcasting with signed URLs required - while answering fine minutes earlier
   * when the same input was idle. The result was a healthy, airing class reported as not
   * ready, which makes the state machine refuse go_live. An outage reading as "nothing live".
   *
   * Readiness now comes from the API domain. The host assertion below is the regression test:
   * if anything moves this back to the delivery domain, it fails.
   */
  const videos = (result: unknown, status = 200) => readLiveLifecycle(UID, {
    fetchImpl: fakeFetch({ status, body: JSON.stringify({ success: true, errors: [], messages: [], result }) }).impl,
    config: CONFIG,
  });

  const LIVE_UID = '55b9b5ce48c3968c6b514c458959d6ab';
  const liveVideo = { uid: LIVE_UID, status: { state: 'live-inprogress' } };

  it('reads live and the per-broadcast video uid', async () => {
    await expect(videos([liveVideo])).resolves.toEqual({ live: true, videoUid: LIVE_UID });
  });

  it('reads idle when the input has never broadcast', async () => {
    await expect(videos([])).resolves.toEqual({ live: false, videoUid: null });
  });

  it('a FINISHED recording is not live, and does not leak its uid as a live one', async () => {
    // `ready` is a completed recording. Returning its uid would invite a caller to treat a
    // replay as a live stream, which is how last week's class ends up on today's badge.
    await expect(videos([{ uid: LIVE_UID, status: { state: 'ready' } }]))
      .resolves.toEqual({ live: false, videoUid: null });
  });

  it.each([
    ['not-started', [{ uid: LIVE_UID, status: { state: 'not-started' } }]],
    ['an absent status', [{ uid: LIVE_UID }]],
    ['a non-string state', [{ uid: LIVE_UID, status: { state: 1 } }]],
    ['a result that is not a list', { uid: LIVE_UID }],
  ])('treats %s as NOT live, because the safe direction for an unreadable answer is not-ready', async (_l, result) => {
    await expect(videos(result)).resolves.toMatchObject({ live: false });
  });

  it('hits the API host, NOT the delivery host - this is the 401 regression', async () => {
    const f = fakeFetch({ body: JSON.stringify({ success: true, errors: [], messages: [], result: [] }) });
    await readLiveLifecycle(UID, { fetchImpl: f.impl, config: CONFIG });
    expect(f.calls[0].url).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${CONFIG.accountId}/stream/live_inputs/${UID}/videos`,
    );
    expect(f.calls[0].url).not.toContain('cloudflarestream.com');
    expect(f.calls[0].url).not.toContain('/lifecycle');
  });

  it('classifies a 401 rather than reporting the stream as idle', async () => {
    // The whole point: an auth failure must NOT look like "nothing is broadcasting".
    const f = fakeFetch({ status: 401 });
    await expect(readLiveLifecycle(UID, { fetchImpl: f.impl, config: CONFIG }))
      .rejects.toMatchObject({ error_class: 'Unauthorized' });
  });

  it('classifies a 404 as NotFound', async () => {
    const f = fakeFetch({ status: 404 });
    await expect(readLiveLifecycle(UID, { fetchImpl: f.impl, config: CONFIG }))
      .rejects.toMatchObject({ error_class: 'NotFound' });
  });

  it('fails closed on a malformed uid before any request goes out', async () => {
    const f = fakeFetch({ body: '{}' });
    await expect(readLiveLifecycle('../x', { fetchImpl: f.impl, config: CONFIG })).rejects.toThrow(CloudflareStreamError);
    expect(f.calls).toHaveLength(0);
  });
});

/* ──────────────────────────────────────────────────────────── reads and keys ─ */

describe('reading an input and minting a signing key', () => {
  it('reads a live input', async () => {
    const f = fakeFetch({ body: envelope({ ...LIVE_INPUT_RESULT, status: 'connected' }) });
    await expect(readLiveInput(UID, { fetchImpl: f.impl, config: CONFIG }))
      .resolves.toMatchObject({ uid: UID, status: 'connected' });
    expect(f.calls[0].url).toBe(`https://api.cloudflare.com/client/v4/accounts/${CONFIG.accountId}/stream/live_inputs/${UID}`);
  });

  it('refuses to read a uid that is not one', async () => {
    const f = fakeFetch({ body: envelope(LIVE_INPUT_RESULT) });
    await expect(readLiveInput('nope', { fetchImpl: f.impl, config: CONFIG })).rejects.toThrow(CloudflareStreamError);
    expect(f.calls).toHaveLength(0);
  });

  it('returns a minted signing key to the caller', async () => {
    const f = fakeFetch({ body: envelope({ id: 'key-id', pem: 'YmFzZTY0' }) });
    await expect(createSigningKey({ fetchImpl: f.impl, config: CONFIG })).resolves.toEqual({ id: 'key-id', pem: 'YmFzZTY0' });
  });

  it('rejects a key response without pem', async () => {
    const f = fakeFetch({ body: envelope({ id: 'key-id' }) });
    await expect(createSigningKey({ fetchImpl: f.impl, config: CONFIG })).rejects.toMatchObject({ error_class: 'MalformedResponse' });
  });
});
