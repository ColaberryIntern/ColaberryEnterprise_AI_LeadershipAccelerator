import { useEffect, useState } from 'react';
import { TimelineFeedCard } from '../../../components/timeline/TimelineCard';
import { findActiveNextCard } from '../classroomNextStep';
import { fetchTodayPlan } from '../../../services/capeApi';

export type TodayNextStep =
  | { kind: 'classroom'; card: TimelineFeedCard }
  | { kind: 'classroom-done' }
  | { kind: 'setup'; title: string }
  | { kind: 'plan' }
  | { kind: 'timeline' };

/**
 * Decides what the Command Center's primary CTA should point a student at —
 * feedback from real onboarding was that a brand-new student didn't know
 * what to do next. Two tracks:
 *
 * - Enrolled ("active class") students: always Classroom's own next
 *   incomplete card (findActiveNextCard — the same section-order derivation
 *   Classroom itself defaults to), since that's the fastest path back into
 *   training regardless of setup/plan state.
 * - Explorer/free students: a 3-stage sequence — finish setup, then work
 *   through Today's Plan, then explore the Timeline — surfacing whichever
 *   stage they're actually on instead of a generic greeting.
 */
export function useTodayNextStep(params: {
  isExplorer: boolean;
  curriculum: TimelineFeedCard[];
  buckets: string[];
  setupRemaining: number;
  nextSetupStepTitle: string | null;
  planFlagOn: boolean;
  /** Bump/replace this (e.g. the points object) to re-check plan completion
   *  after a card is completed elsewhere on the page. */
  refreshToken: unknown;
}): TodayNextStep {
  const { isExplorer, curriculum, buckets, setupRemaining, nextSetupStepTitle, planFlagOn, refreshToken } = params;
  // null = unknown yet, or no plan to speak of (flag off / empty / errored) —
  // both fall through to the Timeline stage rather than blocking on a loading state.
  const [planIncomplete, setPlanIncomplete] = useState<boolean | null>(null);

  useEffect(() => {
    if (!planFlagOn) { setPlanIncomplete(null); return; }
    let alive = true;
    fetchTodayPlan()
      .then((plan) => {
        if (!alive) return;
        setPlanIncomplete(!!plan && plan.items.length > 0 && plan.items.some((i) => i.status !== 'completed'));
      })
      .catch(() => { if (alive) setPlanIncomplete(null); });
    return () => { alive = false; };
    // eslint - no react-hooks plugin in this repo's prod config (frontend/CLAUDE.md);
    // refreshToken is an intentional re-fetch trigger, not a value read in the body.
  }, [planFlagOn, refreshToken]);

  if (!isExplorer) {
    const card = findActiveNextCard(curriculum, buckets);
    return card ? { kind: 'classroom', card } : { kind: 'classroom-done' };
  }
  if (setupRemaining > 0) return { kind: 'setup', title: nextSetupStepTitle ?? 'Finish setting up' };
  if (planIncomplete) return { kind: 'plan' };
  return { kind: 'timeline' };
}
