/**
 * Reese Phase 2 — initiate_dm capability tests. Confirms this is a thin
 * wrapper around Phase 1's own openDm()/sendDmMessage() (no new send
 * plumbing), always sending AS Reese's real enrollment identity, to the real
 * student enrollment id passed in.
 */
jest.mock('../reeseIdentitySeed', () => ({ getReeseEnrollmentId: jest.fn() }));
jest.mock('../../communityRooms/dmService', () => ({
  openDm: jest.fn(),
  sendDmMessage: jest.fn(),
}));

import { getReeseEnrollmentId } from '../reeseIdentitySeed';
import { openDm, sendDmMessage } from '../../communityRooms/dmService';
import { initiateDm, ReeseOutreachError } from '../reeseInitiateDmService';

const mockGetReeseEnrollmentId = getReeseEnrollmentId as unknown as jest.Mock;
const mockOpenDm = openDm as unknown as jest.Mock;
const mockSendDmMessage = sendDmMessage as unknown as jest.Mock;

const REESE_ENROLLMENT_ID = 'reese-enrollment-1';
const STUDENT_ENROLLMENT_ID = 'student-1';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetReeseEnrollmentId.mockResolvedValue(REESE_ENROLLMENT_ID);
  mockOpenDm.mockResolvedValue({ roomId: 'room-1' });
  mockSendDmMessage.mockResolvedValue({ id: 'message-1' });
});

describe('initiateDm', () => {
  it('happy path: opens the DM as Reese and sends the real content, reusing openDm/sendDmMessage exactly', async () => {
    const result = await initiateDm(STUDENT_ENROLLMENT_ID, 'Hey, checking in on your progress.');

    expect(mockOpenDm).toHaveBeenCalledWith(REESE_ENROLLMENT_ID, STUDENT_ENROLLMENT_ID, null);
    expect(mockSendDmMessage).toHaveBeenCalledWith(
      { enrollmentId: REESE_ENROLLMENT_ID, cohortId: null, isAdmin: false },
      'room-1',
      'Hey, checking in on your progress.',
    );
    expect(result).toEqual({ roomId: 'room-1', messageId: 'message-1' });
  });

  it('sends AS Reese, never as the student — the sender identity in every call is Reese\'s enrollment id, not the recipient\'s', async () => {
    await initiateDm(STUDENT_ENROLLMENT_ID, 'content');
    const [senderArg] = mockOpenDm.mock.calls[0];
    expect(senderArg).toBe(REESE_ENROLLMENT_ID);
    expect(senderArg).not.toBe(STUDENT_ENROLLMENT_ID);
    const [ctxArg] = mockSendDmMessage.mock.calls[0];
    expect(ctxArg.enrollmentId).toBe(REESE_ENROLLMENT_ID);
  });

  it('failure path: throws a clear ReeseOutreachError if Reese\'s identity is not seeded yet, and never calls openDm/sendDmMessage', async () => {
    mockGetReeseEnrollmentId.mockResolvedValue(null);

    await expect(initiateDm(STUDENT_ENROLLMENT_ID, 'content')).rejects.toBeInstanceOf(ReeseOutreachError);
    expect(mockOpenDm).not.toHaveBeenCalled();
    expect(mockSendDmMessage).not.toHaveBeenCalled();
  });

  it('idempotency: calling twice for the same student reuses the same room (openDm itself is find-or-create) and posts two distinct messages, not a duplicate', async () => {
    mockOpenDm.mockResolvedValue({ roomId: 'room-1' }); // same room both times, as openDm's real find-or-create behavior guarantees
    mockSendDmMessage
      .mockResolvedValueOnce({ id: 'message-1' })
      .mockResolvedValueOnce({ id: 'message-2' });

    const first = await initiateDm(STUDENT_ENROLLMENT_ID, 'first message');
    const second = await initiateDm(STUDENT_ENROLLMENT_ID, 'second message');

    expect(first.roomId).toBe(second.roomId);
    expect(first.messageId).not.toBe(second.messageId);
    expect(mockSendDmMessage).toHaveBeenCalledTimes(2);
  });
});
