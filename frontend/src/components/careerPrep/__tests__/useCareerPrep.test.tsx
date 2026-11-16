import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { useCareerPrep, type CareerPrepRoomState, type RoomHooks } from '../useCareerPrep';
import { askCoraApi, fetchActivePlan, fetchPrepDashboard, postInterview, postPlan, type PrepDashboard } from '../careerPrepApi';
import { centralLocalToIso } from '../InterviewForm';

jest.mock('../careerPrepApi', () => ({ fetchPrepDashboard: jest.fn(), postInterview: jest.fn(), askCoraApi: jest.fn(), fetchActivePlan: jest.fn(), postPlan: jest.fn() }));
const active = fetchActivePlan as jest.Mock;
const makePlan = postPlan as jest.Mock;
const dash = fetchPrepDashboard as jest.Mock;
const post = postInterview as jest.Mock;
const ask = askCoraApi as jest.Mock;

const empty: PrepDashboard = { interviews: [], skills: [], sources: { video: 0, phone_mock: 0, real_interview: 0, training: 0, project: 0 }, weeklyMinutes: [], streak: 0, thisWeek: 0 };
const acme = { id: 'i1', source: 'real' as const, company: 'Acme', role: 'AI Engineer', type: 'technical' as const, startsAt: '2026-11-19T20:00:00Z', target: 75 };
const withData: PrepDashboard = { ...empty, interviews: [acme], readiness: { value: 64, target: 75, trend: [] },
  skills: [{ key: 'p', label: 'Pace and clarity', score: 41, count: 4, sources: ['video'] }, { key: 'f', label: 'Few filler words', score: 48, count: 4, sources: ['video'] }] };

let state!: CareerPrepRoomState;
let host: HTMLDivElement | null = null;
let root: Root | null = null;
function Harness({ anchor, hooks }: { anchor: string | null; hooks: RoomHooks }): null { state = useCareerPrep(anchor, hooks); return null; }
async function mount(anchor: string | null = null, hooks: RoomHooks = {}): Promise<void> {
  const h = document.createElement('div');
  const r = createRoot(h);
  host = h; root = r;
  await act(async () => { r.render(<Harness anchor={anchor} hooks={hooks} />); });
  await act(async () => { await Promise.resolve(); });
}
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
afterEach(() => { if (root) { const r = root; act(() => r.unmount()); } host = null; root = null; });
beforeEach(() => { dash.mockReset(); post.mockReset(); ask.mockReset(); active.mockReset().mockResolvedValue(null); makePlan.mockReset(); });
const lastCards = () => [...state.log].reverse().find((i) => i.kind === 'cards') as Extract<typeof state.log[number], { kind: 'cards' }>;

