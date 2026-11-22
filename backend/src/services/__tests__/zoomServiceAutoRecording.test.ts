jest.mock('../../config/env', () => ({ env: { zoomHostEmail: 'host@refactored.example' } }));
const mockApi = jest.fn();
jest.mock('../zoom/zoomApiClient', () => ({
  assertZoomConfigured: () => undefined,
  getZoomAccessToken: async () => 'tok',
  zoomApiRequest: (...a: unknown[]) => mockApi(...a),
}));

import { createMeeting, createMeetingForSession, updateMeeting } from '../zoomService';

/**
 * Career Prep v27, CP8.2b (execution contract: "Recording is off from the moment a room exists"): the optional
 * autoRecording on createMeeting and updateMeeting. Absent must stay 'cloud' for every existing caller (official classes
 * through createMeetingForSession, community rooms through the adapter), or classes silently stop recording.
 */
const ROOM = { topic: 'Interview', startDateTime: '2026-11-23T09:00:00', durationMinutes: 30, timezone: 'America/Chicago' };
const body = () => mockApi.mock.calls[0][2] as { settings: Record<string, unknown> };

beforeEach(() => {
  mockApi.mockReset().mockImplementation(async (_m: string, _p: string, b: { settings?: Record<string, unknown> }) =>
    ({ id: 123, join_url: 'https://zoom.example/j/123', settings: { join_before_host: true, waiting_room: false, ...(b?.settings ?? {}) } }));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('zoomService autoRecording', () => {
  it("absent: the create body still asks for auto_recording 'cloud' (existing callers unchanged)", async () => {
    await createMeeting(ROOM);
    expect(mockApi.mock.calls[0][0]).toBe('POST');
    expect(body().settings).toEqual({ auto_recording: 'cloud', join_before_host: true, waiting_room: false });
  });
  it("the official class path (createMeetingForSession) still sends 'cloud'", async () => {
    const session = { id: 's-1', title: 'Week 3', meeting_link: null, update: jest.fn() };
    await createMeetingForSession(session as never, { startDateTime: '2026-11-23T18:30:00', durationMinutes: 120 });
    expect(body().settings.auto_recording).toBe('cloud');
  });
  it("'none': the create body asks for no recording, and the read-back stores it", async () => {
    const r = await createMeeting({ ...ROOM, autoRecording: 'none' });
    expect(body().settings.auto_recording).toBe('none');
    expect(r.storedSettings).toMatchObject({ auto_recording: 'none' });
  });
  it('update: autoRecording becomes settings.auto_recording; absent sends no settings at all', async () => {
    await updateMeeting('123', { autoRecording: 'cloud' });
    expect(mockApi).toHaveBeenLastCalledWith('PATCH', '/meetings/123', { settings: { auto_recording: 'cloud' } });
    await updateMeeting('123', { topic: 'x' });
    expect(mockApi).toHaveBeenLastCalledWith('PATCH', '/meetings/123', { topic: 'x' });
  });
});
