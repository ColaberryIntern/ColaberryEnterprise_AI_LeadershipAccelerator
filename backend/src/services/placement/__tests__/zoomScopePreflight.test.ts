// The real config (the database module needs its url), with made-up Zoom credentials so the client runs for real.
jest.mock('../../../config/env', () => ({ env: { ...jest.requireActual('../../../config/env').env,
  zoomAccountId: 'acct-1', zoomClientId: 'client-1', zoomClientSecret: 'secret-1', zoomHostEmail: 'host@refactored.example' } }));
import { makeRoomDb, ivRow } from './helpers/fakeRoomDb';

const mockDb = { current: makeRoomDb() };
// zoomService (loaded for the PATCH) pulls in the app's models: keep the REAL unconnected Sequelize, swap only its I/O.
jest.mock('../../../config/database', () => {
  const real = jest.requireActual('../../../config/database');
  real.sequelize.query = (...a: unknown[]) => (mockDb.current.query as (...x: unknown[]) => unknown)(...a);
  real.sequelize.transaction = (fn: (t: unknown) => Promise<unknown>) => mockDb.current.transaction(fn as never);
  return real;
});

import { __resetZoomTokenCacheForTests, getZoomAccessToken, getZoomGrantedScopes } from '../../zoom/zoomApiClient';
import { checkRecordingScopes, escalateScopeMissing, missingRecordingScopes, runScopePreflight } from '../zoomScopePreflight';
import { applyConsent } from '../roomService';

/**
 * CP9.1 (E6): the Zoom scope preflight, on the REAL path: roomService -> roomProvider -> zoomScopePreflight ->
 * zoomApiClient (token + scope cache) -> zoomService.updateMeeting -> fetch. Only fetch (the HTTP edge) and the
 * database's I/O are stand-ins. No real Zoom call is ever made.
 */
const GRANULAR = 'meeting:read:meeting:admin meeting:update:meeting:admin meeting:create:meeting:admin';
type Call = { url: string; method: string; body: unknown };
let calls: Call[] = [];
let zoomRecording = 'none';
let tokenScope: string | undefined = GRANULAR;

function fakeFetch(url: string, init: { method?: string; body?: string } = {}): Promise<Response> {
  calls.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : undefined });
  if (url.startsWith('https://zoom.us/oauth/token')) {
    return Promise.resolve(new Response(JSON.stringify({ access_token: 'tok-1', expires_in: 3600, ...(tokenScope === undefined ? {} : { scope: tokenScope }) }), { status: 200 }));
  }
  if (init.method === 'PATCH') {
    zoomRecording = (JSON.parse(String(init.body)) as { settings: { auto_recording: string } }).settings.auto_recording;
    return Promise.resolve(new Response(null, { status: 204 }));
  }
  return Promise.resolve(new Response(JSON.stringify({ id: 1, settings: { auto_recording: zoomRecording } }), { status: 200 }));
}
const patches = () => calls.filter((c) => c.method === 'PATCH');
const ID2 = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-11-23T14:55:00Z');

async function consentBoth(id: string): Promise<void> {
  await applyConsent(id, 'candidate', 'consent', 'candidate', NOW);
  await applyConsent(id, 'employer', 'consent', 'employer', NOW);
}

