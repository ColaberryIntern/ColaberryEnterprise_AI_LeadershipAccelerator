/**
 * The failover: one bad pool host costs a retry, not a room.
 *
 * On 2026-11-02 three of seven pool hosts could not produce an enterable meeting, and
 * the allocator takes hosts in priority order, so the SECOND host it ever reached was
 * one of them. A check that stopped at the first bad host would have failed exactly
 * as badly as no check at all. These tests pin the walk, the demotion, the bound, and
 * the cases where failing over would be the wrong answer.
 */

jest.mock('../../zoomService', () => ({ createMeeting: jest.fn() }));
jest.mock('../roomHostAllocator', () => ({
  reserveRoomHost: jest.fn(),
  releaseRoomHost: jest.fn(async () => undefined),
}));
jest.mock('../zoomHostRegistry', () => ({ markHostUnusable: jest.fn(async () => undefined) }));

import { createMeeting } from '../../zoomService';
import { MAX_HOST_ATTEMPTS, mintEnterableRoomLink } from '../enterableRoomMint';
import { releaseRoomHost, reserveRoomHost } from '../roomHostAllocator';
import { ZoomMeetingNotEnterableError } from '../zoomMeetingSettings';
import { markHostUnusable } from '../zoomHostRegistry';

const createMeetingMock = createMeeting as jest.Mock;
const reserveRoomHostMock = reserveRoomHost as jest.Mock;
const releaseRoomHostMock = releaseRoomHost as jest.Mock;
const markHostUnusableMock = markHostUnusable as jest.Mock;

const ROOM_ID = 'room-uuid-1';
const MEETING = {
  topic: 'Colaberry — Colaberry AI Sessions',
  agenda: 'Public AI community sessions',
  startDateTime: '2026-11-14T10:00:00',
  durationMinutes: 525600,
  timezone: 'America/Chicago',
};

const ok = (id: string) => ({
  joinUrl: `https://zoom.us/j/${id}`,
  meetingId: id,
  storedSettings: { waiting_room: false, join_before_host: true },
  enterableWithoutHost: true as const,
});

const unenterable = (host: string) =>
  new ZoomMeetingNotEnterableError(host, '85910290895', { waiting_room: true });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore?.();
});

describe('mintEnterableRoomLink — the happy path', () => {
  it('mints once on the reserved host and demotes nobody', async () => {
    reserveRoomHostMock.mockResolvedValue('program.101@colaberry.com');
    createMeetingMock.mockResolvedValue(ok('84776284115'));

    const out = await mintEnterableRoomLink({ roomId: ROOM_ID, meeting: MEETING });

    expect(out.hostEmail).toBe('program.101@colaberry.com');
    expect(out.result.meetingId).toBe('84776284115');
    expect(out.demotedHosts).toEqual([]);
    expect(createMeetingMock).toHaveBeenCalledTimes(1);
    expect(markHostUnusableMock).not.toHaveBeenCalled();
    expect(releaseRoomHostMock).not.toHaveBeenCalled();
  });

  it('always asks createMeeting to enforce enterability', async () => {
    reserveRoomHostMock.mockResolvedValue('program.101@colaberry.com');
    createMeetingMock.mockResolvedValue(ok('1'));

    await mintEnterableRoomLink({ roomId: ROOM_ID, meeting: MEETING });

    expect(createMeetingMock).toHaveBeenCalledWith(
      expect.objectContaining({ requireEnterableWithoutHost: true, hostEmail: 'program.101@colaberry.com' }),
    );
  });

  it('passes NO hostEmail when the pool is empty, preserving the pre-pool behaviour', async () => {
    reserveRoomHostMock.mockResolvedValue(null);
    createMeetingMock.mockResolvedValue(ok('1'));

    const out = await mintEnterableRoomLink({ roomId: ROOM_ID, meeting: MEETING });

    expect(out.hostEmail).toBeNull();
    expect(createMeetingMock.mock.calls[0][0]).not.toHaveProperty('hostEmail');
  });
});

