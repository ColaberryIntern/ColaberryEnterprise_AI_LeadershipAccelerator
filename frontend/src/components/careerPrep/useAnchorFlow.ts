import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchActivePlan, fetchPrepDashboard, postPlan, type PrepDashboard, type PrepPlan, type StoredPlan } from './careerPrepApi';
import type { ChatItem } from './CoraChat';
import { anchorCards, insightLines } from './logic/anchorOptions';
import { planCards } from './logic/planCards';
import { block, cards, cora } from './useRoomLog';

/**
 * Career Prep v27 (CP3.3, CP4.1): which interview the room is for, and its plan. Loads the dashboard,
 * asks which interview (or anchors on ?anchor=), shows what the student's own data says, offers plans,
 * and asks the SERVER to build the chosen plan.
 */
export type Minutes = 10 | 20 | 45;
export interface AnchorFlow {
  dashboard: PrepDashboard | null; anchorId: string | null; plan: StoredPlan | null; busy: boolean;
  askWhich: (opening: boolean) => void; offerPlans: () => void; anchorOn: (id: string) => Promise<void>;
  makePlan: (kind: PrepPlan['kind'], opts?: { minutes?: Minutes; focusSkill?: string }) => Promise<void>;
}

export function useAnchorFlow(initialAnchorId: string | null, push: (...i: ChatItem[]) => void, setError: (e: string) => void, onPlanReady: () => void): AnchorFlow {
  const [dashboard, setDashboard] = useState<PrepDashboard | null>(null);
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [plan, setPlan] = useState<StoredPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const ready = useRef(onPlanReady);
  ready.current = onPlanReady;

  const askWhichFor = useCallback((d: PrepDashboard, opening: boolean) => {
    push(cora(opening ? 'Hi, I am Cora. What are you preparing for?' : 'Which interview are we preparing for?'), cards('What are you preparing for?', anchorCards(d.interviews)));
  }, [push]);

  const offerFor = useCallback((d: PrepDashboard, id: string) => {
    const iv = d.interviews.find((i) => i.id === id);
    if (iv) push(cora('How do you want to prepare? I recommend the first one.'), cards('Plans', planCards(iv)));
  }, [push]);

  const anchorOn = useCallback(async (id: string) => {
    setBusy(true);
    try {
      const [d, existing] = await Promise.all([fetchPrepDashboard(id), fetchActivePlan(id).catch(() => null)]);
      setDashboard(d); setAnchorId(id); setPlan(existing);
      const iv = d.interviews.find((i) => i.id === id);
      const lines = insightLines(d);
      push(lines.length ? block(`What your data says${iv ? ` about ${iv.company}` : ''}`, lines)
        : cora('I do not have enough of your practice yet to say where you stand. Your first session will give me a starting point.'));
      offerFor(d, id);
    } catch { setError('Could not load that interview. Try again.'); } finally { setBusy(false); }
  }, [push, offerFor, setError]);

  const makePlan = useCallback(async (kind: PrepPlan['kind'], opts: { minutes?: Minutes; focusSkill?: string } = {}) => {
    if (!anchorId) { if (dashboard) askWhichFor(dashboard, false); return; }
    setBusy(true);
    try {
      const p = await postPlan({ interviewId: anchorId, kind, ...opts });
      setPlan(p);
      ready.current();
      push(cora(`Your plan is ready: ${p.plan.days.length} ${p.plan.days.length === 1 ? 'session' : 'sessions'}.`),
        cards('Next', [{ id: 'start', icon: 'play-circle-line', title: `Start today's session · ${p.plan.minutes} min`, line: 'The timer starts when you do.', badge: 'Now' }]));
    } catch { setError('Could not build the plan. Try again.'); } finally { setBusy(false); }
  }, [anchorId, dashboard, askWhichFor, push, setError]);

  useEffect(() => {
    let live = true;
    fetchPrepDashboard().then((d) => {
      if (!live) return;
      setDashboard(d);
      if (initialAnchorId && d.interviews.some((i) => i.id === initialAnchorId)) void anchorOn(initialAnchorId);
      else askWhichFor(d, true);
    }).catch(() => { if (live) setError('Could not load Career Prep. Try again.'); });
    return () => { live = false; };
  }, [initialAnchorId, anchorOn, askWhichFor, setError]);

  const askWhich = useCallback((opening: boolean) => { if (dashboard) askWhichFor(dashboard, opening); }, [dashboard, askWhichFor]);
  const offerPlans = useCallback(() => { if (dashboard && anchorId) offerFor(dashboard, anchorId); else askWhich(false); }, [dashboard, anchorId, offerFor, askWhich]);

  return { dashboard, anchorId, plan, busy, askWhich, offerPlans, anchorOn, makePlan };
}
