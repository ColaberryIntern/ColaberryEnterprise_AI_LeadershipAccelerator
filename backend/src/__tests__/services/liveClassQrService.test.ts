/**
 * postLiveClassQrToRoom (2026-07-30) — the session-lifecycle cron calls this
 * once per session right after flipping it to 'live'. Idempotency matters: the
 * cron runs every 5 minutes and could plausibly re-mark/re-process a session
 * (or run concurrently with another instance), so a student must never see
 * the QR posted twice.
 */

jest.mock('../../models', () => ({
  __esModule: true,
  CommunityRoom: { findOne: jest.fn() },
}));

const mockBuildSessionKit = jest.fn();
jest.mock('../../services/sessionKitService', () => ({
  buildSessionKit: (...a: any[]) => mockBuildSessionKit(...a),
}));

const mockPostSystemMessage = jest.fn();
jest.mock('../../services/communityRooms/roomMessageService', () => ({
  postSystemMessage: (...a: any[]) => mockPostSystemMessage(...a),
}));

import { CommunityRoom } from '../../models';
import { postLiveClassQrToRoom } from '../../services/liveClassQrService';

const roomFindOne = CommunityRoom.findOne as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('postLiveClassQrToRoom', () => {
  const session = { id: 's1' } as any;

  it('posts the check-in QR link as a marked system message when a room exists', async () => {
    roomFindOne.mockResolvedValue({ id: 'room-1' });
    mockBuildSessionKit.mockResolvedValue({ checkin_url: 'https://enterprise.colaberry.ai/portal/class-checkin/s1' });

    await postLiveClassQrToRoom(session);

    expect(roomFindOne).toHaveBeenCalledWith({ where: { linked_live_session_id: 's1' } });
    expect(mockPostSystemMessage).toHaveBeenCalledWith(
      'room-1',
      expect.stringContaining('https://enterprise.colaberry.ai/portal/class-checkin/s1'),
      { marker: 'session-live-qr:s1' },
    );
  });

  it('is a no-op when the session has no provisioned room (left-join gap)', async () => {
    roomFindOne.mockResolvedValue(null);

    await postLiveClassQrToRoom(session);

    expect(mockBuildSessionKit).not.toHaveBeenCalled();
    expect(mockPostSystemMessage).not.toHaveBeenCalled();
  });

  it('is a no-op when the session kit cannot be built', async () => {
    roomFindOne.mockResolvedValue({ id: 'room-1' });
    mockBuildSessionKit.mockResolvedValue(null);

    await postLiveClassQrToRoom(session);

    expect(mockPostSystemMessage).not.toHaveBeenCalled();
  });

  it('relies on postSystemMessage\'s own marker idempotency — calling twice still only calls through twice, dedup is the mocked collaborator\'s job', async () => {
    // postLiveClassQrToRoom itself is a thin, stateless wrapper; the actual
    // once-only guarantee lives in postSystemMessage (tested there). This just
    // confirms the same marker is passed every call, so that guarantee applies.
    roomFindOne.mockResolvedValue({ id: 'room-1' });
    mockBuildSessionKit.mockResolvedValue({ checkin_url: 'https://x/y' });

    await postLiveClassQrToRoom(session);
    await postLiveClassQrToRoom(session);

    expect(mockPostSystemMessage).toHaveBeenNthCalledWith(1, 'room-1', expect.any(String), { marker: 'session-live-qr:s1' });
    expect(mockPostSystemMessage).toHaveBeenNthCalledWith(2, 'room-1', expect.any(String), { marker: 'session-live-qr:s1' });
  });
});
