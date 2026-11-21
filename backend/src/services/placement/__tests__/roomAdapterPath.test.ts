jest.mock('../../../config/env', () => ({ env: { zoomHostEmail: 'host@refactored.example' } }));
// The idempotency ledger's DB calls: the claim is won (a fresh request), every other write answers nothing.
const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));
// The HTTP edge, and nothing else: the adapter, the ledger and zoomService.createMeeting all run for real.
const mockApi = jest.fn();
jest.mock('../../zoom/zoomApiClient', () => ({
  assertZoomConfigured: () => undefined,
  getZoomAccessToken: async () => 'tok',
  zoomApiRequest: (...a: unknown[]) => mockApi(...a),
}));

import { getMeetingProvider } from '../../communityRooms/meetingProvider';

/**
 * CP8.2b (execution contract, audit cycle 2: "The adapter path carries the recording setting"): through the REAL
 * ZoomMeetAdapter -> createMeetingIdempotent -> zoomService.createMeeting, a placement room is created with
 * auto_recording 'none', and the same path without the field (every community room) still sends 'cloud'.
 */
const input = { title: 'Interview', startAt: new Date('2026-11-23T15:00:00Z'), endAt: new Date('2026-11-23T15:30:00Z') };
const posted = () => mockApi.mock.calls.filter((c) => c[0] === 'POST').map((c) => c[2] as { settings: Record<string, unknown>; start_time: string; agenda: string });

beforeEach(() => {
  mockQuery.mockReset().mockImplementation(async (sql: string) => (/INSERT INTO zoom_meeting_requests/.test(sql) ? [[{ request_id: 'r' }], 0] : [[], 0]));
  mockApi.mockReset().mockImplementation(async (_m: string, _p: string, b: { settings?: Record<string, unknown> }) =>
    ({ id: 555, join_url: 'https://zoom.example/j/555', settings: { join_before_host: true, waiting_room: false, ...(b?.settings ?? {}) } }));
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('the real Zoom adapter path', () => {
  it("autoRecording 'none' reaches the HTTP body as settings.auto_recording 'none', and the stored settings come back", async () => {
    const r = await getMeetingProvider('zoom').createMeeting({ ...input, requestId: 'placement-interview-iv-1-2026-11-23T15:00:00.000Z', autoRecording: 'none' });
    expect(posted()).toHaveLength(1);
    expect(posted()[0].settings.auto_recording).toBe('none');
    expect(posted()[0].start_time).toBe('2026-11-23T09:00:00'); // the instant as a Central wall clock (CST)
    expect(posted()[0].agenda).toContain('[req:placement-interview-iv-1-2026-11-23T15:00:00.000Z]');
    expect(r).toMatchObject({ providerEventId: '555', joinUrl: 'https://zoom.example/j/555', storedSettings: { auto_recording: 'none' } });
  });
  it("the same path without the field (community rooms) still sends 'cloud'", async () => {
    await getMeetingProvider('zoom').createMeeting({ ...input, requestId: 'room-booking-9' });
    expect(posted()[0].settings.auto_recording).toBe('cloud');
  });
  it('a replayed request makes no second create and reports no stored settings (cannot tell)', async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (/INSERT INTO zoom_meeting_requests/.test(sql)) return [[], 0];
      if (/SELECT request_id, state/.test(sql)) return [[{ request_id: 'r', state: 'created', meeting_id: '555', join_url: 'https://zoom.example/j/555', attempts: 0, host_email: '' }], 0];
      return [[], 0];
    });
    const r = await getMeetingProvider('zoom').createMeeting({ ...input, requestId: 'placement-interview-iv-1-x', autoRecording: 'none' });
    expect(posted()).toHaveLength(0);
    expect(r.storedSettings ?? null).toBeNull();
  });
});
