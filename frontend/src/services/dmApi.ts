import portalApi from '../utils/portalApi';
import { getParticipantToken } from '../utils/participantToken';

// 1:1 direct messages. Talks to /api/portal/dm/* (a DM is a 2-person private
// room server-side; this client only ever sees a roomId + messages).

export type DmDeliveryState = 'sent' | 'delivered';

export interface DmMessage {
  id: string;
  room_id: string;
  enrollment_id: string | null;
  sender_name: string;
  content: string;
  kind: string;
  created_at: string;
  // Only set on messages I authored — no ticks on the peer's own bubbles, and
  // no read receipts in v1 (matches the approved mockup).
  delivery_state?: DmDeliveryState;
}

export interface DmPoll {
  messages: DmMessage[];
  peerTyping: boolean;
}

/** Find-or-create the DM room with `otherId`; returns the room id to poll/post. */
export async function openDm(otherId: string): Promise<string> {
  const { data } = await portalApi.post<{ roomId: string }>('/api/portal/dm/open', { otherId });
  return data.roomId;
}

/** New messages since the cursor (omit `since` for the full history), plus
 * whether the peer is currently typing. Fetching IS the delivery signal in
 * this poll-based model — the server touches my delivery cursor as a side
 * effect of this call. */
export async function fetchDmMessages(roomId: string, since?: string): Promise<DmPoll> {
  const { data } = await portalApi.get<{ messages: DmMessage[]; active_count: number; peer_typing?: boolean }>(
    `/api/portal/dm/${roomId}/messages`,
    since ? { params: { since } } : undefined,
  );
  return { messages: data.messages || [], peerTyping: !!data.peer_typing };
}

/** clientId makes a retried send idempotent (server dedups on it) — pass the
 * same id again on retry and it returns the original message, never a dupe. */
export async function sendDmMessage(roomId: string, content: string, clientId?: string): Promise<DmMessage> {
  const { data } = await portalApi.post<{ message: DmMessage }>(`/api/portal/dm/${roomId}/send`, { content, client_id: clientId });
  return data.message;
}

/** Touch my typing cursor. Fire-and-forget — caller should throttle (~2.5s)
 * and swallow errors; a missed typing touch is a UX nicety, never fatal. */
export async function sendTyping(roomId: string): Promise<void> {
  await portalApi.post(`/api/portal/dm/${roomId}/typing`);
}

export interface DmConversation {
  roomId: string;
  peerId: string;
  peerName: string;
  peerAvatar: string | null;
  lastMessage: string;
  lastAt: string;
  unread: boolean;
}

/** My DM conversations (newest first) for the Messages inbox. */
export async function fetchConversations(): Promise<DmConversation[]> {
  const { data } = await portalApi.get<{ conversations: DmConversation[] }>('/api/portal/dm/conversations');
  return data.conversations || [];
}

/** Mark a conversation read (clears its unread state). */
export async function markDmRead(roomId: string): Promise<void> {
  await portalApi.post(`/api/portal/dm/${roomId}/read`);
}

/** My enrollment id (from the participant JWT) — to render my own bubbles. */
export function myEnrollmentId(): string | null {
  try {
    const t = getParticipantToken();
    if (!t) return null;
    const payload = JSON.parse(atob(t.split('.')[1] || ''));
    return payload?.sub ?? null;
  } catch {
    return null;
  }
}
