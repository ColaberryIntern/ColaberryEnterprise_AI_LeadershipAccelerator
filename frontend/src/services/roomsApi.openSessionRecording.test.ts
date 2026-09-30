/**
 * Regression coverage for the dead "Watch recording" button.
 *
 * LiveSession.recording_url is normally a RELATIVE, Bearer-gated API path
 * (`/api/portal/community/rooms/:roomId/resources/:id/download`, written by
 * sessionRecordingService.ingestRecordingForSession). Every consumer rendered
 * it straight into `<a href target="_blank">`, which is a plain browser
 * navigation and does not carry the Authorization header — so the tab landed
 * on `401 {"error":"Authentication required"}` and the button looked dead.
 * Confirmed against production before the fix.
 *
 * The two branches that matter: a relative path must go through the
 * authenticated client, and an absolute provider URL must NOT (there is no
 * token to send to a third party, and blob-fetching it would break CORS).
 */

const mockGet = jest.fn();
jest.mock('../utils/portalApi', () => ({ __esModule: true, default: { get: (...a: unknown[]) => mockGet(...a) } }));

import { openSessionRecording } from './roomsApi';

const REL = '/api/portal/community/rooms/room-1/resources/res-1/download';

describe('openSessionRecording', () => {
  let openSpy: jest.SpyInstance;
  let createObjectURL: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    createObjectURL = jest.fn(() => 'blob:fake-url');
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = createObjectURL;
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = jest.fn();
    openSpy = jest.spyOn(window, 'open').mockReturnValue({ location: { href: '' }, close: jest.fn() } as unknown as Window);
  });
  afterEach(() => openSpy.mockRestore());

  it('opens an absolute provider URL directly, without hitting the authenticated client', async () => {
    await openSessionRecording('https://zoom.example.com/rec/abc', 'Week 2');

    expect(openSpy).toHaveBeenCalledWith('https://zoom.example.com/rec/abc', '_blank', 'noopener,noreferrer');
    expect(mockGet).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('fetches a relative API path through the authenticated client as a blob', async () => {
    mockGet.mockResolvedValue({ data: new Blob(['x'], { type: 'video/mp4' }) });

    await openSessionRecording(REL, 'Week 2');

    expect(mockGet).toHaveBeenCalledWith(REL, { responseType: 'blob' });
    expect(createObjectURL).toHaveBeenCalled();
  });

  it('opens the tab synchronously, before awaiting the fetch, so the popup blocker does not eat it', async () => {
    const order: string[] = [];
    openSpy.mockImplementation(() => { order.push('open'); return { location: { href: '' }, close: jest.fn() } as unknown as Window; });
    mockGet.mockImplementation(() => { order.push('fetch'); return Promise.resolve({ data: new Blob(['x']) }); });

    await openSessionRecording(REL, 'Week 2');

    expect(order).toEqual(['open', 'fetch']);
  });

  it('closes the placeholder tab and rethrows when the download fails, so the caller can show an error', async () => {
    const close = jest.fn();
    openSpy.mockReturnValue({ location: { href: '' }, close } as unknown as Window);
    mockGet.mockRejectedValue(new Error('401'));

    await expect(openSessionRecording(REL, 'Week 2')).rejects.toThrow('401');
    expect(close).toHaveBeenCalled();
  });
});
