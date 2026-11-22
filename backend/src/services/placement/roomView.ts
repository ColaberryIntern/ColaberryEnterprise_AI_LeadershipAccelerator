/**
 * Career Prep v27, CP9.1: what the room routes answer (the shape, and its plain words). Pure; roomService.ts fills it.
 * `join.url` is the meeting provider's join link: the ONLY response in the product that may carry it, and only when
 * join.status is 'ready' (the caller decided, and Zoom's recording read-back matches everyone's consent).
 */
export type RecState = 'declined' | 'pending' | 'on' | 'unavailable' | 'failed';

export interface RoomView {
  interviewId: string;
  you: 'candidate' | 'employer';
  company: string | null;
  role: string | null;
  startsAt: string;
  endsAt: string;
  opensAt: string;
  yourDecision: 'consent' | 'decline' | null;
  consent: { consented: number; of: number; declined: boolean; label: string };
  recording: { status: 'off' | 'starting' | 'on' | 'declined' | 'unavailable' | 'failed'; note: string | null };
  join: { status: 'decide_first' | 'starting' | 'withheld' | 'ready'; url: string | null; reason: string | null };
}

/** The line the candidate (and the desk, T31) sees about recording; null while nothing has been decided. */
export function recordingNote(state: RecState | null): string | null {
  switch (state) {
    case 'on': return 'Recording on: everyone consented.';
    case 'declined': return 'Recording off: someone chose not to be recorded. The interview goes ahead unrecorded, with no replay.';
    case 'unavailable': return 'Recording unavailable: Zoom permission missing. The interview goes ahead unrecorded, with no replay.';
    case 'failed': return 'Recording could not be turned on. The interview goes ahead unrecorded, with no replay.';
    case 'pending': return 'Turning the recording on.';
    default: return null;
  }
}
