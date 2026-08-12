/**
 * dmService unit tests — 1:1 DMs over a 2-person private room. Room models +
 * message service mocked; no DB I/O.
 */

jest.mock('../../models/CommunityRoom', () => ({ findOrCreate: jest.fn(), findByPk: jest.fn(), findAll: jest.fn() }));
jest.mock('../../models/RoomMembership', () => ({ findOrCreate: jest.fn(), findAll: jest.fn(), update: jest.fn(), findOne: jest.fn() }));
jest.mock('../../models/RoomMessage', () => ({ findOne: jest.fn() }));
jest.mock('../../models/Enrollment', () => ({ findByPk: jest.fn() }));
jest.mock('../../services/communityRooms/roomMessageService', () => ({ postMessage: jest.fn(), listMessages: jest.fn() }));
jest.mock('../../services/access/staffAccess', () => ({ isStaffOrMgmt: jest.fn() }));
jest.mock('../../services/reese/reeseIdentitySeed', () => ({ getReeseEnrollmentId: jest.fn() }));
// dmService.ts dynamically imports reeseReplyService.ts inside sendDmMessage().
// Mock the WHOLE module here (its own internals — the loop guard, scope guard,
// LLM call — are unit-tested independently in reeseReplyService.test.ts) so
// this file only asserts dmService.ts calls it correctly, and so the dynamic
// import never pulls in the real model-association graph (reeseSystemPrompt ->
// learnerContextService -> models/index.ts) into this mocked test environment.
jest.mock('../../services/reese/reeseReplyService', () => ({ maybeTriggerReeseReply: jest.fn() }));
// sendDmMessage() dynamically imports communityNotificationService the same
// way it dynamically imports reeseReplyService above — mock the whole module
// so this file only asserts dmService.ts calls it correctly (its own
// internals are unit-tested in communityNotificationService.test.ts).
jest.mock('../../services/communityNotificationService', () => ({ createNotification: jest.fn() }));

import { openDm, sendDmMessage, listDmMessages, listConversations, markDmRead } from '../../services/communityRooms/dmService';
import { createNotification } from '../../services/communityNotificationService';
import { openDm, sendDmMessage, listDmMessages, listConversations, markDmRead, touchDmTyping } from '../../services/communityRooms/dmService';
import CommunityRoom from '../../models/CommunityRoom';
import RoomMembership from '../../models/RoomMembership';
import RoomMessage from '../../models/RoomMessage';
import Enrollment from '../../models/Enrollment';
import { postMessage, listMessages } from '../../services/communityRooms/roomMessageService';
import { isStaffOrMgmt } from '../../services/access/staffAccess';
import { getReeseEnrollmentId } from '../../services/reese/reeseIdentitySeed';
import { maybeTriggerReeseReply } from '../../services/reese/reeseReplyService';

const findOrCreateRoom = CommunityRoom.findOrCreate as jest.Mock;
const findByPkRoom = CommunityRoom.findByPk as jest.Mock;
const findAllRoom = CommunityRoom.findAll as jest.Mock;
const findOrCreateMember = RoomMembership.findOrCreate as jest.Mock;
const findAllMember = RoomMembership.findAll as jest.Mock;
const updateMember = RoomMembership.update as jest.Mock;
const findOneMember = RoomMembership.findOne as jest.Mock;
const findOneMsg = RoomMessage.findOne as jest.Mock;
const findByPkEnroll = Enrollment.findByPk as jest.Mock;
const postMock = postMessage as jest.Mock;
const listMock = listMessages as jest.Mock;
const isStaffOrMgmtMock = isStaffOrMgmt as jest.Mock;
const getReeseEnrollmentIdMock = getReeseEnrollmentId as jest.Mock;
const maybeTriggerReeseReplyMock = maybeTriggerReeseReply as jest.Mock;
const createNotificationMock = createNotification as jest.Mock;

const me = '11111111-1111-1111-1111-111111111111';
const other = '22222222-2222-2222-2222-222222222222';
const reese = '99999999-9999-9999-9999-999999999999';
const cohort = 'cohort-1';
const ctx = { enrollmentId: me, cohortId: cohort, isAdmin: false };
const [a, b] = [me, other].sort();

