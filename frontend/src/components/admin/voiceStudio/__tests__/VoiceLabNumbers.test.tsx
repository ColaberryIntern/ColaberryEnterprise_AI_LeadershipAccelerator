import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import axe from 'axe-core';
import VoiceLabTab from '../VoiceLabTab';
import NumbersRoutingTab from '../NumbersRoutingTab';
import type { CatalogVoice, RouteRow } from '../../../../services/voiceStudioApi';

const mockApi: Record<string, jest.Mock> = {
  getCatalog: jest.fn(), previewVoice: jest.fn(), createTrial: jest.fn(), trialClip: jest.fn(), scoreTrial: jest.fn(),
  startTestCall: jest.fn(), stopTestCall: jest.fn(), listNumbers: jest.fn(), listRoutes: jest.fn(), validateRoute: jest.fn(), applyRoute: jest.fn(),
};
jest.mock('../../../../services/voiceStudioApi', () => ({
  ...jest.requireActual('../../../../services/voiceStudioApi'),
  getCatalog: (...a: unknown[]) => mockApi.getCatalog(...a),
  previewVoice: (...a: unknown[]) => mockApi.previewVoice(...a),
  createTrial: (...a: unknown[]) => mockApi.createTrial(...a),
  trialClip: (...a: unknown[]) => mockApi.trialClip(...a),
  scoreTrial: (...a: unknown[]) => mockApi.scoreTrial(...a),
  startTestCall: (...a: unknown[]) => mockApi.startTestCall(...a),
  stopTestCall: (...a: unknown[]) => mockApi.stopTestCall(...a),
  listNumbers: (...a: unknown[]) => mockApi.listNumbers(...a),
  listRoutes: (...a: unknown[]) => mockApi.listRoutes(...a),
  validateRoute: (...a: unknown[]) => mockApi.validateRoute(...a),
  applyRoute: (...a: unknown[]) => mockApi.applyRoute(...a),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CATALOG: CatalogVoice[] = [
  { engine: 'openai_realtime', id: 'marin', label: 'Marin', recommended: true, preview: 'tts_approximation', source: 's' },
  { engine: 'openai_realtime', id: 'cedar', label: 'Cedar', recommended: true, preview: 'tts_approximation', source: 's' },
  { engine: 'conversation_relay', id: 'UgBBYS2sOqTuMpoF3BR0', label: 'Twilio default (en-US)', recommended: true, preview: 'test_call_only', source: 's' },
];
const ROUTE: RouteRow = { id: 'r1', path_key: 'interest', call_type: 'interest', brand_slug: 'colaberry', engine: 'synthflow_legacy', mode: 'legacy', canary_percent: 0, version_id: null, fallback: { kind: 'legacy' }, approved_by: null, approved_at: null, calls_7d: 4 };

let container: HTMLDivElement;
let root: Root;
const settle = async (): Promise<void> => { for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); }); };
async function render(el: React.ReactElement): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<MemoryRouter>{el}</MemoryRouter>); });
  await settle();
}
const button = (label: string) => Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === label) as HTMLButtonElement;
const click = async (label: string) => { await act(async () => { button(label).click(); }); await settle(); };
const text = (sel: string) => container.querySelector(sel)?.textContent ?? '';

