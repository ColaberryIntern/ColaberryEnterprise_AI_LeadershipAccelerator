import { makeRoomDb, ivRow, type Iv } from './helpers/fakeRoomDb';
import { SENTINEL_PROVIDER_URL } from './helpers/noRoomUrl';

const mockDb = { current: makeRoomDb() };
jest.mock('../../../config/database', () => ({ sequelize: {
  query: (...a: unknown[]) => (mockDb.current.query as (...x: unknown[]) => unknown)(...a),
  transaction: (fn: (t: unknown) => Promise<unknown>) => mockDb.current.transaction(fn as never),
} }));
// The provider is a stand-in that records every call; its Zoom-facing half is tested in roomProvider / zoomScopePreflight.
const mockProv = { calls: [] as Array<[string, string, string?]>, scopes: { ok: true, missing: [] as string[], reason: 'ok' }, zoom: new Map<string, 'on' | 'off' | null>(),
  setFails: false, hold: null as Promise<void> | null };
jest.mock('../roomProvider', () => ({ roomProvider: {
  canSetRecording: async () => mockProv.scopes,
  setRecording: async (m: string, mode: string) => {
    mockProv.calls.push(['set', m, mode]);
    if (mockProv.hold) await mockProv.hold;
    if (mockProv.setFails) throw Object.assign(new Error('zoom 500'), { name: 'UpstreamUnavailable' });
    mockProv.zoom.set(m, mode === 'none' ? 'off' : 'on');
  },
  recording: async (m: string) => { mockProv.calls.push(['get', m]); return mockProv.zoom.has(m) ? mockProv.zoom.get(m) ?? null : 'off'; },
} }));

import { applyConsent, decide, openRoom, PENDING_LEASE_SECONDS, type Caller } from '../roomService';

/**
 * CP9.1 (kit F5, execution contract safety rules): the consent gate and the recording rule, through the REAL
 * roomService against a database stand-in that applies only what each statement says (helpers/fakeRoomDb.ts: row locks
 * held to the end of the transaction, uncommitted consents invisible to others).
 */
const ID = '11111111-1111-4111-8111-111111111111';
const START = new Date('2026-11-23T15:00:00Z');
const END_MS = START.getTime() + 30 * 60_000;
const AT = new Date(START.getTime() - 5 * 60_000); // inside the window
const CAND: Caller = { party: 'candidate', enrollmentId: 'enr-ann' };
const EMP: Caller = { party: 'employer', endMs: END_MS };
const db = () => mockDb.current.fake;
const row = (): Iv => db().iv[0];
const sets = () => mockProv.calls.filter((c) => c[0] === 'set');

