import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import axe from 'axe-core';
import CallExplorerTab from '../CallExplorerTab';
import TrustCenterTab from '../TrustCenterTab';
import QualityTab, { runTone } from '../QualityTab';
import CostsTab from '../CostsTab';

const mockApi: Record<string, jest.Mock> = { listCalls: jest.fn(), getCall: jest.fn(), exportTimeline: jest.fn(), getQuality: jest.fn(), getCosts: jest.fn() };
jest.mock('../../../../services/voiceStudioApi', () => ({
  ...jest.requireActual('../../../../services/voiceStudioApi'),
  listCalls: (...a: unknown[]) => mockApi.listCalls(...a),
  getCall: (...a: unknown[]) => mockApi.getCall(...a),
  exportTimeline: (...a: unknown[]) => mockApi.exportTimeline(...a),
  getQuality: (...a: unknown[]) => mockApi.getQuality(...a),
  getCosts: (...a: unknown[]) => mockApi.getCosts(...a),
}));
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CALL = { id: 'c1', engine: 'conversation_relay', direction: 'outbound', state: 'completed', purpose: 'interest', test_mode: true, human_answered: true, duration_seconds: null, cost_usd: null, error_class: null, created_at: '2026-11-24T20:00:00Z' };
const ENTRY = (p: object) => ({ at: '2026-11-24T20:00:10Z', actorType: 'ai', actor: 'AI agent', action: 'tool_x', verdict: 'allowed', detail: 'The agent used "next_open_strategy_slots": completed', sourceId: 's1', ...p });
const DETAIL = {
  call: { ...CALL, provider_call_id_masked: 'CA****abcd', consent_ref: null }, turns: [], usage: [],
  reconciliation: { logged: true, logStatus: 'delivered', transcriptState: 'pending_review' },
  timeline: [ENTRY({}), ENTRY({ sourceId: 's2', action: 'tool_book_meeting', verdict: 'denied', detail: 'The agent asked for "book_meeting" and was refused' })],
};
const COSTS = { days: 30, byProvider: [{ provider: 'twilio', measured: true, usd: '0.1234', rows: 2, unpriced: 0 }, { provider: 'openai', measured: false, usd: null, rows: 1, unpriced: 1 }], activeCalls: 0, reservations: [], deadLetters: [], caps: { testAttemptsPerRun: 3, testMaxSeconds: 180, testBudgetUsd: 5 } };
const RUN = { engine: 'conversation_relay', scenario_set: 'smoke', environment: 'test', created_at: '2026-11-24T20:00:00Z' };
const QUALITY = { passMark: 90, rubric: [{ key: 'ai_disclosure', weight: 20, critical: true }], runs: [
  { ...RUN, id: 'a', verdict: 'pass', evidence_ref: 'ev-1' }, { ...RUN, id: 'b', verdict: 'pass', evidence_ref: null }, { ...RUN, id: 'c', verdict: 'fail', evidence_ref: 'ev-2' }, { ...RUN, id: 'd', scenario_set: 'voice_ab', verdict: 'scored', evidence_ref: null }] };

let container: HTMLDivElement;
let root: Root;
const settle = async (): Promise<void> => { for (let i = 0; i < 8; i += 1) await act(async () => { await Promise.resolve(); }); };
async function render(el: React.ReactElement, path = '/'): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<MemoryRouter initialEntries={[path]}>{el}</MemoryRouter>); });
  await settle();
}
const click = async (label: string) => {
  const b = Array.from(container.querySelectorAll('button')).find((x) => (x.textContent ?? '').trim() === label) as HTMLButtonElement;
  await act(async () => { b.click(); });
  await settle();
};
const text = (id: string) => container.querySelector(`[data-testid="${id}"]`)?.textContent ?? '';