beforeEach(() => { for (const f of Object.values(mockApi)) f.mockReset(); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe('Voice Lab tab', () => {
  beforeEach(() => { mockApi.getCatalog.mockResolvedValue(CATALOG); });

  it('previews only catalog voices and says which voices can only be heard on a call', async () => {
    mockApi.previewVoice.mockResolvedValue('blob:preview');
    await render(<VoiceLabTab />);
    expect(button('Twilio default (en-US)')).toBeUndefined();
    expect(container.textContent).toContain('Heard only on a test call');
    await click('Marin (recommended)');
    expect(mockApi.previewVoice).toHaveBeenCalledWith('marin', expect.stringContaining("I'm an AI"));
    expect(container.querySelector('[data-testid="preview-audio"]')?.getAttribute('src')).toBe('blob:preview');
  });

  it('a blind trial shows only X and Y until a preference is saved, then reveals', async () => {
    mockApi.createTrial.mockResolvedValue({ trialId: 't1', text: 'x', scored: false });
    mockApi.trialClip.mockResolvedValue('blob:clip');
    mockApi.scoreTrial.mockResolvedValue({ trialId: 't1', text: 'x', scored: true, preferred: 'X', reveal: { X: 'cedar', Y: 'marin' } });
    await render(<VoiceLabTab />);
    await click('Start a blind comparison');
    await click('Play X');
    const before = text('[data-testid="trial"]');
    expect(before).toContain('X');
    expect(before).not.toMatch(/marin|cedar|Marin|Cedar/);
    await click('Prefer X');
    expect(mockApi.scoreTrial).toHaveBeenCalledWith('t1', 'X');
    expect(text('[data-testid="reveal"]')).toBe('Saved: X. X was cedar, Y was marin.');
  });

  it('dry run is the default: nothing is dialed, spend reads $0.00; live asks the Test Lab and can be stopped', async () => {
    mockApi.startTestCall.mockResolvedValue({ callId: 'c1' });
    mockApi.stopTestCall.mockResolvedValue(undefined);
    await render(<VoiceLabTab />);
    expect(text('[data-testid="estimate"]')).toContain('$0.00');
    await click('Dry run');
    expect(mockApi.startTestCall).not.toHaveBeenCalled();
    expect(text('[data-testid="lab-msg"]')).toContain('no phone was dialed');
    const toggle = container.querySelector('#vs-dry') as HTMLInputElement;
    await act(async () => { toggle.click(); });
    await settle();
    expect(text('[data-testid="estimate"]')).toContain('$1.04');
    await click('Start live test call');
    expect(mockApi.startTestCall).not.toHaveBeenCalled(); // VS3.7: nothing dials before the confirmation
    expect(text('[data-testid="confirm-live"]')).toContain('at most $1.04');
    await click('Cancel');
    expect(container.querySelector('[data-testid="confirm-live"]')).toBeNull();
    expect(mockApi.startTestCall).not.toHaveBeenCalled();
    await click('Start live test call');
    await click('Ring the test phone');
    expect(mockApi.startTestCall).toHaveBeenCalledTimes(1);
    expect(mockApi.startTestCall).toHaveBeenCalledWith(expect.stringMatching(/^lab-/), 'openai_realtime');
    await click('Stop call');
    expect(mockApi.stopTestCall).toHaveBeenCalledWith('c1');
  });

  it('has no serious accessibility violations', async () => {
    await render(<VoiceLabTab />);
    const r = await axe.run(container, { runOnly: ['wcag2a', 'wcag2aa'] });
    expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
  });
});

describe('Numbers & Routing tab', () => {
  beforeEach(() => {
    mockApi.listNumbers.mockResolvedValue([{ id: 'n1', provider: 'twilio', provider_number_id: 'PN1', number_ref: 'test-line', ownership: 'owned', status: 'active', capabilities: { voice: true }, routing_policy: {}, brand_slug: null, verified_caller_id: false }]);
    mockApi.listRoutes.mockResolvedValue([ROUTE]);
  });

  it('shows numbers by reference only', async () => {
    await render(<NumbersRoutingTab />);
    expect(text('[data-testid="numbers"]')).toContain('test-line');
    expect(container.textContent).not.toMatch(/\+1\d{10}/);
  });

  it('shows capabilities, inbound mapping and each route fallback; a human line asks for its reference', async () => {
    mockApi.listRoutes.mockResolvedValue([{ ...ROUTE, fallback: { kind: 'human_line', ref: 'admissions-line' } }]);
    mockApi.validateRoute.mockResolvedValue({ ok: false, issues: ['x'] });
    await render(<NumbersRoutingTab />);
    expect(text('[data-testid="numbers"]')).toContain('Can do voice. No inbound mapping yet');
    expect(text('[data-testid="fallback-r1"]')).toBe('human line (admissions-line)');
    await click('Change');
    expect((container.querySelector('#vr-ref') as HTMLInputElement).value).toBe('admissions-line');
    await click('Validate and show impact');
    expect(mockApi.validateRoute).toHaveBeenCalledWith('r1', expect.objectContaining({ fallback: { kind: 'human_line', ref: 'admissions-line' } }));
  });

  it('apply stays disabled until the exact change validates; a change after validating disables it again', async () => {
    mockApi.validateRoute.mockResolvedValue({ ok: true, validationToken: 'tok', impact: { callsLast7Days: 4, currentMode: 'legacy', movesRealCallers: true, summary: 'legacy -> canary' } });
    mockApi.applyRoute.mockResolvedValue(undefined);
    await render(<NumbersRoutingTab />);
    await click('Change');
    expect(button('Apply change').disabled).toBe(true);
    await click('Validate and show impact');
    expect(text('[data-testid="route-impact"]')).toContain('moves real callers');
    expect(button('Apply change').disabled).toBe(false);
    const mode = container.querySelector('#vr-mode') as HTMLSelectElement;
    await act(async () => { mode.value = 'disabled'; mode.dispatchEvent(new Event('change', { bubbles: true })); });
    await settle();
    expect(button('Apply change').disabled).toBe(true);
    await click('Validate and show impact');
    await click('Apply change');
    expect(mockApi.applyRoute).toHaveBeenCalledWith('r1', expect.objectContaining({ mode: 'disabled' }), 'tok');
  });

  it('validation issues are listed and apply stays disabled', async () => {
    mockApi.validateRoute.mockResolvedValue({ ok: false, issues: ['canary needs between 1 and 50 percent'] });
    await render(<NumbersRoutingTab />);
    await click('Change');
    await click('Validate and show impact');
    expect(text('[data-testid="route-issues"]')).toContain('canary needs');
    expect(button('Apply change').disabled).toBe(true);
  });

  it('a refused apply explains it', async () => {
    mockApi.validateRoute.mockResolvedValue({ ok: true, validationToken: 'tok', impact: { callsLast7Days: 0, currentMode: 'legacy', movesRealCallers: false, summary: 's' } });
    mockApi.applyRoute.mockRejectedValue({ response: { status: 403 } });
    await render(<NumbersRoutingTab />);
    await click('Change');
    await click('Validate and show impact');
    await click('Apply change');
    expect(text('[data-testid="route-msg"]')).toContain('approver role');
  });

  it('has no serious accessibility violations', async () => {
    await render(<NumbersRoutingTab />);
    await click('Change');
    const r = await axe.run(container, { runOnly: ['wcag2a', 'wcag2aa'] });
    expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
  });
});
