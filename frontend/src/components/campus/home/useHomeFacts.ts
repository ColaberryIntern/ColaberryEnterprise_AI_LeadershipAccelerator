import { useEffect, useState } from 'react';
import { fetchOnboardingProfile, fetchStreak } from '../../../services/onboardingApi';

/**
 * The two facts the campus home shows that the campus state does not already carry (C11b): the learner's first name for the
 * greeting and, for enrolled learners, their streak. Both are reads (GET), so a view-as session is safe. Either can fail on its
 * own: no name means a greeting without one (never the email prefix, as TodayShell), no streak means no streak in the top bar.
 */
export interface HomeFacts { firstName: string; fullName: string; initials: string; streak: number | null }

export function useHomeFacts(wantStreak: boolean): HomeFacts {
  const [firstName, setFirstName] = useState('');
  const [initials, setInitials] = useState('');
  const [fullName, setFullName] = useState('');
  const [streak, setStreak] = useState<number | null>(null);
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
        .then((s) => { if (alive && typeof s?.count === 'number') setStreak(s.count); })
        .catch(() => { /* no streak shown */ });
    }
    return () => { alive = false; };
  }, [wantStreak]);
  return { firstName, fullName, initials, streak };
}

/** "Good morning" / "Good afternoon" / "Good evening" from the hour (the viewer's own clock, as the prototype's greeting). */
export function greetingFor(hour: number): string {
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
