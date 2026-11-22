import portalApi from '../../../utils/portalApi';

/**
 * Career Prep v27, CP9.1 (kit F5): the candidate's interview room data (backend routes/placementRoomRoutes.ts,
 * RoomResponse). The ONLY answer in the app that may carry the meeting provider's join link (`join.url`), and only
 * after the student has made their own recording decision and the recording read-back matches everyone's choice.
 * Every non-200 answer is mapped to one plain state here, so the page never shows a raw error.
 */
export interface RoomData {
  interviewId: string; you: 'candidate' | 'employer'; company: string | null; role: string | null;
  startsAt: string; endsAt: string; opensAt: string; yourDecision: 'consent' | 'decline' | null;
  consent: { consented: number; of: number; declined: boolean; label: string };
  recording: { status: 'off' | 'starting' | 'on' | 'declined' | 'unavailable' | 'failed'; note: string | null };
  join: { status: 'decide_first' | 'starting' | 'withheld' | 'ready'; url: string | null; reason: string | null };
}

export type RoomAnswer =
  | { kind: 'ok'; room: RoomData }
  | { kind: 'not_open'; opensAt: string }
  | { kind: 'gone'; reason: 'moved' | 'not_booked' | 'ended'; message: string }
  | { kind: 'not_ready'; message: string }
  | { kind: 'not_found' }
  | { kind: 'busy'; message: string }
  | { kind: 'failed'; message: string };

export const ROOM_TEXT = {
  failed: 'The interview room could not load. Check your connection and try again.',
  busy: 'Too many tries just now. Wait a minute and try again.',
  notReady: 'The meeting is still being set up. Try again in a minute.',
};

const GONE = new Set(['moved', 'not_booked', 'ended']);

/** One answer (status + body) to one page state. A 200 without the room's shape is a failure, never a room. */
export function roomAnswer(status: number, body: unknown): RoomAnswer {
  const b = (body && typeof body === 'object' ? body : {}) as { room?: RoomData; opensAt?: string; reason?: string; error?: string };
  if (status === 200 && b.room && typeof b.room.interviewId === 'string' && b.room.join && b.room.consent) return { kind: 'ok', room: b.room };
  if (status === 403 && typeof b.opensAt === 'string') return { kind: 'not_open', opensAt: b.opensAt };
  if (status === 410 && b.reason && GONE.has(b.reason)) return { kind: 'gone', reason: b.reason as 'moved' | 'not_booked' | 'ended', message: b.error || 'This interview is not open.' };
  if (status === 409) return { kind: 'not_ready', message: b.error || ROOM_TEXT.notReady };
  if (status === 404) return { kind: 'not_found' };
  if (status === 429) return { kind: 'busy', message: ROOM_TEXT.busy };
  return { kind: 'failed', message: ROOM_TEXT.failed };
}

async function settle(p: Promise<{ status: number; data: unknown }>): Promise<RoomAnswer> {
  try {
    const r = await p;
    return roomAnswer(r.status, r.data);
  } catch (err) {
    const res = (err as { response?: { status: number; data: unknown } }).response;
    return res ? roomAnswer(res.status, res.data) : roomAnswer(0, null);
  }
}

const path = (id: string) => `/api/portal/career-prep/room/${encodeURIComponent(id)}`;

export function fetchRoomApi(id: string): Promise<RoomAnswer> {
  return settle(portalApi.get(path(id), { timeout: 15_000 }));
}

export function decideRoomApi(id: string, decision: 'consent' | 'decline'): Promise<RoomAnswer> {
  return settle(portalApi.post(`${path(id)}/consent`, { decision }, { timeout: 20_000 }));
}
