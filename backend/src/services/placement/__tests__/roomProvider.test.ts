const mockCreate = jest.fn();
const mockJoin = jest.fn();
jest.mock('../../communityRooms/meetingProvider', () => ({ getMeetingProvider: () => ({ createMeeting: (i: unknown) => mockCreate(i), getJoinUrl: (m: string) => mockJoin(m) }) }));
const mockApi = jest.fn();
jest.mock('../../zoom/zoomApiClient', () => ({ zoomApiRequest: (...a: unknown[]) => mockApi(...a), getZoomAccessToken: async () => 'tok', getZoomGrantedScopes: () => null, assertZoomConfigured: () => undefined }));
const mockUpdate = jest.fn();
jest.mock('../../zoomService', () => ({ updateMeeting: (...a: unknown[]) => mockUpdate(...a) }));

import { recordingFrom, roomProvider } from '../roomProvider';
import { SENTINEL_PROVIDER_URL } from './helpers/noRoomUrl';

/** CP9.1: the room's meeting adapter. Created off, always; the read-back maps Zoom's answer to on / off / cannot tell. */
const START = new Date('2026-11-23T15:00:00Z');

beforeEach(() => {
  mockCreate.mockReset().mockResolvedValue({ providerEventId: 'zm-1', joinUrl: SENTINEL_PROVIDER_URL, storedSettings: { auto_recording: 'none' } });
  mockApi.mockReset();
  mockUpdate.mockReset().mockResolvedValue(undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('create', () => {
  it("asks for recording 'none' with the interview's idempotency key and times, and reports what Zoom stored", async () => {
    const made = await roomProvider.create({ interviewId: 'iv-1', startsAt: START, minutes: 45, company: ' Acme ' });
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ autoRecording: 'none', requestId: 'placement-interview-iv-1-2026-11-23T15:00:00.000Z',
      startAt: START, endAt: new Date(START.getTime() + 45 * 60_000), title: 'Interview: Acme and a Refactored candidate' }));
    expect(made).toEqual({ providerEventId: 'zm-1', joinUrl: SENTINEL_PROVIDER_URL, recording: 'off' });
  });
  it('a replayed create (no stored settings) reports cannot tell', async () => {
    mockCreate.mockResolvedValue({ providerEventId: 'zm-1', joinUrl: SENTINEL_PROVIDER_URL, storedSettings: null });
    expect((await roomProvider.create({ interviewId: 'iv-1', startsAt: START, minutes: 30, company: null })).recording).toBeNull();
  });
  it('a host that forces recording on shows up as on (never trusted as off)', async () => {
    mockCreate.mockResolvedValue({ providerEventId: 'zm-1', joinUrl: SENTINEL_PROVIDER_URL, storedSettings: { auto_recording: 'cloud' } });
    expect((await roomProvider.create({ interviewId: 'iv-1', startsAt: START, minutes: 30, company: null })).recording).toBe('on');
  });
  it('no meeting id or link back is a ContractViolation', async () => {
    mockCreate.mockResolvedValue({ providerEventId: 'zm-1', joinUrl: null });
    await expect(roomProvider.create({ interviewId: 'iv-1', startsAt: START, minutes: 30, company: null })).rejects.toMatchObject({ name: 'ContractViolation' });
  });
});

describe('recording read-back and change', () => {
  it('maps auto_recording: none = off, cloud or local = on, missing or blank = cannot tell', () => {
    expect([recordingFrom({ auto_recording: 'none' }), recordingFrom({ auto_recording: 'cloud' }), recordingFrom({ auto_recording: 'local' })]).toEqual(['off', 'on', 'on']);
    expect([recordingFrom({}), recordingFrom({ auto_recording: ' ' }), recordingFrom(null), recordingFrom(undefined)]).toEqual([null, null, null, null]);
  });
  it('GETs the meeting through the Zoom client and reads its settings', async () => {
    mockApi.mockResolvedValue({ id: 1, settings: { auto_recording: 'cloud' } });
    expect(await roomProvider.recording('zm 1')).toBe('on');
    expect(mockApi).toHaveBeenCalledWith('GET', '/meetings/zm%201');
  });
  it('a failed GET or a body without settings is cannot tell (and the failure is logged)', async () => {
    mockApi.mockRejectedValueOnce(Object.assign(new Error('Zoom API error 403'), { name: 'AuthError' })).mockResolvedValueOnce(undefined);
    expect(await roomProvider.recording('zm-1')).toBeNull();
    expect(await roomProvider.recording('zm-1')).toBeNull();
    expect(String((console.warn as jest.Mock).mock.calls[0][0])).toContain('placement_room_readback_failed');
  });
  it('setRecording PATCHes through zoomService.updateMeeting with only the recording field', async () => {
    await roomProvider.setRecording('zm-1', 'none');
    expect(mockUpdate).toHaveBeenCalledWith('zm-1', { autoRecording: 'none' });
  });
  it('joinUrl asks the meeting provider', async () => {
    mockJoin.mockResolvedValue(SENTINEL_PROVIDER_URL);
    expect(await roomProvider.joinUrl('zm-1')).toBe(SENTINEL_PROVIDER_URL);
  });
});
