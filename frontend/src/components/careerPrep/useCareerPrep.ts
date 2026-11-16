import { useCallback, useMemo, useRef, useState } from 'react';
import { postInterview, type NewInterview, type PrepDashboard, type StoredPlan } from './careerPrepApi';
import type { ChatItem } from './CoraChat';
import type { OptionCard } from './OptionCards';
import type { Sheet } from './logic/askRouter';
import { useAnchorFlow } from './useAnchorFlow';
import { usePlanMaker } from './usePlanMaker';
import { useAsk, usePickCard, type ConversationDeps, type PrepForm } from './useConversation';
import { cora, me, useRoomLog } from './useRoomLog';

/**
 * Career Prep v27 (CP3.3, CP3.4, CP4.1): the room's conversation, composed from small hooks:
 * useRoomLog (the chat), useAnchorFlow (which interview), usePlanMaker (the server-built plan),
 * useAsk / usePickCard (what the student types and picks).
 */
export type { PrepForm } from './useConversation';
export interface RoomHooks { onTab?: (tab: 'progress' | 'plan' | 'session') => void; onSheet?: (sheet: Sheet) => void; onStart?: () => void }
export interface CareerPrepRoomState {
  dashboard: PrepDashboard | null; anchorId: string | null; plan: StoredPlan | null; log: ChatItem[]; busy: boolean; form: PrepForm; error: string | null;
  pick: (setId: string, card: OptionCard) => void; ask: (text: string) => void; submitForm: (body: NewInterview) => Promise<void>;
  cancelForm: () => void; changeAnchor: () => void; chooseAnchor: (id: string) => void; focusSkill: (key: string) => void;
}

export function useCareerPrep(initialAnchorId: string | null = null, hooks: RoomHooks = {}): CareerPrepRoomState {
  const { log, push, answer } = useRoomLog();
  const [form, setForm] = useState<PrepForm>(null);
  const [error, setErrorState] = useState<string | null>(null);
  const h = useRef(hooks);
  h.current = hooks;
  const setError = useCallback((e: string) => setErrorState(e), []);
  const flow = useAnchorFlow(initialAnchorId, push, setError);
  const planner = usePlanMaker(flow.anchorId, flow.loadedPlan, flow.askWhich, push, setError, () => h.current.onTab?.('plan'));
  const deps = useMemo<ConversationDeps>(() => ({
    push, skills: flow.dashboard?.skills ?? [], anchorId: flow.anchorId, setForm, offerPlans: flow.offerPlans, makePlan: planner.makePlan, anchorOn: flow.anchorOn,
    onTab: (t) => h.current.onTab?.(t), onSheet: (s) => h.current.onSheet?.(s), onStart: () => h.current.onStart?.(),
  }), [push, flow.dashboard, flow.anchorId, flow.offerPlans, flow.anchorOn, planner.makePlan]);
  const { ask, asking } = useAsk(deps);
  const pickCard = usePickCard(deps, ask);
  const pick = useCallback((setId: string, card: OptionCard) => { answer(setId); push(me(card.title)); pickCard(card); }, [answer, push, pickCard]);

  const submitForm = useCallback(async (body: NewInterview) => {
    try {
      const r = await postInterview(body);
      setForm(null);
      push(cora(r.source === 'practice' ? 'Your practice interview is set for the next 4 days.' : 'Saved. Here is where you stand for it.'));
      await flow.anchorOn(r.id);
    } catch { setError('Could not save the interview. Check the details and try again.'); }
  }, [push, flow, setError]);

  return {
    dashboard: flow.dashboard, anchorId: flow.anchorId, plan: planner.plan, log, busy: flow.busy || planner.busy || asking, form, error, pick, ask, submitForm,
    cancelForm: () => setForm(null), changeAnchor: () => flow.askWhich(false), chooseAnchor: (id) => { void flow.anchorOn(id); },
    focusSkill: (key) => { void planner.makePlan('custom', { minutes: 10, focusSkill: key }); },
  };
}
