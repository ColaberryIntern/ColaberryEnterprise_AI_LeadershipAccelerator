import { useCallback, useRef, useState } from 'react';
import { askCoraApi, type InterviewType, type PrepPlan, type PrepSkill } from './careerPrepApi';
import type { ChatItem } from './CoraChat';
import type { OptionCard } from './OptionCards';
import { routeAsk, type Sheet } from './logic/askRouter';
import { ADD_ID, CREATE_ID, typeCards } from './logic/anchorOptions';
import { focusCards, minuteCards } from './logic/planCards';
import type { Minutes } from './usePlanMaker';
import { cards, cora, me } from './useRoomLog';

/**
 * Career Prep v27 (CP3.4): what the student types and picks. `ask` routes the common asks in code
 * (askRouter) and sends the rest to Cora; `pickCard` dispatches a picked card by its id prefix (add,
 * create, type:, plan:, min:, focus:, skill:, start, suggest:, or an interview id).
 */
export type PrepForm = null | { mode: 'add' } | { mode: 'practice'; type: InterviewType };
export interface ConversationDeps {
  push: (...i: ChatItem[]) => void; skills: PrepSkill[]; anchorId: string | null; setForm: (f: PrepForm) => void;
  offerPlans: () => void; makePlan: (kind: PrepPlan['kind'], opts?: { minutes?: Minutes; focusSkill?: string }) => Promise<void>;
  anchorOn: (id: string) => Promise<void>; onTab: (t: 'progress' | 'plan' | 'session') => void; onSheet: (s: Sheet) => void; onStart: () => void;
}

export const ASK_ADD = 'Tell me about it. Paste the job description if you have it.';
const split = (id: string): [string, string] => (id.includes(':') ? [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)] : [id, '']);

export function useAsk(d: ConversationDeps): { ask: (text: string) => void; asking: boolean } {
  const [asking, setAsking] = useState(false);
  const ask = useCallback((text: string) => {
    d.push(me(text));
    const intent = routeAsk(text);
    if (intent.kind === 'add') { d.setForm({ mode: 'add' }); d.push(cora(ASK_ADD)); return; }
    if (intent.kind === 'progress') { d.onTab('progress'); d.push(cora('Your progress is open on the right.')); return; }
    if (intent.kind === 'plan') { d.offerPlans(); return; }
    if (intent.kind === 'quick') { void d.makePlan('custom', { minutes: 10 }); return; }
    if (intent.kind === 'sheet') { d.onSheet(intent.sheet); return; }
    if (intent.kind === 'weak') {
      const list = focusCards(d.skills).slice(0, 3).map((c) => ({ ...c, id: c.id.replace('focus:', 'skill:') }));
      d.push(...(list.length ? [cora('These are your three lowest skills right now. Pick one for 10 minutes on it.'), cards('Skills to work on', list)]
        : [cora('Record one or two answers and I will tell you what to work on first.')]));
      return;
    }
    setAsking(true);
    askCoraApi(intent.text, d.anchorId ?? undefined)
      .then((r) => { d.push(...r.messages.map(cora)); if (r.cards?.length) d.push(cards('Suggestions', r.cards)); })
      .catch(() => d.push(cora('I could not answer that just now. Try one of the suggestions below.')))
      .finally(() => setAsking(false));
  }, [d]);
  return { ask, asking };
}

export function usePickCard(d: ConversationDeps, ask: (text: string) => void): (card: OptionCard) => void {
  const minutes = useRef<Minutes>(20);
  return useCallback((card: OptionCard) => {
    const [kind, value] = split(card.id);
    if (kind === ADD_ID) { d.setForm({ mode: 'add' }); d.push(cora(ASK_ADD)); return; }
    if (kind === CREATE_ID) { d.push(cora('What kind of interview should I make?'), cards('Interview type', typeCards())); return; }
    if (kind === 'type') { d.setForm({ mode: 'practice', type: value as InterviewType }); d.push(cora('What role is it for?')); return; }
    if (kind === 'plan' && value === 'custom') { d.push(cora('How long?'), cards('Session length', minuteCards())); return; }
    if (kind === 'plan') { void d.makePlan(value as PrepPlan['kind']); return; }
    if (kind === 'min') {
      minutes.current = Number(value) as Minutes;
      const f = focusCards(d.skills);
      if (f.length) d.push(cora('Which skill?'), cards('Focus', f)); else void d.makePlan('custom', { minutes: minutes.current });
      return;
    }
    if (kind === 'focus') { void d.makePlan('custom', { minutes: minutes.current, focusSkill: value }); return; }
    if (kind === 'skill') { void d.makePlan('custom', { minutes: 10, focusSkill: value }); return; }
    if (kind === 'start') { d.onTab('session'); d.onStart(); return; }
    if (kind === 'suggest') { ask(card.title); return; }
    void d.anchorOn(card.id);
  }, [d, ask]);
}
