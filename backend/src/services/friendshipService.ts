import { Op } from 'sequelize';
import Friendship, { FriendshipStatus } from '../models/Friendship';

// Per-person status the directory/rail shows for someone else, from my POV.
export type DirectoryStatus = 'friend' | 'requested' | 'incoming' | 'none';

// A user-facing validation problem (self-request, no such request) — routes
// translate this to HTTP 400.
export class FriendRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FriendRequestError';
  }
}

// Best-effort in-app notification — never fails the friendship action.
async function notify(recipient: string, actor: string, type: 'friend_request' | 'friend_accepted', friendshipId: string): Promise<void> {
  try {
    const { createNotification } = await import('./communityNotificationService');
    await createNotification(recipient, actor, type, 'friendship', friendshipId);
  } catch { /* notifications are best-effort */ }
}

/**
 * Send a friend request (or auto-accept the reverse if they already asked me).
 * Idempotent: re-sending an existing request is a no-op that returns the
 * current state. Cross-cohort, by design — unlike DMs (still cohort-scoped
 * for students in dmService.ts), a connection itself carries no messaging
 * capability on its own, so there's no privacy boundary to enforce here.
 */
export async function sendFriendRequest(me: string, targetId: string): Promise<{ status: 'requested' | 'friend' }> {
  if (!targetId || targetId === me) throw new FriendRequestError('Invalid target');

  // They already asked me → accepting makes us friends immediately.
  const reverse = await Friendship.findOne({ where: { requester_id: targetId, addressee_id: me } });
  if (reverse) {
    if (reverse.status === 'accepted') return { status: 'friend' };
    if (reverse.status === 'pending') {
      await reverse.update({ status: 'accepted' });
      await notify(targetId, me, 'friend_accepted', reverse.id);
      return { status: 'friend' };
    }
    // reverse was declined → fall through and let me send my own fresh request
  }

  const existing = await Friendship.findOne({ where: { requester_id: me, addressee_id: targetId } });
  if (existing) {
    if (existing.status === 'accepted') return { status: 'friend' };
    if (existing.status === 'pending') return { status: 'requested' };
    await existing.update({ status: 'pending' }); // re-request after a prior decline
    await notify(targetId, me, 'friend_request', existing.id);
    return { status: 'requested' };
  }

  const created = await Friendship.create({ requester_id: me, addressee_id: targetId, status: 'pending' });
  await notify(targetId, me, 'friend_request', created.id);
  return { status: 'requested' };
}

/** Accept or decline an incoming request (I must be the addressee). */
export async function respondToRequest(me: string, requesterId: string, accept: boolean): Promise<{ status: FriendshipStatus }> {
  const row = await Friendship.findOne({ where: { requester_id: requesterId, addressee_id: me, status: 'pending' } });
  if (!row) throw new FriendRequestError('No pending request from that person');
  await row.update({ status: accept ? 'accepted' : 'declined' });
  if (accept) await notify(requesterId, me, 'friend_accepted', row.id);
  return { status: row.status };
}

/** Accepted friendships involving me → the OTHER person's enrollment id. */
export async function listFriendIds(me: string): Promise<string[]> {
  const rows = await Friendship.findAll({
    where: { status: 'accepted', [Op.or]: [{ requester_id: me }, { addressee_id: me }] },
  });
  return rows.map((r) => (r.requester_id === me ? r.addressee_id : r.requester_id));
}

/**
 * Directory status for each of `otherIds` from my POV — powers the rail's
 * friends-first sort, the Requests section (`incoming`), and the "Add" button
 * state in Find people (`none` → Add, `requested` → Requested, `friend` → Friends).
 */
export async function getFriendshipStatuses(me: string, otherIds: string[]): Promise<Record<string, DirectoryStatus>> {
  const out: Record<string, DirectoryStatus> = {};
  if (otherIds.length === 0) return out;
  const rows = await Friendship.findAll({
    where: {
      [Op.or]: [
        { requester_id: me, addressee_id: { [Op.in]: otherIds } },
        { addressee_id: me, requester_id: { [Op.in]: otherIds } },
      ],
    },
  });
  for (const r of rows) {
    const other = r.requester_id === me ? r.addressee_id : r.requester_id;
    if (r.status === 'accepted') out[other] = 'friend';
    else if (r.status === 'pending') out[other] = r.requester_id === me ? 'requested' : 'incoming';
    // declined → omit (treated as 'none' → re-requestable)
  }
  return out;
}
