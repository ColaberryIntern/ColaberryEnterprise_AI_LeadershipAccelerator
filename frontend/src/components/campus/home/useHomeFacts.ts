import { useCallback, useEffect, useState } from 'react';
import { fetchOnboardingProfile, fetchStreak } from '../../../services/onboardingApi';
import type { StreakView } from '../../../services/onboardingApi';

/**
 * The two facts the campus home shows that the campus state does not already carry (C11b): the learner's first name for the
 * greeting and, for enrolled learners, their streak. Both are reads (GET), so a view-as session is safe. Either can fail on its
 * own: no name means a greeting without one (never the email prefix, as TodayShell), no streak means no streak in the top bar.
 *
 * WP-4: the streak also says whether today's is already claimed (the gate claims it on Enter, decision Q9), and `streakNow` takes
 * the server's answer to a claim so the top bar moves at once.
 */
export interface HomeFacts {
  firstName: string;
  fullName: string;
  initials: string;
  streak: number | null;
  /** null until the streak is read (or when it could not be). */
  claimedToday: boolean | null;
  /** What a claim right now would award (0 once claimed; null: unknown). */
  nextPoints: number | null;
  streakNow: (s: Pick<StreakView, 'count' | 'claimed_today'> & { next_points?: number }) => void;
}

export function useHomeFacts(wantStreak: boolean): HomeFacts {
  const [firstName, setFirstName] = useState('');
  const [initials, setInitials] = useState('');
  const [fullName, setFullName] = useState('');
  const [streak, setStreak] = useState<{ count: number; claimed: boolean; next: number | null } | null>(null);
  useEffect(() => {
    let alive = true;
    fetchOnboardingProfile()
      .then((p) => {
        if (!alive) return;
        const parts = (p?.profile?.full_name ?? '').trim().split(/\s+/).filter(Boolean);
        setFirstName(parts[0] || '');
        setFullName(parts.join(' '));
        setInitials(parts.length ? (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() : '');
      })
      .catch(() => { /* no name: the greeting goes without one */ });
    if (wantStreak) {
      fetchStreak()
        .then((s) => { if (alive && typeof s?.count === 'number') setStreak({ count: s.count, claimed: !!s.claimed_today, next: typeof s.next_points === 'number' ? s.next_points : null }); })
        .catch(() => { /* no streak shown, and nothing is claimed */ });
    }
    return () => { alive = false; };
  }, [wantStreak]);
  const streakNow = useCallback((s: Pick<StreakView, 'count' | 'claimed_today'> & { next_points?: number }) =>
    setStreak({ count: s.count, claimed: !!s.claimed_today, next: typeof s.next_points === 'number' ? s.next_points : null }), []);
  return { firstName, fullName, initials, streak: streak ? streak.count : null, claimedToday: streak ? streak.claimed : null, nextPoints: streak ? streak.next : null, streakNow };
}

export { greetingFor } from './conciergeCopy';