beforeEach(() => {
  jest.clearAllMocks();
  findByPkEnroll.mockResolvedValue({ id: other, cohort_id: cohort }); // same cohort
  findOrCreateRoom.mockResolvedValue([{ id: 'room-1' }, true]);
  findOrCreateMember.mockResolvedValue([{}, true]);
  isStaffOrMgmtMock.mockResolvedValue(false);
  // Reese's id is distinct from every other test identity by default, so
  // existing (pre-Reese) tests exercise the SAME rejection path they always did
  // — the bypass only activates when `me`/`otherId` literally equals it.
  getReeseEnrollmentIdMock.mockResolvedValue(reese);
  // No Reese membership by default — sendDmMessage's reply-trigger hook
  // (reeseReplyService.maybeTriggerReeseReply) no-ops cleanly in every
  // pre-existing test that isn't specifically testing Reese reply behavior.
  findOneMember.mockResolvedValue(null);
  maybeTriggerReeseReplyMock.mockResolvedValue(undefined);
  // Default DM-recipient-notification lookup: "other" is the sole other room
  // member, matching openDm's real 2-person room shape. Tests in the "inbox"
  // describe block override this with their own mockImplementation.
  findAllMember.mockResolvedValue([{ enrollment_id: other }]);
  createNotificationMock.mockResolvedValue(undefined);
});

describe('openDm', () => {
  it('happy: find-or-creates a dm room keyed on the sorted-pair slug and adds both as active members', async () => {
    const r = await openDm(me, other, cohort);
    expect(r).toEqual({ roomId: 'room-1' });
    expect(findOrCreateRoom.mock.calls[0][0].where).toEqual({ slug: `dm-${a}-${b}` });
    expect(findOrCreateRoom.mock.calls[0][0].defaults).toMatchObject({ room_type: 'dm', privacy: 'private', is_system: true });
    expect(findOrCreateMember).toHaveBeenCalledTimes(2);
    const memberIds = findOrCreateMember.mock.calls.map((c) => c[0].where.enrollment_id).sort();
    expect(memberIds).toEqual([a, b]);
    expect(findOrCreateMember.mock.calls[0][0].defaults).toMatchObject({ access_state: 'active', role: 'member' });
  });

  it('slug is order-independent: either person opens the SAME room', async () => {
    await openDm(me, other, cohort);
    const slug1 = findOrCreateRoom.mock.calls[0][0].where.slug;
    findOrCreateRoom.mockClear();
    findByPkEnroll.mockResolvedValue({ id: me, cohort_id: cohort });
    await openDm(other, me, cohort);
    expect(findOrCreateRoom.mock.calls[0][0].where.slug).toBe(slug1);
  });

  it('rejects a self-DM', async () => {
    await expect(openDm(me, me, cohort)).rejects.toMatchObject({ name: 'DmError' });
    expect(findOrCreateRoom).not.toHaveBeenCalled();
  });

  it('rejects a cross-cohort DM', async () => {
    findByPkEnroll.mockResolvedValue({ id: other, cohort_id: 'OTHER-COHORT' });
    await expect(openDm(me, other, cohort)).rejects.toMatchObject({ name: 'DmError' });
    expect(findOrCreateRoom).not.toHaveBeenCalled();
  });

  it('rejects when the caller has no cohort and is not staff/mgmt', async () => {
    await expect(openDm(me, other, null)).rejects.toMatchObject({ name: 'DmError', message: 'You are not in a cohort yet' });
    expect(findOrCreateRoom).not.toHaveBeenCalled();
  });

  it('staff/mgmt bypasses the cohort check and can DM a person in a different cohort', async () => {
    findByPkEnroll.mockResolvedValue({ id: other, cohort_id: 'OTHER-COHORT' });
    isStaffOrMgmtMock.mockResolvedValue(true);
    const r = await openDm(me, other, cohort);
    expect(r).toEqual({ roomId: 'room-1' });
  });

  it('staff/mgmt with no cohort of their own can still DM', async () => {
    isStaffOrMgmtMock.mockResolvedValue(true);
    const r = await openDm(me, other, null);
    expect(r).toEqual({ roomId: 'room-1' });
  });
});

