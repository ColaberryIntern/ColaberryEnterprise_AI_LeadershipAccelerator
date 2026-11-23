import axios from 'axios';
import type { CompanionState, PulseState } from './onboardingApi';

/**
 * The class QR check-in for a visitor who is NOT a signed-in member of the class: name +
 * email, then the same live loop a signed-in student's phone has (what is on screen, vote,
 * status, ask a question) on a session-scoped guest pass.
 *
 * A separate axios instance on purpose, not `portalApi`. That client's 401 interceptor clears
 * the participant token and redirects to sign-in, which is right for a portal session and
 * wrong here: an expired guest pass must send the visitor back to the name + email form, and
 * must never sign out someone who is ALSO signed in to the portal under a different cohort
 * (exactly the 2026-11-19 case: Ali, signed in as a July-cohort account, scanning a November
 * class).
 */
const guestApi = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '',
  headers: { 'Content-Type': 'application/json' },
});

export type ClassWindow = 'before' | 'open' | 'ended';

export interface GuestJoinResult {
  pass: string;
  name: string;
  matched: boolean;
  class_window?: ClassWindow;
}

/** Public class info for the check-in page (GET /api/portal/sessions/:id/checkin-info). */
export interface CheckinInfo {
  title: string;
  session_date: string;
  start_time: string;
  cohort_name: string;
  room_id: string | null;
  /** Canonical program name from the backend (canonicalCourse.ts). */
  program_name?: string;
  /** Absent from an older backend: treated as 'open'. */
  class_window?: ClassWindow;
  start_label?: string;
  accepts_guests?: boolean;
  /** Open House sessions only: the Zoom link. */
  meeting_link?: string | null;
}

/**
 * Read with the guest client, NOT portalApi (2026-11-23). portalApi attaches whatever portal token
 * the browser holds and sends the page to the login screen on a 401, so a visitor with an expired
 * sign-in was bounced off the check-in page before seeing the form.
 */
export async function getCheckinInfo(sessionId: string): Promise<CheckinInfo> {
  const { data } = await guestApi.get<CheckinInfo>(`/api/portal/sessions/${sessionId}/checkin-info`);
  return data;
}

/** What this phone remembers between scans: the pass, and who they said they were. */
export interface SavedGuest { pass: string; name: string; email: string }

const keyFor = (sessionId: string) => `class-checkin-guest-${sessionId}`;

/** Storage can be unavailable (private mode, blocked site data); the form still works. */
export function loadSavedGuest(sessionId: string): SavedGuest | null {
  try {
    const raw = localStorage.getItem(keyFor(sessionId));
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v.pass === 'string' && typeof v.name === 'string' && typeof v.email === 'string' ? v : null;
  } catch {
    return null;
  }
}

export function saveGuest(sessionId: string, g: SavedGuest): void {
  try { localStorage.setItem(keyFor(sessionId), JSON.stringify(g)); } catch { /* convenience only */ }
}

export function forgetGuest(sessionId: string): void {
  try { localStorage.removeItem(keyFor(sessionId)); } catch { /* convenience only */ }
}

/** Idempotent server-side on (session, email): a re-scan is the same guest, never a second one. */
export async function guestCheckin(sessionId: string, name: string, email: string): Promise<GuestJoinResult> {
  const { data } = await guestApi.post<GuestJoinResult>(
    `/api/portal/sessions/${sessionId}/guest-join`, { name, email, via: 'checkin' },
  );
  return data;
}

interface GuestStateWire {
  phase?: CompanionState['phase'];
  title: string;
  question: null | {
    key: string; q: string; options: string[]; my_choice: number | null;
    locked: boolean; revealed: boolean; answer: number | null;
    kind?: 'prediction' | 'poll' | 'trivia';
    theater?: { state: 'voting' | 'locked' | 'revealed' };
  };
  prompt?: CompanionState['prompt'];
  broadcast_prompts?: string[];
  follow?: CompanionState['follow'];
  my_pulse?: PulseState | null;
}

/** The guest state, in the same shape the signed-in companion returns, so one view renders both. */
export async function getGuestCompanionState(sessionId: string, pass: string): Promise<CompanionState> {
  const { data } = await guestApi.get<GuestStateWire>(
    `/api/portal/sessions/${sessionId}/guest-state`, { headers: { 'X-Guest-Pass': pass } },
  );
  const q = data.question;
  return {
    phase: data.phase || (q ? 'question' : 'status'),
    title: data.title,
    question: q ? {
      key: q.key, kind: q.kind || 'poll', q: q.q, options: q.options, answer: q.answer,
      revealed: q.revealed, my_choice: q.my_choice,
      theater: q.theater || (q.locked && !q.revealed ? { state: 'locked' } : undefined),
    } : null,
    prompt: data.prompt ?? null,
    broadcast_prompts: data.broadcast_prompts,
    follow: data.follow ?? null,
    my_pulse: data.my_pulse ?? null,
  };
}

export async function guestVote(sessionId: string, pass: string, pollKey: string, choice: number): Promise<void> {
  await guestApi.post(`/api/portal/sessions/${sessionId}/guest-vote`, { poll_key: pollKey, choice }, { headers: { 'X-Guest-Pass': pass } });
}

export async function guestPulse(sessionId: string, pass: string, state: PulseState): Promise<void> {
  await guestApi.post(`/api/portal/sessions/${sessionId}/guest-pulse`, { state }, { headers: { 'X-Guest-Pass': pass } });
}

export async function guestAsk(sessionId: string, pass: string, text: string): Promise<void> {
  await guestApi.post(`/api/portal/sessions/${sessionId}/guest-ask`, { text }, { headers: { 'X-Guest-Pass': pass } });
}
