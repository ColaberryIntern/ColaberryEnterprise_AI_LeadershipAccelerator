import { useCallback, useEffect, useRef, useState } from 'react';
import { askCoraApi, fetchPrepDashboard, postInterview, type InterviewType, type NewInterview, type PrepDashboard } from './careerPrepApi';
import type { ChatItem } from './CoraChat';
import type { OptionCard } from './OptionCards';
import { routeAsk, type Sheet } from './logic/askRouter';
import { ADD_ID, anchorCards, CREATE_ID, insightLines, typeCards } from './logic/anchorOptions';

/**
 * Career Prep v27 (CP3.3, CP3.4): the room's conversation. Cora opens by asking what the student is
 * preparing for (anchor cards). Picking a real interview anchors the room and shows what their own data
 * says; "Add an interview" and "Create one for me" open the form. The ask box routes the common asks
 * without a model (askRouter) and sends the rest to Cora. Plans (CP4) plug in where `onPlan` is called.
 */
export type PrepForm = null | { mode: 'add' } | { mode: 'practice'; type: InterviewType };
export interface CareerPrepRoomState {
  dashboard: PrepDashboard | null;
  anchorId: string | null;
  log: ChatItem[];
  busy: boolean;
  form: PrepForm;
  error: string | null;
  pick: (setId: string, card: OptionCard) => void;
  ask: (text: string) => void;
  submitForm: (body: NewInterview) => Promise<void>;
  cancelForm: () => void;
  changeAnchor: () => void;
}
export interface RoomHooks { onTab?: (tab: 'progress' | 'plan' | 'session') => void; onSheet?: (sheet: Sheet) => void; onPlan?: (kind: 'plan' | 'quick') => void }

let seq = 0;
const nid = (p: string) => `${p}-${++seq}`;
const cora = (text: string): ChatItem => ({ id: nid('c'), kind: 'cora', text });
const me = (text: string): ChatItem => ({ id: nid('m'), kind: 'me', text });
const cards = (label: string, list: OptionCard[]): ChatItem => ({ id: nid('s'), kind: 'cards', label, cards: list });

export function useCareerPrep(initialAnchorId: string | null = null, hooks: RoomHooks = {}): CareerPrepRoomState {
  const [dashboard, setDashboard] = useState<PrepDashboard | null>(null);
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [log, setLog] = useState<ChatItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<PrepForm>(null);
  const [error, setError] = useState<string | null>(null);
  const hooksRef = useRef(hooks);
  hooksRef.current = hooks;
  const push = useCallback((...items: ChatItem[]) => setLog((l) => [...l, ...items]), []);
  const answer = useCallback((setId: string) => setLog((l) => l.map((i) => (i.id === setId && i.kind === 'cards' ? { ...i, answered: true } : i))), []);

  const askWhich = useCallback((d: PrepDashboard, opening: boolean) => {
    push(cora(opening ? 'Hi, I am Cora. What are you preparing for?' : 'Which interview are we preparing for?'), cards('What are you preparing for?', anchorCards(d.interviews)));
  }, [push]);

  const anchorOn = useCallback(async (id: string) => {
    setBusy(true);
    try {
      const d = await fetchPrepDashboard(id);
      setDashboard(d);
      setAnchorId(id);
      const iv = d.interviews.find((i) => i.id === id);
      const lines = insightLines(d);
      const items: ChatItem[] = [];
      if (lines.length) items.push({ id: nid('b'), kind: 'block', title: `What your data says${iv ? ` about ${iv.company}` : ''}`, lines });
      else items.push(cora('I do not have enough of your practice yet to say where you stand. Your first session will give me a starting point.'));
      push(...items);
      hooksRef.current.onPlan?.('plan');
    } catch {
      setError('Could not load that interview. Try again.');
    } finally { setBusy(false); }
  }, [push]);

  useEffect(() => {
    let live = true;
    fetchPrepDashboard().then((d) => {
      if (!live) return;
      setDashboard(d);
      if (initialAnchorId && d.interviews.some((i) => i.id === initialAnchorId)) void anchorOn(initialAnchorId);
      else askWhich(d, true);
    }).catch(() => { if (live) setError('Could not load Career Prep. Try again.'); });
    return () => { live = false; };
  }, [initialAnchorId, anchorOn, askWhich]);

  const pick = useCallback((setId: string, card: OptionCard) => {
    answer(setId);
    push(me(card.title));
    if (card.id === ADD_ID) { setForm({ mode: 'add' }); push(cora('Tell me about it. Paste the job description if you have it.')); return; }
    if (card.id === CREATE_ID) { push(cora('What kind of interview should I make?'), cards('Interview type', typeCards())); return; }
    if (card.id.startsWith('type:')) { setForm({ mode: 'practice', type: card.id.slice(5) as InterviewType }); push(cora('What role is it for?')); return; }
    if (card.id.startsWith('skill:')) { hooksRef.current.onTab?.('progress'); return; }
    void anchorOn(card.id);
  }, [answer, push, anchorOn]);

  const submitForm = useCallback(async (body: NewInterview) => {
    setBusy(true);
    try {
      const r = await postInterview(body);
      setForm(null);
      push(cora(r.source === 'practice' ? 'Your practice interview is set for the next 4 days.' : 'Saved. Here is where you stand for it.'));
      setBusy(false);
      await anchorOn(r.id);
    } catch {
      setBusy(false);
      setError('Could not save the interview. Check the details and try again.');
    }
  }, [push, anchorOn]);

  const weakest = useCallback(() => {
    const scored = (dashboard?.skills ?? []).filter((s) => s.score !== undefined).slice(0, 3);
    if (!scored.length) { push(cora('Record one or two answers and I will tell you what to work on first.')); return; }
    push(cora('These are your three lowest skills right now.'), cards('Skills to work on', scored.map((s) => ({ id: `skill:${s.key}`, icon: 'focus-2-line', title: s.label, line: `${s.score} now`, bar: { value: s.score as number } }))));
  }, [dashboard, push]);

  const ask = useCallback((text: string) => {
    push(me(text));
    const intent = routeAsk(text);
    if (intent.kind === 'add') { setForm({ mode: 'add' }); push(cora('Tell me about it. Paste the job description if you have it.')); return; }
    if (intent.kind === 'progress') { hooksRef.current.onTab?.('progress'); push(cora('Your progress is open on the right.')); return; }
    if (intent.kind === 'weak') { weakest(); return; }
    if (intent.kind === 'plan' || intent.kind === 'quick') { hooksRef.current.onPlan?.(intent.kind); return; }
    if (intent.kind === 'sheet') { hooksRef.current.onSheet?.(intent.sheet); return; }
    setBusy(true);
    askCoraApi(intent.text, anchorId ?? undefined)
      .then((r) => push(...r.messages.map(cora)))
      .catch(() => push(cora('I could not answer that just now. Try one of the suggestions below.')))
      .finally(() => setBusy(false));
  }, [push, weakest, anchorId]);

  const changeAnchor = useCallback(() => { if (dashboard) askWhich(dashboard, false); }, [dashboard, askWhich]);
  const cancelForm = useCallback(() => setForm(null), []);

  return { dashboard, anchorId, log, busy, form, error, pick, ask, submitForm, cancelForm, changeAnchor };
}