describe('Reese Phase 1 — assertSameCohort identity-keyed bypass (T008)', () => {
  it('happy path: a non-staff student in one cohort can DM Reese, who has no cohort of their own', async () => {
    findByPkEnroll.mockResolvedValue({ id: reese, cohort_id: null }); // Reese's real enrollment shape
    isStaffOrMgmtMock.mockResolvedValue(false);
    const r = await openDm(me, reese, cohort);
    expect(r).toEqual({ roomId: 'room-1' });
  });

  it('happy path: Reese (as the DM opener) can reach a student in any cohort', async () => {
    findByPkEnroll.mockResolvedValue({ id: other, cohort_id: 'SOME-OTHER-COHORT' });
    isStaffOrMgmtMock.mockResolvedValue(false);
    const r = await openDm(reese, other, null);
    expect(r).toEqual({ roomId: 'room-1' });
  });

  it('regression/boundary: two ordinary students (neither Reese, neither staff) in different cohorts are STILL blocked exactly as before — the bypass never widens beyond Reese\'s specific id', async () => {
    findByPkEnroll.mockResolvedValue({ id: other, cohort_id: 'OTHER-COHORT' });
    isStaffOrMgmtMock.mockResolvedValue(false);
    // getReeseEnrollmentIdMock still resolves to `reese`, which matches neither
    // `me` nor `other` here — proves the bypass is inert for everyone but Reese.
    await expect(openDm(me, other, cohort)).rejects.toMatchObject({ name: 'DmError' });
    expect(findOrCreateRoom).not.toHaveBeenCalled();
  });

  it('boundary: still rejects a cross-cohort DM even if the Reese-id lookup itself fails/returns null (fail-closed, not fail-open)', async () => {
    getReeseEnrollmentIdMock.mockResolvedValue(null);
    findByPkEnroll.mockResolvedValue({ id: other, cohort_id: 'OTHER-COHORT' });
    isStaffOrMgmtMock.mockResolvedValue(false);
    await expect(openDm(me, other, cohort)).rejects.toMatchObject({ name: 'DmError' });
  });

  it('boundary: still rejects (as a clean DmError, not an unhandled crash) even if the Reese-id lookup THROWS', async () => {
    getReeseEnrollmentIdMock.mockRejectedValue(new Error('db connection reset'));
    findByPkEnroll.mockResolvedValue({ id: other, cohort_id: 'OTHER-COHORT' });
    isStaffOrMgmtMock.mockResolvedValue(false);
    await expect(openDm(me, other, cohort)).rejects.toMatchObject({ name: 'DmError' });
  });
});

