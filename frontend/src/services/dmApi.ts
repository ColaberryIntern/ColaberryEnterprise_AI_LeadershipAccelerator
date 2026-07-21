import portalApi from '../utils/portalApi';

// 1:1 direct messages. Talks to /api/portal/dm/* (a DM is a 2-person private
// room server-side; this client only ever sees a roomId + messages).

export interface DmMessage {
  id: string;
  room_id: string;
  enrollment_id: string | null;
  sender_name: string;
  content: string;
  kind: string;
  created_at: string;
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

export async function sendDmMessage(roomId: string, content: string): Promise<DmMessage> {
  const { data } = await portalApi.post<{ message: DmMessage }>(`/api/portal/dm/${roomId}/send`, { content });
  return data.message;
}

/** My enrollment id (from the participant JWT) — to render my own bubbles. */
export function myEnrollmentId(): string | null {
  try {
    const t = localStorage.getItem('participant_token');
    if (!t) return null;
    const payload = JSON.parse(atob(t.split('.')[1] || ''));
    return payload?.sub ?? null;
  } catch {
    return null;
  }
}
