import { useCallback, useEffect, useRef, useState } from 'react';
import { postPlan, type PrepPlan, type StoredPlan } from './careerPrepApi';
import type { ChatItem } from './CoraChat';
import { cards, cora } from './useRoomLog';

/**
 * Career Prep v27 (CP4.1): asks the SERVER to build a plan for the anchored interview (the client never
 * builds one), keeps it as the current plan, opens Your plan and offers "Start today's session". The
 * interview's existing active plan (loaded by useAnchorFlow) is the starting point.
 */
export type Minutes = 10 | 20 | 45;
export interface PlanMaker { plan: StoredPlan | null; busy: boolean; makePlan: (kind: PrepPlan['kind'], opts?: { minutes?: Minutes; focusSkill?: string }) => Promise<void> }

export function usePlanMaker(anchorId: string | null, loadedPlan: StoredPlan | null, askWhich: (opening: boolean) => void,
  push: (...i: ChatItem[]) => void, setError: (e: string) => void, onReady: () => void): PlanMaker {
  const [plan, setPlan] = useState<StoredPlan | null>(loadedPlan);
  const [busy, setBusy] = useState(false);
  const ready = useRef(onReady);
  ready.current = onReady;
  useEffect(() => { setPlan(loadedPlan); }, [loadedPlan]);

  const makePlan = useCallback(async (kind: PrepPlan['kind'], opts: { minutes?: Minutes; focusSkill?: string } = {}) => {
    if (!anchorId) { askWhich(false); return; }
    setBusy(true);
    try {
      const p = await postPlan({ interviewId: anchorId, kind, ...opts });
      setPlan(p);
      ready.current();
      const n = p.plan.days.length;
      push(cora(`Your plan is ready: ${n} ${n === 1 ? 'session' : 'sessions'}.`),
        cards('Next', [{ id: 'start', icon: 'play-circle-line', title: `Start today's session · ${p.plan.minutes} min`, line: 'The timer starts when you do.', badge: 'Now' }]));
    } catch { setError('Could not build the plan. Try again.'); } finally { setBusy(false); }
  }, [anchorId, askWhich, push, setError]);

  return { plan, busy, makePlan };
}
