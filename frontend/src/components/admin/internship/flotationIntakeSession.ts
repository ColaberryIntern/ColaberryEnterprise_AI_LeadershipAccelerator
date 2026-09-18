import { PlacedCall, IntakeStudent } from '../../../services/adminFlotationIntakeApi';

/**
 * A phone intake in flight, remembered across a page refresh.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * The call state used to live only in React state, so refreshing the admin page
 * mid-call dropped you back to the Applications tab AND discarded the call id, the
 * poll, and the whole live view — even though the backend still finished the call.
 * "Very hard to use." This stashes just enough (the placed call + which student
 * it's for) in localStorage so `StartProjectForStudent` can re-open on the talk
 * step and `SpokenIntake` can re-attach its poll after a reload.
 *
 * Deliberately localStorage, not the URL: the call id is an internal handle, not
 * something to put in a shareable link. Bounded to 20 minutes (a call plus its
 * write-up and build) so a stale entry never resurrects an old conversation.
 * Every access is wrapped — a blocked or private-mode store must never break the
 * page; it just means no resume.
 */
export interface ActiveIntake {
  placed: PlacedCall;
  student: IntakeStudent;
  /** When the call was placed, in epoch ms — also the poll's start point. */
  ts: number;
}

const KEY = 'flotation_intake_active_v1';
const MAX_AGE_MS = 20 * 60 * 1000; // matches SpokenIntake's WATCH_FOR_MS

export function saveActiveIntake(input: { placed: PlacedCall; student: IntakeStudent }): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...input, ts: Date.now() }));
  } catch { /* private mode / storage blocked — resume just won't be available */ }
}

export function readActiveIntake(): ActiveIntake | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as ActiveIntake;
    if (!a?.placed?.call_id || !a?.student?.id) return null;
    if (Date.now() - (a.ts || 0) > MAX_AGE_MS) { clearActiveIntake(); return null; }
    return a;
  } catch {
    return null;
  }
}

export function clearActiveIntake(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