describe('send / list guards', () => {
  it('sendDmMessage delegates to postMessage for a dm room, then invokes the Reese reply-trigger hook', async () => {
    findByPkRoom.mockResolvedValue({ id: 'room-1', room_type: 'dm' });
    postMock.mockResolvedValue({ id: 'm1', content: 'hi' });
    const m = await sendDmMessage(ctx, 'room-1', 'hi');
    expect(m).toEqual({ id: 'm1', content: 'hi' });
    expect(postMock).toHaveBeenCalledWith(ctx, 'room-1', { content: 'hi' });
    expect(maybeTriggerReeseReplyMock).toHaveBeenCalledWith('room-1', ctx.enrollmentId);
  });

  it('sendDmMessage still returns the posted message even if the Reese reply-trigger hook rejects (belt-and-suspenders — never breaks the sender\'s own request)', async () => {
    findByPkRoom.mockResolvedValue({ id: 'room-1', room_type: 'dm' });
    postMock.mockResolvedValue({ id: 'm1', content: 'hi' });
    // Simulates the hook violating its own "never throws" contract (e.g. a
    // future edit removes reeseReplyService.ts's internal try/catch) — the
    // call site's own try/catch must still protect the sender's message.
    maybeTriggerReeseReplyMock.mockRejectedValue(new Error('reply generation blew up'));

    const m = await sendDmMessage(ctx, 'room-1', 'hi');
    expect(m).toEqual({ id: 'm1', content: 'hi' });
  });

  it('refuses to send into a non-dm room (guards against posting to cohort rooms)', async () => {
    findByPkRoom.mockResolvedValue({ id: 'room-9', room_type: 'persistent' });
    await expect(sendDmMessage(ctx, 'room-9', 'hi')).rejects.toMatchObject({ name: 'DmError' });
    expect(postMock).not.toHaveBeenCalled();
  });

  describe('DM recipient notification (offline-DM-notification fix)', () => {
    it('happy: sending a DM to an ordinary recipient creates exactly one new_message/dm notification for THEM, not the sender', async () => {
      findByPkRoom.mockResolvedValue({ id: 'room-1', room_type: 'dm' });
      postMock.mockResolvedValue({ id: 'm1', content: 'hi' });
      findAllMember.mockResolvedValue([{ enrollment_id: other }]);

      await sendDmMessage(ctx, 'room-1', 'hi');

      expect(createNotificationMock).toHaveBeenCalledTimes(1);
      expect(createNotificationMock).toHaveBeenCalledWith(other, me, 'new_message', 'dm', 'm1');
    });

    it('boundary: sending a DM where the other participant is Reese creates zero notifications', async () => {
      findByPkRoom.mockResolvedValue({ id: 'room-1', room_type: 'dm' });
      postMock.mockResolvedValue({ id: 'm1', content: 'hi' });
      findAllMember.mockResolvedValue([{ enrollment_id: reese }]);
      getReeseEnrollmentIdMock.mockResolvedValue(reese);

      await sendDmMessage(ctx, 'room-1', 'hi');

      expect(createNotificationMock).not.toHaveBeenCalled();
    });

    it('failure path: if the Reese-id lookup throws, the DM still sends successfully and still notifies (fail-closed = notify, not fail-open = silently skip)', async () => {
      findByPkRoom.mockResolvedValue({ id: 'room-1', room_type: 'dm' });
      postMock.mockResolvedValue({ id: 'm1', content: 'hi' });
      findAllMember.mockResolvedValue([{ enrollment_id: other }]);
      getReeseEnrollmentIdMock.mockRejectedValue(new Error('db connection reset'));

      const m = await sendDmMessage(ctx, 'room-1', 'hi');

      expect(m).toEqual({ id: 'm1', content: 'hi' });
      expect(createNotificationMock).toHaveBeenCalledWith(other, me, 'new_message', 'dm', 'm1');
    });

    it('failure path: sendDmMessage still returns the posted message even if createNotification rejects (best-effort — never breaks the sender\'s own request)', async () => {
      findByPkRoom.mockResolvedValue({ id: 'room-1', room_type: 'dm' });
      postMock.mockResolvedValue({ id: 'm1', content: 'hi' });
      findAllMember.mockResolvedValue([{ enrollment_id: other }]);
      createNotificationMock.mockRejectedValue(new Error('notification service down'));

      const m = await sendDmMessage(ctx, 'room-1', 'hi');
      expect(m).toEqual({ id: 'm1', content: 'hi' });
    });

    it('boundary: an unexpected empty membership lookup (no other participant found) skips notification cleanly, no crash', async () => {
      findByPkRoom.mockResolvedValue({ id: 'room-1', room_type: 'dm' });
      postMock.mockResolvedValue({ id: 'm1', content: 'hi' });
      findAllMember.mockResolvedValue([]);

      const m = await sendDmMessage(ctx, 'room-1', 'hi');
      expect(m).toEqual({ id: 'm1', content: 'hi' });
      expect(createNotificationMock).not.toHaveBeenCalled();
    });
  });

  it('listDmMessages delegates to listMessages with the since cursor', async () => {
    findByPkRoom.mockResolvedValue({ id: 'room-1', room_type: 'dm' });
    listMock.mockResolvedValue({ messages: [], active_count: 0 });
    findAllMember.mockResolvedValue([]); // no peer membership row yet
    const r = await listDmMessages(ctx, 'room-1', 'since-ts');
    expect(r).toEqual({ messages: [], active_count: 0, peer_typing: false });
    expect(listMock).toHaveBeenCalledWith(ctx, 'room-1', { since: 'since-ts' });
  });
});