beforeEach(() => {
  __resetZoomTokenCacheForTests();
  mockDb.current = makeRoomDb();
  mockDb.current.fake.iv.push(ivRow(), ivRow({ id: ID2, room_provider_id: 'zm-2', readback_meeting_id: 'zm-2' }));
  calls = [];
  zoomRecording = 'none';
  tokenScope = GRANULAR;
  global.fetch = jest.fn(fakeFetch as unknown as typeof fetch);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const escalations = () => (console.error as jest.Mock).mock.calls.map((c) => JSON.parse(String(c[0]))).filter((l) => l.event === 'placement_zoom_scope_missing');

describe('which scopes recording control needs', () => {
  it('both the update and the read scope, granular or classic, in any mix', () => {
    expect(missingRecordingScopes(['meeting:update:meeting:admin', 'meeting:read:meeting:admin'])).toEqual([]);
    expect(missingRecordingScopes(['meeting:write:admin', 'meeting:read:admin'])).toEqual([]);
    expect(missingRecordingScopes(['meeting:write:admin', 'meeting:read:meeting:admin'])).toEqual([]);
    expect(missingRecordingScopes(['meeting:read:meeting:admin'])).toEqual(['meeting:update:meeting:admin']);
    expect(missingRecordingScopes(['meeting:update:meeting:admin'])).toEqual(['meeting:read:meeting:admin']);
    expect(missingRecordingScopes(null)).toEqual(['meeting:update:meeting:admin', 'meeting:read:meeting:admin']);
  });
});

describe('the real consent path', () => {
  it('scope granted and everyone consented: ONE PATCH with auto_recording cloud, then the GET read-back, recording on', async () => {
    await consentBoth(mockDb.current.fake.iv[0].id);
    expect(patches()).toHaveLength(1);
    expect(patches()[0]).toMatchObject({ url: 'https://api.zoom.us/v2/meetings/zm-1', body: { settings: { auto_recording: 'cloud' } } });
    expect(calls.filter((c) => c.method === 'GET' && c.url.endsWith('/meetings/zm-1'))).toHaveLength(1);
    expect(mockDb.current.fake.iv[0]).toMatchObject({ recording_consent: 'on', readback_recording: 'on' });
  });
  it('update scope missing: updateMeeting is never called, unrecorded, and ONE escalation and ONE event for the day across two interviews', async () => {
    tokenScope = 'meeting:read:meeting:admin meeting:create:meeting:admin';
    await consentBoth(mockDb.current.fake.iv[0].id);
    await consentBoth(ID2);
    expect(patches()).toHaveLength(0);
    expect(mockDb.current.fake.iv.map((i) => i.recording_consent)).toEqual(['unavailable', 'unavailable']);
    expect(mockDb.current.fake.events).toEqual([expect.objectContaining({ src: 'zoom_scope_missing:2026-11-23', event: 'zoom_scope_missing' })]);
    expect(escalations()).toEqual([expect.objectContaining({ error_class: 'ZoomScopeMissing', action: 'Ali: add scope meeting:update:meeting:admin to the Zoom server-to-server app' })]);
  });
  it('a token response with no scope field is cannot tell, treated as missing (fail safe)', async () => {
    tokenScope = undefined;
    await consentBoth(mockDb.current.fake.iv[0].id);
    expect(patches()).toHaveLength(0);
    expect(mockDb.current.fake.iv[0].recording_consent).toBe('unavailable');
    expect(await checkRecordingScopes()).toEqual({ ok: false, missing: ['meeting:update:meeting:admin', 'meeting:read:meeting:admin'], reason: 'cannot_tell' });
  });
  it('the token call failing is cannot tell, never an attempted change', async () => {
    global.fetch = jest.fn(async () => new Response('nope', { status: 401 })) as unknown as typeof fetch;
    expect((await checkRecordingScopes()).reason).toBe('cannot_tell');
  });
  it('a new day escalates again, once', async () => {
    expect(await escalateScopeMissing(['meeting:update:meeting:admin'], NOW)).toBe(true);
    expect(await escalateScopeMissing(['meeting:update:meeting:admin'], NOW)).toBe(false);
    expect(await escalateScopeMissing(['meeting:update:meeting:admin'], new Date('2026-11-24T15:00:00Z'))).toBe(true);
    expect(escalations()).toHaveLength(2);
  });
});

describe('getZoomGrantedScopes', () => {
  it('makes no request of its own: only the existing token call, once', async () => {
    expect(getZoomGrantedScopes()).toBeNull(); // no token yet: nothing is fetched to find out
    expect(global.fetch).not.toHaveBeenCalled();
    await getZoomAccessToken();
    for (let i = 0; i < 3; i += 1) expect(getZoomGrantedScopes()).toEqual(GRANULAR.split(' '));
    await checkRecordingScopes(); // cached token: still the one call
    expect((global.fetch as jest.Mock).mock.calls.map((c) => String(c[0]).split('?')[0])).toEqual(['https://zoom.us/oauth/token']);
  });
  it('the boot preflight reports the result and changes nothing', async () => {
    tokenScope = 'meeting:read:meeting:admin';
    expect(await runScopePreflight()).toMatchObject({ ok: false, reason: 'missing' });
    expect(calls.map((c) => c.method)).toEqual(['POST']);
    expect(String((console.warn as jest.Mock).mock.calls.at(-1)?.[0])).toContain('placement_zoom_scope_preflight');
  });
});
