import { useCallback, useRef, useState } from 'react';
import { askCoraApi, postInterview, type InterviewType, type NewInterview, type PrepDashboard, type PrepPlan, type StoredPlan } from './careerPrepApi';
import type { ChatItem } from './CoraChat';
import type { OptionCard } from './OptionCards';
import { routeAsk, type Sheet } from './logic/askRouter';
import { ADD_ID, CREATE_ID, typeCards } from './logic/anchorOptions';
import { focusCards, minuteCards } from './logic/planCards';
import { useAnchorFlow, type Minutes } from './useAnchorFlow';
import { cards, cora, me, useRoomLog } from './useRoomLog';

/**
 * Career Prep v27 (CP3.3, CP3.4, CP4.1): the room's conversation, on top of useAnchorFlow. The ask box
 * routes the common asks in code (askRouter) and sends the rest to Cora; `pickCard` dispatches a picked
 * card by its id prefix (add, create, type:, plan:, min:, focus:, skill:, start, suggest:, or an interview).
 */
export type PrepForm = null | { mode: 'add' } | { mode: 'practice'; type: InterviewType };
export interface RoomHooks { onTab?: (tab: 'progress' | 'plan' | 'session') => void; onSheet?: (sheet: Sheet) => void; onStart?: () => void }
export interface CareerPrepRoomState {
  dashboard: PrepDashboard | null; anchorId: string | null; plan: StoredPlan | null; log: ChatItem[]; busy: boolean; form: PrepForm; error: string | null;
  pick: (setId: string, card: OptionCard) => void; ask: (text: string) => void; submitForm: (body: NewInterview) => Promise<void>;
  cancelForm: () => void; changeAnchor: () => void; chooseAnchor: (id: string) => void; focusSkill: (key: string) => void;
}

const ASK_ADD = 'Tell me about it. Paste the job description if you have it.';
const split = (id: string): [string, string] => (id.includes(':') ? [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)] : [id, '']);

export function useCareerPrep(initialAnchorId: string | null = null, hooks: RoomHooks = {}): CareerPrepRoomState {
  const { log, push, answer } = useRoomLog();
  const [form, setForm] = useState<PrepForm>(null);
  const [error, setErrorState] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const h = useRef(hooks);
  h.current = hooks;
  const minutes = useRef<Minutes>(20);
  const setError = useCallback((e: string) => setErrorState(e), []);
  const flow = useAnchorFlow(initialAnchorId, push, setError, () => h.current.onTab?.('plan'));

  const weakestCards = useCallback(() => {
    const list = focusCards(flow.dashboard?.skills ?? []).slice(0, 3).map((c) => ({ ...c, id: c.id.replace('focus:', 'skill:') }));
    if (!list.length) { push(cora('Record one or two answers and I will tell you what to work on first.')); return; }
    push(cora('These are your three lowest skills right now. Pick one for 10 minutes on it.'), cards('Skills to work on', list));
  }, [flow.dashboard, push]);

  const askFree = useCallback((text: string) => {
    setAsking(true);
    askCoraApi(text, flow.anchorId ?? undefined)
      .then((r) => { push(...r.messages.map(cora)); if (r.cards?.length) push(cards('Suggestions', r.cards)); })
      .catch(() => push(cora('I could not answer that just now. Try one of the suggestions below.')))
      .finally(() => setAsking(false));
  }, [flow.anchorId, push]);

  const ask = useCallback((text: string) => {
    push(me(text));
    const intent = routeAsk(text);
    if (intent.kind === 'add') { setForm({ mode: 'add' }); push(cora(ASK_ADD)); return; }
    if (intent.kind === 'progress') { h.current.onTab?.('progress'); push(cora('Your progress is open on the right.')); return; }
    if (intent.kind === 'weak') { weakestCards(); return; }
    if (intent.kind === 'plan') { flow.offerPlans(); return; }
    if (intent.kind === 'quick') { void flow.makePlan('custom', { minutes: 10 }); return; }
    if (intent.kind === 'sheet') { h.current.onSheet?.(intent.sheet); return; }
    askFree(intent.text);
  }, [push, weakestCards, flow, askFree]);

  const pickCard = useCallback((card: OptionCard) => {
    const [kind, value] = split(card.id);
    if (kind === ADD_ID) { setForm({ mode: 'add' }); push(cora(ASK_ADD)); return; }
    if (kind === CREATE_ID) { push(cora('What kind of interview should I make?'), cards('Interview type', typeCards())); return; }
    if (kind === 'type') { setForm({ mode: 'practice', type: value as InterviewType }); push(cora('What role is it for?')); return; }
    if (kind === 'plan' && value === 'custom') { push(cora('How long?'), cards('Session length', minuteCards())); return; }
    if (kind === 'plan') { void flow.makePlan(value as PrepPlan['kind']); return; }
    if (kind === 'min') {
      minutes.current = Number(value) as Minutes;
      const f = focusCards(flow.dashboard?.skills ?? []);
      if (f.length) push(cora('Which skill?'), cards('Focus', f)); else void flow.makePlan('custom', { minutes: minutes.current });
      return;
    }
    if (kind === 'focus') { void flow.makePlan('custom', { minutes: minutes.current, focusSkill: value }); return; }
    if (kind === 'skill') { void flow.makePlan('custom', { minutes: 10, focusSkill: value }); return; }
    if (kind === 'start') { h.current.onTab?.('session'); h.current.onStart?.(); return; }
    if (kind === 'suggest') { ask(card.title); return; }
    void flow.anchorOn(card.id);
  }, [push, flow, ask]);

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
    dashboard: flow.dashboard, anchorId: flow.anchorId, plan: flow.plan, log, busy: flow.busy || asking, form, error, pick, ask, submitForm,
    cancelForm: () => setForm(null), changeAnchor: () => flow.askWhich(false), chooseAnchor: (id) => { void flow.anchorOn(id); },
    focusSkill: (key) => { void flow.makePlan('custom', { minutes: 10, focusSkill: key }); },
  };
}