describe('inbox', () => {
  const at = (s: string) => new Date(s);

  it('listConversations returns a dm convo with peer, last message, and unread=true', async () => {
    findAllMember.mockImplementation((q: any) =>
      q.where.enrollment_id === me
        ? Promise.resolve([{ room_id: 'r1', last_read_at: at('2026-07-20T10:00:00Z') }]) // my membership
        : Promise.resolve([{ enrollment_id: other }]), // the other member of r1
    );
    findAllRoom.mockResolvedValue([{ id: 'r1', room_type: 'dm' }]);
    findByPkEnroll.mockResolvedValue({ id: other, full_name: 'Bob', avatar_data_url: null });
    findOneMsg.mockResolvedValue({ room_id: 'r1', enrollment_id: other, content: 'yo', created_at: at('2026-07-20T11:00:00Z'), deleted_at: null });

    const convos = await listConversations(me);
    expect(convos).toHaveLength(1);
    expect(convos[0]).toMatchObject({ roomId: 'r1', peerId: other, peerName: 'Bob', lastMessage: 'yo', unread: true });
  });

  it('markDmRead sets last_read_at on my membership', async () => {
    findByPkRoom.mockResolvedValue({ id: 'r1', room_type: 'dm' });
    await markDmRead(me, 'r1');
    expect(updateMember).toHaveBeenCalledWith(
      expect.objectContaining({ last_read_at: expect.any(Date) }),
      { where: { room_id: 'r1', enrollment_id: me } },
    );
  });
});

describe('sendDmMessage — client_id passthrough (retry idempotency)', () => {
  it('forwards the client-generated id to postMessage', async () => {
    findByPkRoom.mockResolvedValue({ id: 'room-1', room_type: 'dm' });
    postMock.mockResolvedValue({ id: 'm1', content: 'hi' });
    await sendDmMessage(ctx, 'room-1', 'hi', 'client-uuid-1');
    expect(postMock).toHaveBeenCalledWith(ctx, 'room-1', { content: 'hi', client_id: 'client-uuid-1' });
  });

  it('omits client_id when the caller does not pass one (no forced-idempotency on plain sends)', async () => {
    findByPkRoom.mockResolvedValue({ id: 'room-1', room_type: 'dm' });
    postMock.mockResolvedValue({ id: 'm1', content: 'hi' });
    await sendDmMessage(ctx, 'room-1', 'hi');
    expect(postMock).toHaveBeenCalledWith(ctx, 'room-1', { content: 'hi', client_id: undefined });
  });
});

