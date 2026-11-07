import { useEffect, useMemo, useState } from 'react';
import type { TimelineFeedCard } from '../../../components/timeline/TimelineCard';
import type { NextLesson } from '../../../components/timeline/VideoWinCelebration';
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

/**
 * C115 (Ali, 2026-11-05: "anyone that logs in ... if they haven't completed one task yet"): should this learner's sign-in open the
 * first lesson? An Explorer: exactly needsFirstWin, unchanged. Anyone else: only when the server says explicitly that they have no
 * first win AND have never completed a card (older paid learners completed cards that banked no learning points). Staff never, so
 * the team is not sent to the video in every new tab. Anything unknown: no.
 */
export function needsFirstLesson(s: Pick<OnboardingSchedule, 'is_explorer' | 'is_staff' | 'first_win' | 'any_card_completed'> | null | undefined): boolean {
  if (needsFirstWin(s)) return true;
  return !!s && !s.is_explorer && !s.is_staff && s.first_win === false && s.any_card_completed === false;
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

/** C117: the lesson the drawer's celebration offers next, by the same rule, never the card the learner is on. */
export function findNextLessonCard(cards: TimelineFeedCard[], buckets: string[], currentId: string): TimelineFeedCard | null {
  return findFirstLessonCard(cards.filter((c) => c.id !== currentId), buckets);
}

/** C117: the drawer's Next offer for the open card (null when nothing is open or nothing is next). */
export function useNextLessonOffer(
  open: TimelineFeedCard | null, cards: TimelineFeedCard[], buckets: string[], openCard: (c: TimelineFeedCard) => void,
): NextLesson | null {
  return useMemo(() => {
    const c = open ? findNextLessonCard(cards, buckets, open.id) : null;
    return c ? { title: c.title, onOpen: () => openCard(c) } : null;
  }, [open, cards, buckets, openCard]);
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