describe('mintEnterableRoomLink — failing over', () => {
  it('demotes the bad host, releases the reservation and lands on the next one', async () => {
    // Exactly the production shape: program.102 forces a waiting room, the next host does not.
    reserveRoomHostMock
      .mockResolvedValueOnce('program.102@colaberry.com')
      .mockResolvedValueOnce('program.103@colaberry.com');
    createMeetingMock
      .mockRejectedValueOnce(unenterable('program.102@colaberry.com'))
      .mockResolvedValueOnce(ok('99999'));

    const out = await mintEnterableRoomLink({ roomId: ROOM_ID, meeting: MEETING });

    expect(out.hostEmail).toBe('program.103@colaberry.com');
    expect(out.result.meetingId).toBe('99999');
    expect(out.demotedHosts).toEqual(['program.102@colaberry.com']);
    expect(markHostUnusableMock).toHaveBeenCalledWith(
      'program.102@colaberry.com',
      expect.stringContaining('waiting room'),
    );
    // Without the release, reserveRoomHost would hand back the same dead host forever.
    expect(releaseRoomHostMock).toHaveBeenCalledWith(ROOM_ID);
  });

  it('walks past more than one bad host, because three of seven really were bad', async () => {
    reserveRoomHostMock
      .mockResolvedValueOnce('program.102@colaberry.com')
      .mockResolvedValueOnce('program.103@colaberry.com')
      .mockResolvedValueOnce('support@colaberry.com')
      .mockResolvedValueOnce('ali@refactored.ai');
    createMeetingMock
      .mockRejectedValueOnce(unenterable('program.102@colaberry.com'))
      .mockRejectedValueOnce(unenterable('program.103@colaberry.com'))
      .mockRejectedValueOnce(unenterable('support@colaberry.com'))
      .mockResolvedValueOnce(ok('77777'));

    const out = await mintEnterableRoomLink({ roomId: ROOM_ID, meeting: MEETING });

    expect(out.hostEmail).toBe('ali@refactored.ai');
    expect(out.demotedHosts).toHaveLength(3);
  });

  it('gives up after MAX_HOST_ATTEMPTS rather than walking a pool forever', async () => {
    reserveRoomHostMock.mockImplementation(async () => `host-${reserveRoomHostMock.mock.calls.length}@x.com`);
    createMeetingMock.mockImplementation(async () => { throw unenterable('whoever@x.com'); });

    await expect(mintEnterableRoomLink({ roomId: ROOM_ID, meeting: MEETING }))
      .rejects.toBeInstanceOf(ZoomMeetingNotEnterableError);

    expect(createMeetingMock).toHaveBeenCalledTimes(MAX_HOST_ATTEMPTS);
    expect(markHostUnusableMock).toHaveBeenCalledTimes(MAX_HOST_ATTEMPTS);
  });

  it('does NOT demote or retry when there was no pool host to blame', async () => {
    // The mint used the configured default. Demoting nothing and failing fast sends
    // the operator to the default account's settings instead of to the registry.
    reserveRoomHostMock.mockResolvedValue(null);
    createMeetingMock.mockRejectedValue(unenterable('ali@refactored.ai'));

    await expect(mintEnterableRoomLink({ roomId: ROOM_ID, meeting: MEETING }))
      .rejects.toBeInstanceOf(ZoomMeetingNotEnterableError);

    expect(createMeetingMock).toHaveBeenCalledTimes(1);
    expect(markHostUnusableMock).not.toHaveBeenCalled();
  });
});

describe('mintEnterableRoomLink — errors that are not the host\'s fault', () => {
  it('propagates a Zoom outage untouched and empties nobody from the pool', async () => {
    reserveRoomHostMock.mockResolvedValue('program.101@colaberry.com');
    createMeetingMock.mockRejectedValue(new Error('Zoom API error 429: Too Many Requests'));

    await expect(mintEnterableRoomLink({ roomId: ROOM_ID, meeting: MEETING }))
      .rejects.toThrow('429');

    expect(createMeetingMock).toHaveBeenCalledTimes(1);
    expect(markHostUnusableMock).not.toHaveBeenCalled();
    expect(releaseRoomHostMock).not.toHaveBeenCalled();
  });
});
