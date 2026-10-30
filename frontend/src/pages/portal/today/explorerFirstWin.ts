import { useEffect, useState } from 'react';
import type { TimelineFeedCard } from '../../../components/timeline/TimelineCard';
import type { OnboardingSchedule } from '../../../services/onboardingApi';
import { loadSchedule } from '../scheduleCache';
import { bySectionOrder, sumCardPoints } from '../classroomNextStep';

/**
 * C91, the Explorer's first win: until an Explorer finishes a first lesson, the portal gives the first session one job (finish that
 * lesson) and holds the enroll ask. Ad audit, Oct 2026: of 308 ad signups 3 finished a lesson, and the top first-page click was
 * "Enroll to unlock", a dead end in Settings.
 *
 * `first_win` comes from the server (explorerFirstWin.ts). Only an explicit false counts: an older server (no field) or a failed
 * read (null) means "unknown", and unknown keeps the page exactly as it was before C91.
 */
export function needsFirstWin(s: Pick<OnboardingSchedule, 'is_explorer' | 'first_win'> | null | undefined): boolean {
  return !!s?.is_explorer && s.first_win === false;
}

/** The query flag the campus gate's "Start your first lesson" sends to Today, which then opens that lesson. */
export const FIRST_LESSON_PARAM = 'first';
export const FIRST_LESSON_HREF = `/portal/today?stay=1&${FIRST_LESSON_PARAM}=1`;

/**
 * The lesson to start with (pure): a lesson already in progress first (pick up where you left off), otherwise the earliest week's
 * first open card in Classroom's own section order. Locked and completed cards are never offered. Week 0 counts, unlike the enrolled
 * student's next step, because Week 0 is what an Explorer's curriculum holds.
 *
 * Only point-bearing cards qualify. Production, Oct 30: the first card in order is a 0-point welcome announcement, so finishing the
 * "first lesson" banked nothing, first_win (read from the points ledger) never turned true, and the learner stayed on the first-lesson
 * page. A card that awards points is a card whose completion the server records as a first win.
 */
export function findFirstLessonCard(cards: TimelineFeedCard[], buckets: string[]): TimelineFeedCard | null {
  const open = cards.filter((c) => (c.status === 'available' || c.status === 'in_progress') && sumCardPoints(c.points) > 0);
  if (!open.length) return null;
  const started = open.find((c) => c.status === 'in_progress');
  if (started) return started;
  const week = (c: TimelineFeedCard) => (typeof c.week === 'number' ? c.week : Number.MAX_SAFE_INTEGER);
  const order = bySectionOrder(buckets);
  return [...open].sort((a, b) => week(a) - week(b) || order(a, b))[0];
}

/** For surfaces that don't load the schedule themselves (the campus gate): true only once the server has said "no first win yet". */
export function useFirstWinPending(enabled: boolean): boolean {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!enabled) { setPending(false); return; }
    let alive = true;
    loadSchedule()
      .then((s) => { if (alive) setPending(needsFirstWin(s)); })
      .catch(() => { if (alive) setPending(false); }); // unknown: the gate stays as it was
    return () => { alive = false; };
  }, [enabled]);
  return pending;
}
