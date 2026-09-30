import portalApi from '../utils/portalApi';
import { getParticipantToken } from '../utils/participantToken';
import type { AttachmentRef } from './agentAttachmentApi';

// 1:1 direct messages. Talks to /api/portal/dm/* (a DM is a 2-person private
// room server-side; this client only ever sees a roomId + messages).

/** An image attached to a DM, with a short-lived URL minted for this viewer. */
export interface DmAttachment {
  id: string;
  name: string;
  url: string;
}

export interface DmMessage {
  id: string;
  room_id: string;
  enrollment_id: string | null;
  sender_name: string;
  content: string;
  kind: string;
  created_at: string;
  /** Present only on messages that carry files. Survives a page reload. */
  attachments?: DmAttachment[];
}

/** Find-or-create the DM room with `otherId`; returns the room id to poll/post. */
export async function openDm(otherId: string): Promise<string> {
  const { data } = await portalApi.post<{ roomId: string }>('/api/portal/dm/open', { otherId });
  return data.roomId;
}

/** New messages since the cursor (omit `since` for the full history). */
export async function fetchDmMessages(roomId: string, since?: string): Promise<DmMessage[]> {
  const { data } = await portalApi.get<{ messages: DmMessage[]; active_count: number }>(
    `/api/portal/dm/${roomId}/messages`,
    since ? { params: { since } } : undefined,
  );
  return data.messages || [];
}

/**
 * Send a DM. `attachments` are ids of files uploaded via the agent-attachment
 * endpoint — an agent on the other end (Reese) reads them; a human peer just
 * sees them on the message. Content may be empty when something is attached.
 */
export async function sendDmMessage(
  roomId: string,
  content: string,
  attachments: AttachmentRef[] = [],
): Promise<DmMessage> {
  const { data } = await portalApi.post<{ message: DmMessage }>(`/api/portal/dm/${roomId}/send`, { content, attachments });
  return data.message;
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
