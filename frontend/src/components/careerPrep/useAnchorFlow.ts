import { useCallback, useEffect, useState } from 'react';
import { fetchActivePlan, fetchPrepDashboard, type PrepDashboard, type StoredPlan } from './careerPrepApi';
import type { ChatItem } from './CoraChat';
import { anchorCards, insightLines } from './logic/anchorOptions';
import { planCards } from './logic/planCards';
import { block, cards, cora } from './useRoomLog';

/**
 * Career Prep v27 (CP3.3): which interview the room is for. Loads the dashboard, asks which interview
 * (or anchors on ?anchor=), shows what the student's own data says, loads that interview's active plan,
 * and offers plans. Building a plan is usePlanMaker's job.
 */
export interface AnchorFlow {
  dashboard: PrepDashboard | null; anchorId: string | null; loadedPlan: StoredPlan | null; busy: boolean;
  askWhich: (opening: boolean) => void; offerPlans: () => void; anchorOn: (id: string) => Promise<void>;
  /** Reload the dashboard for the current interview, quietly (no chat), e.g. after a session (CP4.5). */
  reload: () => Promise<void>;
}

export function useAnchorFlow(initialAnchorId: string | null, push: (...i: ChatItem[]) => void, setError: (e: string) => void): AnchorFlow {
  const [dashboard, setDashboard] = useState<PrepDashboard | null>(null);
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [loadedPlan, setLoadedPlan] = useState<StoredPlan | null>(null);
  const [busy, setBusy] = useState(false);

  const askWhichFor = useCallback((d: PrepDashboard, opening: boolean) => push(
    cora(opening ? 'Hi, I am Cora. What are you preparing for?' : 'Which interview are we preparing for?'), cards('What are you preparing for?', anchorCards(d.interviews)),
  ), [push]);
  const offerFor = useCallback((d: PrepDashboard, id: string) => {
    const iv = d.interviews.find((i) => i.id === id);
    if (iv) push(cora('How do you want to prepare? I recommend the first one.'), cards('Plans', planCards(iv)));
  }, [push]);

  const anchorOn = useCallback(async (id: string) => {
    setBusy(true);
    try {
      const [d, existing] = await Promise.all([fetchPrepDashboard(id), fetchActivePlan(id).catch(() => null)]);
      setDashboard(d); setAnchorId(id); setLoadedPlan(existing);
      const iv = d.interviews.find((i) => i.id === id);
      const lines = insightLines(d);
      push(lines.length ? block(`What your data says${iv ? ` about ${iv.company}` : ''}`, lines)
        : cora('I do not have enough of your practice yet to say where you stand. Your first session will give me a starting point.'));
      offerFor(d, id);
    } catch { setError('Could not load that interview. Try again.'); } finally { setBusy(false); }
  }, [push, offerFor, setError]);

  useEffect(() => {
    let live = true;
    fetchPrepDashboard().then((d) => {
      if (!live) return;
      setDashboard(d);
      if (initialAnchorId && d.interviews.some((i) => i.id === initialAnchorId)) void anchorOn(initialAnchorId); else askWhichFor(d, true);
    }).catch(() => { if (live) setError('Could not load Career Prep. Try again.'); });
    return () => { live = false; };
  }, [initialAnchorId, anchorOn, askWhichFor, setError]);

  const askWhich = useCallback((opening: boolean) => { if (dashboard) askWhichFor(dashboard, opening); }, [dashboard, askWhichFor]);
  const offerPlans = useCallback(() => { if (dashboard && anchorId) offerFor(dashboard, anchorId); else askWhich(false); }, [dashboard, anchorId, offerFor, askWhich]);
  const reload = useCallback(async () => {
    try { setDashboard(await fetchPrepDashboard(anchorId ?? undefined)); } catch { setError('Could not refresh your progress. Reopen the room to see it.'); }
  }, [anchorId, setError]);
  return { dashboard, anchorId, loadedPlan, busy, askWhich, offerPlans, anchorOn, reload };
}
