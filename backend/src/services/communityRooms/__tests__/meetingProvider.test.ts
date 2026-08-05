jest.mock('../../zoomService', () => ({
  createMeeting: jest.fn(),
  updateMeeting: jest.fn(),
  cancelMeeting: jest.fn(),
  getMeetingJoinUrl: jest.fn(),
}));
jest.mock('googleapis', () => ({ google: { auth: { JWT: jest.fn() }, calendar: jest.fn() } }));
jest.mock('../../../config/env', () => ({ env: {} }));

import * as zoomService from '../../zoomService';
import { ZoomMeetAdapter, getMeetingProvider } from '../meetingProvider';

/**
 * ZoomMeetAdapter — the general Room-booking MeetingProvider implementation
 * (used by roomOutboxHandlers.ensureBookingMeeting for every non-class Room
 * booking: the "+ Book a session" flow, Video rooms like Grape Gallery,
 * etc.). This is separate from meetingService.ts's LiveSession-specific
 * flow — both now go through zoomService.ts's shared OAuth/fetch plumbing,
 * but this adapter is the one this test exercises. zoomService itself is
 * mocked; its own real-API behavior is covered by zoomService.test.ts.
 */

const createMeetingMock = zoomService.createMeeting as jest.Mock;
const updateMeetingMock = zoomService.updateMeeting as jest.Mock;
const cancelMeetingMock = zoomService.cancelMeeting as jest.Mock;
const getJoinUrlMock = zoomService.getMeetingJoinUrl as jest.Mock;

describe('ZoomMeetAdapter', () => {
  const adapter = new ZoomMeetAdapter();

  beforeEach(() => jest.clearAllMocks());

  it('createMeeting: derives duration from startAt/endAt and maps the result', async () => {
    createMeetingMock.mockResolvedValue({ meetingId: '123', joinUrl: 'https://zoom.us/j/123' });

    const result = await adapter.createMeeting({
      title: 'Study Group',
      description: 'Weekly review',
      startAt: new Date('2026-08-04T18:30:00Z'),
      endAt: new Date('2026-08-04T20:00:00Z'), // 90 min later
      requestId: 'booking-1',
    });

    expect(createMeetingMock).toHaveBeenCalledWith({
      topic: 'Study Group',
      agenda: 'Weekly review',
      startDateTime: '2026-08-04T18:30:00',
      durationMinutes: 90,
      timezone: 'America/Chicago',
    });
    expect(result).toEqual({ providerEventId: '123', joinUrl: 'https://zoom.us/j/123' });
  });

  it('createMeeting: honors an explicit timezone over the default', async () => {
    createMeetingMock.mockResolvedValue({ meetingId: '1', joinUrl: null });
    await adapter.createMeeting({
      title: 'x', startAt: new Date('2026-08-04T18:30:00Z'), endAt: new Date('2026-08-04T19:00:00Z'),
      timezone: 'America/New_York', requestId: 'b1',
    });
    expect(createMeetingMock.mock.calls[0][0].timezone).toBe('America/New_York');
  });

  it('updateMeeting: maps only the patched fields and recomputes duration when both times are present', async () => {
    await adapter.updateMeeting('123', {
      title: 'New title',
      startAt: new Date('2026-08-04T19:00:00Z'),
      endAt: new Date('2026-08-04T19:45:00Z'),
    });
    expect(updateMeetingMock).toHaveBeenCalledWith('123', {
      topic: 'New title',
      startDateTime: '2026-08-04T19:00:00',
      durationMinutes: 45,
    });
  });

  it('updateMeeting: omits durationMinutes when only one of startAt/endAt is patched', async () => {
    await adapter.updateMeeting('123', { description: 'Updated agenda' });
    expect(updateMeetingMock).toHaveBeenCalledWith('123', { agenda: 'Updated agenda' });
  });

  it('cancelMeeting and getJoinUrl delegate directly to zoomService', async () => {
    await adapter.cancelMeeting('123');
    expect(cancelMeetingMock).toHaveBeenCalledWith('123');

    getJoinUrlMock.mockResolvedValue('https://zoom.us/j/123');
    await expect(adapter.getJoinUrl('123')).resolves.toBe('https://zoom.us/j/123');
  });

  it('getAttendance/getRecording are not wired for general Room bookings yet (parity with GoogleMeetAdapter)', async () => {
    await expect(adapter.getAttendance()).resolves.toEqual([]);
    await expect(adapter.getRecording()).resolves.toBeNull();
  });

  it('does not claim embedded/breakout support', () => {
    expect(adapter.supportsEmbedded()).toBe(false);
    expect(adapter.supportsBreakouts()).toBe(false);
  });
});

describe('getMeetingProvider factory (Zoom default)', () => {
  it('resolves "zoom" to a ZoomMeetAdapter', () => {
    expect(getMeetingProvider('zoom')).toBeInstanceOf(ZoomMeetAdapter);
  });

  it('defaults to zoom for undefined/null/unknown provider names', () => {
    expect(getMeetingProvider()).toBeInstanceOf(ZoomMeetAdapter);
    expect(getMeetingProvider(null)).toBeInstanceOf(ZoomMeetAdapter);
    expect(getMeetingProvider('unknown-provider')).toBeInstanceOf(ZoomMeetAdapter);
  });
});