beforeEach(() => {
  mockApi.listCalls.mockReset().mockResolvedValue([CALL]);
  mockApi.getCall.mockReset().mockResolvedValue(DETAIL);
  mockApi.exportTimeline.mockReset().mockResolvedValue('blob:csv');
  mockApi.getQuality.mockReset().mockResolvedValue(QUALITY);
  mockApi.getCosts.mockReset().mockResolvedValue(COSTS);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe('Call Explorer', () => {
  it('filters re-query; a missing cost or duration reads "No data"', async () => {
    await render(<CallExplorerTab />);
    expect(container.querySelector('tbody')?.textContent).toContain('No data');
    const sel = container.querySelector('[aria-label="Engine"]') as HTMLSelectElement;
    await act(async () => { sel.value = 'openai_realtime'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    await settle();
    expect(mockApi.listCalls).toHaveBeenLastCalledWith(expect.objectContaining({ days: 7, engine: 'openai_realtime' }));
    await click('Open');
    expect(text('call-detail')).toContain('transcript pending review');
    expect(text('call-detail')).toContain('CA****abcd');
    expect(text('call-detail')).toContain('Not recorded');
  });

  it('an empty list says so; 404 shows switched off', async () => {
    mockApi.listCalls.mockResolvedValue([]);
    await render(<CallExplorerTab />);
    expect(text('calls-empty')).toContain('No calls match');
    act(() => root.unmount());
    container.remove();
    mockApi.listCalls.mockRejectedValue({ response: { status: 404 } });
    await render(<CallExplorerTab />);
    expect(container.textContent).toContain('switched off');
  });
});

describe('Trust Center', () => {
  it('shows the tool event of a call, denied actions included, and can filter to them', async () => {
    await render(<TrustCenterTab />, '/?call=c1');
    expect(text('timeline')).toContain('next_open_strategy_slots');
    expect(container.querySelectorAll('[data-verdict="denied"]').length).toBe(1);
    await act(async () => { (container.querySelector('#tc-denied') as HTMLInputElement).click(); });
    expect(text('timeline')).not.toContain('next_open_strategy_slots');
    expect(text('timeline')).toContain('was refused');
  });

  it('out-of-order responses never show one call under another', async () => {
    const waiting: Record<string, (v: unknown) => void> = {};
    const of = (id: string) => ({ ...DETAIL, timeline: [ENTRY({ detail: `FROM ${id}` })] });
    mockApi.listCalls.mockResolvedValue(['c1', 'c2', 'c3'].map((id) => ({ ...CALL, id })));
    mockApi.getCall.mockImplementation((id: string) => (id === 'c1' ? Promise.resolve(of('c1')) : new Promise((r) => { waiting[id] = r; })));
    const choose = async (id: string) => {
      const sel = container.querySelector('#tc-call') as HTMLSelectElement | null;
      if (sel) await act(async () => { sel.value = id; sel.dispatchEvent(new Event('change', { bubbles: true })); });
      await settle();
    };
    await render(<TrustCenterTab />, '/?call=c1');
    expect(text('timeline')).toContain('FROM c1');
    const picker = container.querySelector('#tc-call') as HTMLSelectElement;
    picker.focus();
    await choose('c2');
    expect(container.textContent).not.toContain('FROM c1'); // loading c2 hides c1 at once
    expect(document.activeElement).toBe(picker); // VS3.7: keyboard focus stays on the picker while it loads
    await act(async () => { waiting.c2(of('c2')); });
    await settle();
    expect(text('timeline')).toContain('FROM c2');
  });

  it('the call explorer ignores a superseded open', async () => {
    const waiting: Record<string, (v: unknown) => void> = {};
    mockApi.listCalls.mockResolvedValue(['c1', 'c2'].map((id) => ({ ...CALL, id })));
    mockApi.getCall.mockImplementation((id: string) => new Promise((r) => { waiting[id] = r; }));
    await render(<CallExplorerTab />);
    const opens = Array.from(container.querySelectorAll('tbody button')) as HTMLButtonElement[];
    await act(async () => { opens[0].click(); opens[1].click(); });
    await act(async () => { waiting.c2({ ...DETAIL, call: { ...DETAIL.call, purpose: 'second' } }); });
    await act(async () => { waiting.c1({ ...DETAIL, call: { ...DETAIL.call, purpose: 'first' } }); });
    await settle();
    expect(text('call-detail')).toContain('second');
  });

  it('a superseded list response is dropped (the hook every tab shares)', async () => {
    const waiting: Array<(v: unknown) => void> = [];
    mockApi.listCalls.mockImplementation(() => new Promise((r) => { waiting.push(r); }));
    await render(<CallExplorerTab />);
    const sel = container.querySelector('[aria-label="Engine"]') as HTMLSelectElement;
    await act(async () => { sel.value = 'openai_realtime'; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => { waiting[1]([]); });
    await act(async () => { waiting[0]([CALL]); });
    await settle();
    expect(text('calls-empty')).toContain('No calls match');
  });

  it('export: a link for an approver, an explanation on 403', async () => {
    await render(<TrustCenterTab />, '/?call=c1');
    await click('Prepare audit export');
    expect(container.querySelector('a[download]')?.getAttribute('href')).toBe('blob:csv');
    mockApi.exportTimeline.mockRejectedValue({ response: { status: 403 } });
    await click('Prepare audit export');
    expect(text('export-error')).toContain('approver role');
    const sel = container.querySelector('#tc-call') as HTMLSelectElement;
    await act(async () => { sel.value = ''; sel.dispatchEvent(new Event('change', { bubbles: true })); });
    await settle();
    expect(container.querySelector('[data-testid="export-error"]')).toBeNull(); // VS3.7: the error belonged to the other call
  });
});

it('Quality: a pass without recorded evidence is never green', async () => {
  await render(<QualityTab />);
  expect(text('run-a')).toContain('pass');
  expect(text('run-b')).toContain('no evidence');
  expect(QUALITY.runs.map((r) => runTone(r))).toEqual(['success', 'neutral', 'danger', 'neutral']);
  expect(runTone({ verdict: 'pass', evidence_ref: '' })).toBe('neutral');
  expect(text('failures')).toBe('Scenario failures: 1. Blind voice comparisons: 1 (1 scored).');
});

it('Costs: actual and estimated are separate, an unpriced provider is "No data", and live caps say not set up', async () => {
  await render(<CostsTab />);
  expect(text('spend-twilio-actual')).toContain('$0.1234');
  expect(text('spend-openai-estimated')).toContain('No data');
  expect(text('caps')).toContain('not set up');
  await click('Last 90 days');
  expect(mockApi.getCosts).toHaveBeenLastCalledWith(90);
});

it.each([['calls', <CallExplorerTab />], ['trust', <TrustCenterTab />], ['quality', <QualityTab />], ['costs', <CostsTab />]])('%s has no serious accessibility violations', async (_n, el) => {
  await render(el, '/?call=c1');
  const r = await axe.run(container, { runOnly: ['wcag2a', 'wcag2aa'] });
  expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
});
