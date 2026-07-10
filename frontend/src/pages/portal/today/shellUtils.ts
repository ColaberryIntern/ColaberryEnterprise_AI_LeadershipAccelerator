// Shared helpers for the portal Design-E shell (topbar countdowns, participant
// identity, daily streak). Extracted so PortalShell and the individual pages
// (Today / Path / Schedule) can all use them without a circular import.
import { OnboardingSchedule } from '../../../services/onboardingApi';

export function readParticipant(): { email: string; initials: string } {
  try {
    const t = localStorage.getItem('participant_token');
    if (!t) return { email: '', initials: 'YOU' };
    const p = JSON.parse(atob(t.split('.')[1] || ''));
    const email: string = p.email || '';
    const initials = (email.split('@')[0] || 'you').slice(0, 2).toUpperCase();
    return { email, initials };
  } catch { return { email: '', initials: 'YOU' }; }
}

export function firstClassTargetMs(fc: OnboardingSchedule['first_class']): number | null {
  if (!fc || !fc.start_date) return null;
  const t = new Date(`${fc.start_date}T00:00:00`).getTime();
  return isNaN(t) ? null : t;
}

export function countdown(targetMs: number | null, nowMs: number): { d: number; h: number; m: number; s: number } | null {
  if (targetMs == null) return null;
  let diff = targetMs - nowMs;
  if (diff < 0) diff = 0;
  return {
    d: Math.floor(diff / 864e5),
    h: Math.floor((diff % 864e5) / 36e5),
    m: Math.floor((diff % 36e5) / 6e4),
    s: Math.floor((diff % 6e4) / 1e3),
  };
}

// ── daily streak (client-side; localStorage). Points for streaks are a backend
// follow-up — this only tracks day-over-day visits for the Today card. ──
export type StreakState = { count: number; lastClaim: string; week: boolean[] };
const STREAK_KEY = 'te_streak_v1';
export function todayKey(): string { const d = new Date(); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
export function dowMonFirst(): number { return (new Date().getDay() + 6) % 7; } // Mon=0 … Sun=6
export function loadStreak(): StreakState {
  try { const raw = localStorage.getItem(STREAK_KEY); if (raw) return JSON.parse(raw) as StreakState; } catch { /* ignore */ }
  return { count: 0, lastClaim: '', week: [false, false, false, false, false, false, false] };
}
export function saveStreak(s: StreakState): void { try { localStorage.setItem(STREAK_KEY, JSON.stringify(s)); } catch { /* ignore */ } }