describe('useCareerPrep (CP3.3, CP3.4)', () => {
  it('opens by asking what they are preparing for, with a card per real interview plus Add and Create', async () => {
    dash.mockResolvedValue(withData);
    await mount();
    expect(state.log[0]).toMatchObject({ kind: 'cora', text: 'Hi, I am Cora. What are you preparing for?' });
    expect(lastCards().cards.map((c) => c.id)).toEqual(['i1', 'add', 'create']);
  });

  it('anchors on a picked interview, echoes the pick, shows what their own data says, then offers plans', async () => {
    dash.mockResolvedValue(withData);
    await mount();
    await act(async () => { state.pick(lastCards().id, lastCards().cards[0]); });
    await flush();
    expect(state.log.some((i) => i.kind === 'me' && i.text === 'Acme · AI Engineer')).toBe(true);
    expect(state.anchorId).toBe('i1');
    expect(dash).toHaveBeenLastCalledWith('i1');
    expect(state.log.find((i) => i.kind === 'block')).toMatchObject({ title: 'What your data says about Acme' });
    expect(lastCards().label).toBe('Plans');
    expect(lastCards().cards[0].badge).toBe('Recommended');
  });

  it('picking a plan asks the server to build it and opens Your plan', async () => {
    dash.mockResolvedValue(withData);
    const onTab = jest.fn();
    await mount('i1', { onTab });
    await flush();
    makePlan.mockResolvedValue({ id: 'pl1', interviewId: 'i1', plan: { kind: 'days', minutes: 20, days: [{ date: '2026-11-16', label: 'Today', segments: [] }] } });
    await act(async () => { state.pick(lastCards().id, lastCards().cards.find((c) => c.id === 'plan:days')!); });
    await flush();
    expect(makePlan).toHaveBeenCalledWith({ interviewId: 'i1', kind: 'days' });
    expect(state.plan?.id).toBe('pl1');
    expect(onTab).toHaveBeenCalledWith('plan');
    expect(lastCards().cards[0].id).toBe('start');
  });

  it('Build my own asks for the time, then the skill, then builds a custom plan', async () => {
    dash.mockResolvedValue(withData);
    await mount('i1');
    await flush();
    makePlan.mockResolvedValue({ id: 'pl2', interviewId: 'i1', plan: { kind: 'custom', minutes: 10, days: [] } });
    await act(async () => { state.pick(lastCards().id, lastCards().cards.find((c) => c.id === 'plan:custom')!); });
    await act(async () => { state.pick(lastCards().id, lastCards().cards.find((c) => c.id === 'min:10')!); });
    await act(async () => { state.pick(lastCards().id, lastCards().cards.find((c) => c.id === 'focus:f')!); });
    await flush();
    expect(makePlan).toHaveBeenCalledWith({ interviewId: 'i1', kind: 'custom', minutes: 10, focusSkill: 'f' });
  });

  it('shows suggestion cards when Cora cannot answer', async () => {
    dash.mockResolvedValue(withData);
    await mount();
    ask.mockResolvedValue({ messages: ['I could not answer that just now.'], cards: [{ id: 'suggest:plan', icon: 'x', title: 'Suggest a plan', line: '' }] });
    await act(async () => { state.ask('anything'); });
    await flush();
    expect(lastCards().cards[0].id).toBe('suggest:plan');
  });

  it('says plainly when there is not enough data, instead of inventing an insight', async () => {
    dash.mockResolvedValue({ ...empty, interviews: [acme] });
    await mount('i1');
    await flush();
    expect(state.log.some((i) => i.kind === 'block')).toBe(false);
    expect(state.log.some((i) => i.kind === 'cora' && i.text.startsWith('I do not have enough of your practice yet'))).toBe(true);
  });

  it('Add an interview opens the form; saving anchors on the new interview', async () => {
    dash.mockResolvedValue(empty);
    await mount();
    await act(async () => { state.pick(lastCards().id, lastCards().cards.find((c) => c.id === 'add')!); });
    expect(state.form).toEqual({ mode: 'add' });
    post.mockResolvedValue({ id: 'new1', source: 'added' });
    dash.mockResolvedValue({ ...empty, interviews: [{ ...acme, id: 'new1', source: 'added' }] });
    await act(async () => { await state.submitForm({ mode: 'add', company: 'Acme', role: 'AI Engineer', type: 'technical', startsAt: null }); });
    await flush();
    expect(state.form).toBeNull();
    expect(state.anchorId).toBe('new1');
  });

  it('Create one for me asks for the type, then the role', async () => {
    dash.mockResolvedValue(empty);
    await mount();
    await act(async () => { state.pick(lastCards().id, lastCards().cards.find((c) => c.id === 'create')!); });
    expect(lastCards().cards.map((c) => c.id)).toContain('type:behavioral');
    await act(async () => { state.pick(lastCards().id, lastCards().cards.find((c) => c.id === 'type:behavioral')!); });
    expect(state.form).toEqual({ mode: 'practice', type: 'behavioral' });
  });

  it('routes the common asks without Cora, and sends anything else to her', async () => {
    dash.mockResolvedValue(withData);
    const onTab = jest.fn();
    await mount(null, { onTab });
    await act(async () => { state.ask('show my progress'); });
    expect(onTab).toHaveBeenCalledWith('progress');
    await act(async () => { state.ask('What should I work on?'); });
    expect(lastCards().cards.map((c) => c.title)).toEqual(['Pace and clarity', 'Few filler words']);
    expect(lastCards().cards[0].id).toBe('skill:p');
    expect(ask).not.toHaveBeenCalled();
    ask.mockResolvedValue({ messages: ['Lead with the result.'] });
    await act(async () => { state.ask('How do I open a technical interview?'); });
    await flush();
    expect(ask).toHaveBeenCalledWith('How do I open a technical interview?', undefined);
    expect(state.log[state.log.length - 1]).toMatchObject({ kind: 'cora', text: 'Lead with the result.' });
  });

  it('keeps talking when Cora cannot answer', async () => {
    dash.mockResolvedValue(withData);
    await mount();
    ask.mockRejectedValue(new Error('offline'));
    await act(async () => { state.ask('anything'); });
    await flush();
    expect(state.busy).toBe(false);
    expect(state.log[state.log.length - 1]).toMatchObject({ kind: 'cora' });
  });
});

describe('centralLocalToIso', () => {
  it('turns Central wall time into UTC across DST', () => {
    expect(centralLocalToIso('2026-11-19T14:00')).toBe('2026-11-19T20:00:00.000Z'); // CST
    expect(centralLocalToIso('2026-10-29T14:00')).toBe('2026-10-29T19:00:00.000Z'); // CDT
  });
  it('rejects a time that does not exist (spring forward) and malformed input', () => {
    expect(centralLocalToIso('2027-03-14T02:30')).toBeNull();
    expect(centralLocalToIso('tomorrow')).toBeNull();
  });
});