describe('listDmMessages — delivery ticks + typing (poll-based, no websockets)', () => {
  const at = (s: string) => new Date(s);
  const mkMsg = (over: Partial<{ id: string; enrollment_id: string; created_at: Date }>) => {
    const base = { id: 'm-x', enrollment_id: me, created_at: at('2026-08-05T11:59:00Z'), content: 'hi', ...over };
    return { ...base, toJSON: () => ({ ...base }) };
  };

  beforeEach(() => {
    findByPkRoom.mockResolvedValue({ id: 'room-1', room_type: 'dm' });
  });

  it('happy: touches my own delivery cursor and marks my own message delivered once the peer has polled past it', async () => {
    const myMsg = mkMsg({ id: 'm1', enrollment_id: me, created_at: at('2026-08-05T11:59:00Z') });
    listMock.mockResolvedValue({ messages: [myMsg], active_count: 1 });
    findAllMember.mockResolvedValue([{ enrollment_id: other, last_delivered_at: at('2026-08-05T12:00:00Z'), typing_at: null }]);

    const r = await listDmMessages(ctx, 'room-1');

    expect(updateMember).toHaveBeenCalledWith(
      expect.objectContaining({ last_delivered_at: expect.any(Date) }),
      { where: { room_id: 'room-1', enrollment_id: me } },
    );
    expect(r.messages[0]).toMatchObject({ id: 'm1', delivery_state: 'delivered' });
    expect(r.peer_typing).toBe(false);
  });

  it("boundary: a message not yet covered by the peer's delivery cursor stays 'sent'", async () => {
    const myMsg = mkMsg({ id: 'm1', enrollment_id: me, created_at: at('2026-08-05T12:05:00Z') }); // after peer's cursor
    listMock.mockResolvedValue({ messages: [myMsg], active_count: 1 });
    findAllMember.mockResolvedValue([{ enrollment_id: other, last_delivered_at: at('2026-08-05T12:00:00Z'), typing_at: null }]);

    const r = await listDmMessages(ctx, 'room-1');
    expect(r.messages[0]).toMatchObject({ delivery_state: 'sent' });
  });

  it('boundary: peer with no delivery cursor yet (never polled) leaves my message as sent', async () => {
    const myMsg = mkMsg({ id: 'm1', enrollment_id: me });
    listMock.mockResolvedValue({ messages: [myMsg], active_count: 1 });
    findAllMember.mockResolvedValue([{ enrollment_id: other, last_delivered_at: null, typing_at: null }]);

    const r = await listDmMessages(ctx, 'room-1');
    expect(r.messages[0]).toMatchObject({ delivery_state: 'sent' });
  });

  it('does not set a delivery_state on messages authored by the peer (no ticks on their own bubbles)', async () => {
    const theirMsg = mkMsg({ id: 'm2', enrollment_id: other });
    listMock.mockResolvedValue({ messages: [theirMsg], active_count: 1 });
    findAllMember.mockResolvedValue([{ enrollment_id: other, last_delivered_at: null, typing_at: null }]);

    const r = await listDmMessages(ctx, 'room-1');
    expect((r.messages[0] as any).delivery_state).toBeUndefined();
  });

  it('peer_typing is true when the peer touched typing_at within the freshness window', async () => {
    listMock.mockResolvedValue({ messages: [], active_count: 0 });
    findAllMember.mockResolvedValue([{ enrollment_id: other, last_delivered_at: null, typing_at: new Date(Date.now() - 1000) }]);

    const r = await listDmMessages(ctx, 'room-1');
    expect(r.peer_typing).toBe(true);
  });

  it('peer_typing is false once the touch goes stale', async () => {
    listMock.mockResolvedValue({ messages: [], active_count: 0 });
    findAllMember.mockResolvedValue([{ enrollment_id: other, last_delivered_at: null, typing_at: new Date(Date.now() - 60_000) }]);

    const r = await listDmMessages(ctx, 'room-1');
    expect(r.peer_typing).toBe(false);
  });

  it('failure path: a failed delivery-cursor touch never blocks the read', async () => {
    updateMember.mockRejectedValueOnce(new Error('db hiccup'));
    listMock.mockResolvedValue({ messages: [], active_count: 0 });
    findAllMember.mockResolvedValue([]);

    await expect(listDmMessages(ctx, 'room-1')).resolves.toMatchObject({ messages: [], peer_typing: false });
  });

  it('refuses to enrich a non-dm room (guard still applies)', async () => {
    findByPkRoom.mockResolvedValue({ id: 'room-9', room_type: 'persistent' });
    await expect(listDmMessages(ctx, 'room-9')).rejects.toMatchObject({ name: 'DmError' });
    expect(listMock).not.toHaveBeenCalled();
  });
});

describe('touchDmTyping', () => {
  it('happy: sets typing_at on my own membership row', async () => {
    findByPkRoom.mockResolvedValue({ id: 'room-1', room_type: 'dm' });
    await touchDmTyping(me, 'room-1');
    expect(updateMember).toHaveBeenCalledWith(
      { typing_at: expect.any(Date) },
      { where: { room_id: 'room-1', enrollment_id: me } },
    );
  });

  it('refuses on a non-dm room', async () => {
    findByPkRoom.mockResolvedValue({ id: 'room-9', room_type: 'persistent' });
    await expect(touchDmTyping(me, 'room-9')).rejects.toMatchObject({ name: 'DmError' });
    expect(updateMember).not.toHaveBeenCalled();
  });

  it('idempotent: repeated touches just advance the timestamp, never a duplicate side effect', async () => {
    findByPkRoom.mockResolvedValue({ id: 'room-1', room_type: 'dm' });
    await touchDmTyping(me, 'room-1');
    await touchDmTyping(me, 'room-1');
    expect(updateMember).toHaveBeenCalledTimes(2);
  });
});