beforeEach(() => {
  mockDb.current = makeRoomDb();
  db().iv.push(ivRow());
  Object.assign(mockProv, { calls: [], scopes: { ok: true, missing: [], reason: 'ok' }, zoom: new Map(), setFails: false, hold: null });
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

const view = async (c: Caller, now = AT) => {
  const r = await openRoom(c, ID, now);
  if (r.status !== 'ok') throw new Error(`room ${r.status}`);
  return r.view;
};

describe('recording turns on only at n of n consent', () => {
  it('2 of 2 consented: recording is requested ON exactly once, read back, and both joins are ready', async () => {
    await decide(CAND, ID, 'consent', AT);
    expect(sets()).toHaveLength(0);
    const v = await decide(EMP, ID, 'consent', AT);
    expect(sets()).toEqual([['set', 'zm-1', 'cloud']]);
    expect(row()).toMatchObject({ recording_consent: 'on', recording_meeting_id: 'zm-1', readback_recording: 'on' });
    expect(v.status === 'ok' && v.view).toMatchObject({ consent: { consented: 2, of: 2, label: 'RECORDING 2 OF 2 CONSENTED' }, recording: { status: 'on' }, join: { status: 'ready', url: SENTINEL_PROVIDER_URL } });
    expect((await view(CAND)).join).toEqual({ status: 'ready', url: SENTINEL_PROVIDER_URL, reason: null });
    expect(sets()).toHaveLength(1); // viewing again changes nothing
  });
  it('1 decline: never ON, the flag is stored, and the interview goes ahead unrecorded (both may join)', async () => {
    await decide(CAND, ID, 'consent', AT);
    await decide(EMP, ID, 'decline', AT);
    expect(sets()).toHaveLength(0);
    expect(row().recording_consent).toBe('declined');
    const v = await view(EMP);
    expect(v).toMatchObject({ yourDecision: 'decline', consent: { consented: 1, declined: true }, recording: { status: 'declined' }, join: { status: 'ready' } });
    expect(v.recording.note).toMatch(/unrecorded, with no replay/);
  });
  it('1 of 2 consented and the other undecided: never ON; the undecided party gets no link; the consenter does', async () => {
    await decide(CAND, ID, 'consent', AT);
    expect(sets()).toHaveLength(0);
    expect((await view(EMP)).join).toEqual({ status: 'decide_first', url: null, reason: expect.any(String) });
    expect((await view(CAND)).join.status).toBe('ready'); // recording stays off, which is what the read-back says
    expect(sets()).toHaveLength(0);
  });
  it('the first decision stands: a later opposite answer or a double click records nothing new', async () => {
    await decide(CAND, ID, 'consent', AT);
    await decide(CAND, ID, 'decline', AT);
    await decide(CAND, ID, 'consent', AT);
    expect(db().consents).toHaveLength(1);
    expect((await view(CAND)).yourDecision).toBe('consent');
  });
});

describe('races through the real code path', () => {
  it('both parties consent at the same moment: each sees the other under the row lock, recording ON exactly once', async () => {
    await Promise.all([decide(CAND, ID, 'consent', AT), decide(EMP, ID, 'consent', AT)]);
    expect(sets()).toEqual([['set', 'zm-1', 'cloud']]);
    expect(row().recording_consent).toBe('on');
  });
  it('a double-submitted final consent (and a view racing it) asks Zoom once', async () => {
    await decide(CAND, ID, 'consent', AT);
    await Promise.all([decide(EMP, ID, 'consent', AT), decide(EMP, ID, 'consent', AT), openRoom(CAND, ID, AT)]);
    expect(sets()).toHaveLength(1);
    expect(db().consents).toHaveLength(2);
  });
  it('while the change is in flight, a join is told to wait (no link); after it, ready', async () => {
    await decide(CAND, ID, 'consent', AT);
    let release: () => void = () => undefined;
    mockProv.hold = new Promise((r) => { release = r; });
    const deciding = decide(EMP, ID, 'consent', AT);
    await new Promise((r) => setImmediate(r));
    expect((await view(CAND)).join).toMatchObject({ status: 'starting', url: null });
    release();
    await deciding;
    expect((await view(CAND)).join.status).toBe('ready');
    expect(sets()).toHaveLength(1);
  });
  it('a claim left pending by a crashed process lapses and is claimed again, once', async () => {
    await decide(CAND, ID, 'consent', AT);
    await decide(EMP, ID, 'consent', AT);
    Object.assign(row(), { recording_consent: 'pending', recording_changed_at: new Date(db().dbNow.getTime() - (PENDING_LEASE_SECONDS - 1) * 1000) });
    await view(CAND);
    expect(sets()).toHaveLength(1); // still inside the lease: nobody else may claim
    row().recording_changed_at = new Date(db().dbNow.getTime() - (PENDING_LEASE_SECONDS + 1) * 1000);
    await Promise.all([view(CAND), view(EMP)]);
    expect(sets()).toHaveLength(2);
    expect(row().recording_consent).toBe('on');
  });
});

describe('the read-back must match consent before any link is given', () => {
  it('Zoom says recording ON while consent is incomplete (a host forcing it): no link, one review item', async () => {
    row().readback_recording = 'on';
    await decide(CAND, ID, 'consent', AT);
    const v = await view(CAND);
    expect(v.join).toMatchObject({ status: 'withheld', url: null });
    await view(CAND);
    expect(db().items).toEqual([expect.objectContaining({ kind: 'recording_mismatch', interview_id: ID })]);
  });
  it('cannot tell (no stored read-back, the GET fails): no link, review item; a later good read-back is stored and used', async () => {
    Object.assign(row(), { readback_meeting_id: null, readback_recording: null });
    mockProv.zoom.set('zm-1', null);
    await decide(CAND, ID, 'consent', AT);
    expect((await view(CAND)).join.status).toBe('withheld');
    expect(db().items[0].src).toBe(`recording_mismatch:${ID}:zm-1:unknown`);
    mockProv.zoom.set('zm-1', 'off');
    expect((await view(CAND)).join.status).toBe('ready');
    expect(row()).toMatchObject({ readback_meeting_id: 'zm-1', readback_recording: 'off' });
  });
  it('a read-back stored for an OLD meeting is not trusted for the new one', async () => {
    Object.assign(row(), { room_provider_id: 'zm-2', readback_meeting_id: 'zm-1', readback_recording: 'off' });
    mockProv.zoom.set('zm-2', 'on');
    await decide(CAND, ID, 'consent', AT);
    expect((await view(CAND)).join.status).toBe('withheld');
    expect(mockProv.calls).toContainEqual(['get', 'zm-2']);
  });
  it('the change failed (Zoom 500) and the read-back says off: failed, unrecorded, both still join', async () => {
    mockProv.setFails = true;
    await decide(CAND, ID, 'consent', AT);
    await decide(EMP, ID, 'consent', AT);
    expect(row()).toMatchObject({ recording_consent: 'failed', readback_recording: 'off' });
    const v = await view(EMP);
    expect(v).toMatchObject({ recording: { status: 'failed' }, join: { status: 'ready' } });
  });
  it('Zoom permission missing: no change attempted, unavailable, and the candidate sees why', async () => {
    mockProv.scopes = { ok: false, missing: ['meeting:update:meeting:admin'], reason: 'missing' };
    await decide(CAND, ID, 'consent', AT);
    await decide(EMP, ID, 'consent', AT);
    expect(sets()).toHaveLength(0);
    expect(row().recording_consent).toBe('unavailable');
    const v = await view(CAND);
    expect(v.recording).toEqual({ status: 'unavailable', note: expect.stringContaining('Recording unavailable: Zoom permission missing') });
    expect(v.join.status).toBe('ready');
  });
});

describe('a rebook is a new meeting, decided again', () => {
  it('recording ON for zm-1 does not carry to zm-2 (created off): the new meeting is turned on for itself, once', async () => {
    await decide(CAND, ID, 'consent', AT);
    await decide(EMP, ID, 'consent', AT);
    Object.assign(row(), { room_provider_id: 'zm-2', room_url: `${SENTINEL_PROVIDER_URL}2`, readback_meeting_id: 'zm-2', readback_recording: 'off' });
    expect((await view(CAND)).join.status).toBe('ready');
    expect(sets()).toEqual([['set', 'zm-1', 'cloud'], ['set', 'zm-2', 'cloud']]);
    expect(row()).toMatchObject({ recording_meeting_id: 'zm-2', recording_consent: 'on' });
  });
  it('a decline carries to every meeting of the interview', async () => {
    await decide(CAND, ID, 'decline', AT);
    row().room_provider_id = 'zm-2';
    row().readback_meeting_id = 'zm-2';
    await decide(EMP, ID, 'consent', AT);
    expect(sets()).toHaveLength(0);
  });
});

describe('the room window and who may enter', () => {
  it('11 minutes before the start: not open (with the opening time); 10 minutes before: open', async () => {
    expect(await openRoom(CAND, ID, new Date(START.getTime() - 11 * 60_000))).toEqual({ status: 'not_open', opensAt: '2026-11-23T14:50:00.000Z' });
    expect((await openRoom(CAND, ID, new Date(START.getTime() - 10 * 60_000))).status).toBe('ok');
    expect(await decide(CAND, ID, 'consent', new Date(START.getTime() - 11 * 60_000))).toMatchObject({ status: 'not_open' });
    expect(db().consents).toHaveLength(0); // a closed room takes no decision
  });
  it('closes 2 hours after the end', async () => {
    expect((await openRoom(CAND, ID, new Date(END_MS + 2 * 3_600_000))).status).toBe('ok');
    expect(await openRoom(CAND, ID, new Date(END_MS + 2 * 3_600_000 + 1000))).toEqual({ status: 'ended' });
  });
  it("another learner's interview is not found (the statement filters by learner)", async () => {
    expect(await openRoom({ party: 'candidate', enrollmentId: 'enr-bob' }, ID, AT)).toEqual({ status: 'not_found' });
    expect(await decide({ party: 'candidate', enrollmentId: 'enr-bob' }, ID, 'consent', AT)).toEqual({ status: 'not_found' });
    expect(db().consents).toHaveLength(0);
  });
  it('an employer link signed for an earlier booking time is "moved", never the new meeting', async () => {
    row().starts_at = new Date(START.getTime() + 3_600_000);
    expect(await openRoom(EMP, ID, AT)).toEqual({ status: 'moved' });
  });
  it('not booked (rescheduled back to new, cancelled) gives nothing, even at the same time with the old meeting stored', async () => {
    row().state = 'new';
    expect(await openRoom(CAND, ID, AT)).toEqual({ status: 'not_booked' });
    expect(await openRoom(EMP, ID, AT)).toEqual({ status: 'not_booked' });
    expect(await applyConsent(ID, 'candidate', 'consent')).toBe('gone');
  });
  it('a booked interview whose meeting is not made yet: not ready', async () => {
    Object.assign(row(), { room_provider_id: null, room_url: null });
    expect(await openRoom(CAND, ID, AT)).toEqual({ status: 'not_ready' });
  });
});
