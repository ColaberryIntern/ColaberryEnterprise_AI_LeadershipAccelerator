/**
 * Regression coverage for the "Watch recording" button, which has been broken
 * twice in different ways.
 *
 * ROUND ONE (fixed earlier). LiveSession.recording_url is normally a RELATIVE,
 * Bearer-gated API path (`/api/portal/community/rooms/:roomId/resources/:id/download`,
 * written by sessionRecordingService.ingestRecordingForSession). Every consumer
 * rendered it straight into `<a href target="_blank">`, a plain navigation that
 * does not carry the Authorization header, so the tab landed on
 * `401 {"error":"Authentication required"}`.
 *
 * ROUND TWO (fixed here, reported by a student 2026-11-18). The fix for round
 * one fetched the whole file as a Blob. For a 2 MB PDF that is fine. The
 * November 12 class recording is 830 MB, so nothing played until every byte was
 * in browser memory: no progress, no seeking, 82 students in that cohort
 * staring at a blank tab. Playback now goes through a short-lived signed URL so
 * the browser streams the file natively.
 *
 * The branches that matter: an absolute provider URL is opened directly, a
 * relative path is turned into a signed stream URL WITHOUT downloading
 * anything, and the blob path survives only as a fallback for a backend that
 * does not offer /playback.
 */

const mockGet = jest.fn();
jest.mock('../utils/portalApi', () => ({
  __esModule: true,
  default: { get: (...a: unknown[]) => mockGet(...a), defaults: { baseURL: '' } },
}));

import { openSessionRecording } from './roomsApi';

const REL = '/api/portal/community/rooms/room-1/resources/res-1/download';
const PLAYBACK = '/api/portal/community/rooms/room-1/resources/res-1/playback';
const STREAM = '/api/portal/community/rooms/room-1/resources/res-1/stream?t=v1.payload.sig';

describe('openSessionRecording', () => {
  let openSpy: jest.SpyInstance;
  let createObjectURL: jest.Mock;
  let tab: { location: { href: string }; close: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    createObjectURL = jest.fn(() => 'blob:fake-url');
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = jest.fn();
    tab = { location: { href: '' }, close: jest.fn() };
    openSpy = jest.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
  });
  afterEach(() => openSpy.mockRestore());

  it('opens an absolute provider URL directly, without hitting the authenticated client', async () => {
    await openSessionRecording('https://zoom.example.com/rec/abc', 'Week 2');

    expect(openSpy).toHaveBeenCalledWith('https://zoom.example.com/rec/abc', '_blank', 'noopener,noreferrer');
    expect(mockGet).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('asks for a signed playback URL and points the tab at it, downloading nothing', async () => {
    mockGet.mockResolvedValue({ data: { url: STREAM, expires_at: '2026-11-19T02:00:00.000Z' } });

    await openSessionRecording(REL, 'Week 2');

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith(PLAYBACK);
    expect(tab.location.href).toBe(`http://localhost${STREAM}`);
    // The whole point of this change: no blob, so no 830 MB sitting in memory.
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('never requests the file itself with responseType blob on the happy path', async () => {
    mockGet.mockResolvedValue({ data: { url: STREAM } });

    await openSessionRecording(REL, 'Week 2');

    const blobCalls = mockGet.mock.calls.filter((c) => (c[1] as { responseType?: string } | undefined)?.responseType === 'blob');
    expect(blobCalls).toEqual([]);
  });

  it('opens the tab synchronously, before awaiting anything, so the popup blocker does not eat it', async () => {
    const order: string[] = [];
    openSpy.mockImplementation(() => { order.push('open'); return tab as unknown as Window; });
    mockGet.mockImplementation(() => { order.push('fetch'); return Promise.resolve({ data: { url: STREAM } }); });

    await openSessionRecording(REL, 'Week 2');

    expect(order).toEqual(['open', 'fetch']);
  });

  it('falls back to the blob path when the backend has no /playback route', async () => {
    mockGet
      .mockRejectedValueOnce(Object.assign(new Error('404'), { response: { status: 404 } }))
      .mockResolvedValueOnce({ data: new Blob(['x'], { type: 'video/mp4' }) });

    await openSessionRecording(REL, 'Week 2');

    expect(mockGet).toHaveBeenNthCalledWith(1, PLAYBACK);
    expect(mockGet).toHaveBeenNthCalledWith(2, REL, { responseType: 'blob' });
    expect(createObjectURL).toHaveBeenCalled();
  });

  it('closes the placeholder tab and rethrows when both paths fail, so the caller can show an error', async () => {
    mockGet.mockRejectedValue(new Error('401'));

    await expect(openSessionRecording(REL, 'Week 2')).rejects.toThrow('401');
    expect(tab.close).toHaveBeenCalled();
  });

  it('keeps the fallback blob URL alive well past a minute, so a reload mid-watch is not a dead link', async () => {
    jest.useFakeTimers();
    const revoke = jest.fn();
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = revoke;
    mockGet
      .mockRejectedValueOnce(new Error('404'))
      .mockResolvedValueOnce({ data: new Blob(['x']) });

    await openSessionRecording(REL, 'Week 2');

    jest.advanceTimersByTime(60_000);
    expect(revoke).not.toHaveBeenCalled();
    jest.advanceTimersByTime(3_600_000);
    expect(revoke).toHaveBeenCalled();
    jest.useRealTimers();
  });
});
