import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import axe from 'axe-core';
import VoiceStudioLayout from '../VoiceStudioLayout';
import OverviewTab from '../OverviewTab';
import AgentsTab from '../AgentsTab';
import { formatKpiValue, lineDiff, NO_DATA } from '../voiceStudioFormat';
import type { AgentCard, AgentVersion, Overview } from '../../../../services/voiceStudioApi';

// No Testing Library in this repo: render with createRoot + act, query the DOM, run axe-core directly.
// Only the network calls are faked; statusOf / studioErrorMessage are the real ones.
const mockApi = { getOverview: jest.fn(), listAgents: jest.fn(), listVersions: jest.fn(), changeStatus: jest.fn(), validateContent: jest.fn(), saveDraft: jest.fn() };
jest.mock('../../../../services/voiceStudioApi', () => ({
  ...jest.requireActual('../../../../services/voiceStudioApi'),
  getOverview: (...a: unknown[]) => mockApi.getOverview(...a),
  listAgents: (...a: unknown[]) => mockApi.listAgents(...a),
  listVersions: (...a: unknown[]) => mockApi.listVersions(...a),
  changeStatus: (...a: unknown[]) => mockApi.changeStatus(...a),
  validateContent: (...a: unknown[]) => mockApi.validateContent(...a),
  saveDraft: (...a: unknown[]) => mockApi.saveDraft(...a),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OVERVIEW: Overview = {
  window: { days: 7, mode: 'live' },
  kpis: [
    { key: 'attempted', label: 'Calls attempted', value: 12, unit: 'count', provenance: 'observed' },
    { key: 'connected', label: 'Connected', value: 75, unit: 'percent', provenance: 'observed', denominator: { label: 'attempted', value: 12 } },
    { key: 'latency_p95', label: 'First response p95', value: null, unit: 'ms', provenance: 'observed' },
    { key: 'cost_per_minute', label: 'Cost per minute', value: 0.1234, unit: 'usd_per_min', provenance: 'estimated', denominator: { label: 'minutes', value: 30 } },
  ],
  byEngine: [{ engine: 'conversation_relay', attempted: 12, completed: 6, successPercent: 50 }],
  safety: { studioEnabled: false, testEnabled: true, gatewayLegacyEnabled: false, engineDefault: 'synthflow_legacy' },
  migration: { legacy: 0, shadow: 0, test: 0, canary: 0, live: 0, disabled: 0, total: 0 },
};

const VERSION: AgentVersion = {
  id: 'v1', profile_id: 'p1', version: 1, content_hash: 'a'.repeat(64), author: 'seed:synthflow', approved_by: null, approved_at: null, status: 'approved', created_at: '2026-11-24T00:00:00Z',
  prompt: '{prompt}', first_message: null, disclosure: "This is Colaberry's AI assistant. I'm an AI, not a person.", kb_refs: ['admissions_knowledge'],
  tool_permissions: ['admissions_knowledge'], engine: 'conversation_relay', engine_config: { promptShell: true }, voice_id: null, language: 'en-US',
  safety_policy: { bookingRequiresHumanApproval: true, maxToolCallsPerCall: 6 }, max_call_seconds: 180,
};
const heldTest = (): { release: () => void } => {
  let release: () => void = () => undefined;
  mockApi.getOverview.mockImplementation((_d: number, mode: string) => (mode === 'live' ? Promise.resolve(OVERVIEW)
    : new Promise((r) => { release = () => r({ ...OVERVIEW, window: { days: 7, mode: 'test' }, kpis: [{ ...OVERVIEW.kpis[0], value: 3 }] }); })));
  return { release: () => release() };
};
const CARD: AgentCard = {
  profile: { id: 'p1', name: 'Edu: Cory - Outbound', brand_slug: 'colaberry', agent_key: 'edu-cory-outbound', direction: 'outbound', status: 'draft', active_version_id: null, updated_at: '2026-11-24T00:00:00Z' },
  versions: { total: 1, drafts: 0, approved: 1 }, active: null,
};

let container: HTMLDivElement;
let root: Root;
const settle = async (): Promise<void> => { for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); }); };

async function renderAt(path: string): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/voice-studio" element={<VoiceStudioLayout />}>
            <Route index element={<OverviewTab />} />
            <Route path="agents" element={<AgentsTab />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  });
  await settle();
}

const q = (sel: string) => container.querySelector(sel) as HTMLElement | null;
const text = (sel: string) => q(sel)?.textContent ?? '';

beforeEach(() => { for (const f of Object.values(mockApi)) f.mockReset(); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe('Overview tab', () => {
  it('renders each KPI from the API, and "No data" (never 0) for a null value', async () => {
    mockApi.getOverview.mockResolvedValue(OVERVIEW);
    await renderAt('/admin/voice-studio');
    expect(text('[data-testid="kpi-attempted-value"]')).toBe('12');
    expect(text('[data-testid="kpi-connected-value"]')).toBe('75%');
    expect(text('[data-testid="kpi-connected-denominator"]')).toBe('of 12 attempted');
    expect(text('[data-testid="kpi-latency_p95-value"]')).toBe(NO_DATA);
    expect(text('[data-testid="kpi-latency_p95-value"]')).not.toContain('0');
    expect(q('[data-testid="kpi-latency_p95-denominator"]')).toBeNull();
    expect(text('[data-testid="kpi-cost_per_minute-value"]')).toBe('$0.1234 / min');
  });

  it('labels every KPI with its provenance', async () => {
    mockApi.getOverview.mockResolvedValue(OVERVIEW);
    await renderAt('/admin/voice-studio');
    expect(text('[data-testid="kpi-attempted-provenance"]')).toBe('Observed');
    expect(text('[data-testid="kpi-cost_per_minute-provenance"]')).toBe('Estimated');
    expect(container.querySelectorAll('[data-testid$="-provenance"]').length).toBe(OVERVIEW.kpis.length);
  });

  it('switching window and traffic re-asks the API; empty migration says so', async () => {
    mockApi.getOverview.mockResolvedValue(OVERVIEW);
    await renderAt('/admin/voice-studio');
    expect(mockApi.getOverview).toHaveBeenLastCalledWith(7, 'live');
    const btn = (label: string) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent === label) as HTMLButtonElement;
    await act(async () => { btn('Last 30 days').click(); });
    await settle();
    await act(async () => { btn('Test calls').click(); });
    await settle();
    expect(mockApi.getOverview).toHaveBeenLastCalledWith(30, 'test');
    expect(q('[data-testid="migration-empty"]')).not.toBeNull();
  });

  it('VS3.7: live figures are gone while the test view loads', async () => {
    const held = heldTest();
    await renderAt('/admin/voice-studio');
    expect(text('[data-testid="kpi-attempted-value"]')).toBe('12');
    await act(async () => { (Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Test calls') as HTMLButtonElement).click(); });
    await settle();
    expect(q('[data-testid="kpi-attempted-value"]')).toBeNull();
    expect(container.textContent).not.toContain('Test calls in the last');
    await act(async () => { held.release(); });
    await settle();
    expect(text('[data-testid="kpi-attempted-value"]')).toBe('3');
    expect(container.textContent).toContain('Test calls in the last 7 days.');
  });

  it('test traffic is labelled Simulated, never Observed', async () => {
    const sim: Overview = { ...OVERVIEW, window: { days: 7, mode: 'test' }, kpis: [{ key: 'attempted', label: 'Calls attempted', value: 2, unit: 'count', provenance: 'simulated' }] };
    mockApi.getOverview.mockResolvedValue(sim);
    await renderAt('/admin/voice-studio');
    expect(text('[data-testid="kpi-attempted-provenance"]')).toBe('Simulated');
    expect(q('[data-testid="kpi-attempted-provenance"]')?.getAttribute('title')).toContain('Not live traffic');
  });

  it('a 404 (console switched off) shows the switched-off state, not an error', async () => {
    mockApi.getOverview.mockRejectedValue({ response: { status: 404 } });
    await renderAt('/admin/voice-studio');
    expect(container.textContent).toContain('Voice Studio is switched off on this server');
  });

  it('has no serious or critical accessibility violations', async () => {
    mockApi.getOverview.mockResolvedValue(OVERVIEW);
    await renderAt('/admin/voice-studio');
    const r = await axe.run(container, { runOnly: ['wcag2a', 'wcag2aa'] });
    expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
  });
});

describe('Agents tab', () => {
  it('publish without the approver role shows the 403 explanation and changes nothing', async () => {
    mockApi.listAgents.mockResolvedValue([CARD]);
    mockApi.listVersions.mockResolvedValue([VERSION]);
    mockApi.changeStatus.mockRejectedValue({ response: { status: 403 } });
    await renderAt('/admin/voice-studio/agents');
    const publish = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Publish') as HTMLButtonElement;
    await act(async () => { publish.click(); });
    await settle();
    expect(mockApi.changeStatus).toHaveBeenCalledWith('v1', 'publish');
    expect(text('[data-testid="action-msg"]')).toContain('needs an approver role');
    expect(mockApi.listVersions).toHaveBeenCalledTimes(1); // nothing reloaded: nothing changed
  });

  it('VS3.7: versions of a previously selected agent never appear under the next one', async () => {
    const B: AgentCard = { ...CARD, profile: { ...CARD.profile, id: 'p2', name: 'Second agent' } };
    const waiting: Record<string, (v: AgentVersion[]) => void> = {};
    mockApi.listAgents.mockResolvedValue([CARD, B]);
    mockApi.listVersions.mockImplementation((id: string) => new Promise((r) => { waiting[id] = r; }));
    await renderAt('/admin/voice-studio/agents');
    await act(async () => { (Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes('Second agent')) as HTMLButtonElement).click(); });
    await settle();
    await act(async () => { waiting.p2([{ ...VERSION, version: 22 }]); });
    await act(async () => { waiting.p1([{ ...VERSION, version: 11 }]); });
    await settle();
    expect(container.querySelector('tbody')?.textContent).toContain('v22');
    expect(container.querySelector('tbody')?.textContent).not.toContain('v11');
  });

  it('VS3.7: an action that finishes after another agent was selected does not reload or report under it', async () => {
    const B: AgentCard = { ...CARD, profile: { ...CARD.profile, id: 'p2', name: 'Second agent' } };
    let finish: (v: AgentVersion) => void = () => undefined;
    mockApi.listAgents.mockResolvedValue([CARD, B]);
    mockApi.listVersions.mockImplementation((id: string) => Promise.resolve([{ ...VERSION, version: id === 'p2' ? 22 : 11 }]));
    mockApi.changeStatus.mockImplementation(() => new Promise((r) => { finish = r; }));
    await renderAt('/admin/voice-studio/agents');
    const press = async (label: string) => { await act(async () => { (Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(label)) as HTMLButtonElement).click(); }); await settle(); };
    await press('Publish');
    await press('Second agent');
    await act(async () => { finish({ ...VERSION, status: 'published' }); });
    await settle();
    expect(container.querySelector('tbody')?.textContent).toContain('v22');
    expect(container.querySelector('tbody')?.textContent).not.toContain('v11');
    expect(q('[data-testid="action-msg"]')).toBeNull();
  });

  describe('VS3.7: work that outlives the selected agent', () => {
    const B: AgentCard = { ...CARD, profile: { ...CARD.profile, id: 'p2', name: 'Second agent' } };
    const button = (label: string) => Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(label)) as HTMLButtonElement;
    const press = async (label: string) => { await act(async () => { button(label).click(); }); await settle(); };
    beforeEach(() => {
      mockApi.listAgents.mockResolvedValue([CARD, B]);
      mockApi.listVersions.mockImplementation((id: string) => Promise.resolve([{ ...VERSION, id: id === 'p2' ? 'vb' : 'va', version: id === 'p2' ? 22 : 11 }]));
    });

    it('a late draft save does not load its agent under the next one', async () => {
      let finish: (r: unknown) => void = () => undefined;
      mockApi.saveDraft.mockImplementation(() => new Promise((r) => { finish = r; }));
      await renderAt('/admin/voice-studio/agents');
      await press('Edit a copy');
      await press('Save as draft');
      await press('Second agent');
      await act(async () => { finish({ created: true, version: VERSION }); });
      await settle();
      expect(container.querySelector('tbody')?.textContent).toContain('v22');
      expect(container.querySelector('tbody')?.textContent).not.toContain('v11');
    });

    it('a late failure shows nothing under the next agent and leaves its buttons usable', async () => {
      let fail: (e: Error) => void = () => undefined;
      mockApi.changeStatus.mockImplementation(() => new Promise((_r, j) => { fail = j; }));
      await renderAt('/admin/voice-studio/agents');
      await press('Publish');
      await press('Second agent');
      await act(async () => { fail(new Error('late')); });
      await settle();
      expect(q('[data-testid="action-msg"]')).toBeNull();
      expect(button('Publish').disabled).toBe(false);
    });

    it('back on its own agent, the result is shown and the button is released', async () => {
      let finish: (v: AgentVersion) => void = () => undefined;
      mockApi.changeStatus.mockImplementation(() => new Promise((r) => { finish = r; }));
      await renderAt('/admin/voice-studio/agents');
      const own = CARD.profile.name;
      await press('Publish');
      await press('Second agent');
      await press(own);
      expect(button('Publish').disabled).toBe(true);
      await act(async () => { finish({ ...VERSION, status: 'published' }); });
      await settle();
      expect(q('[data-testid="action-msg"]')).not.toBeNull();
      expect(button('Publish').disabled).toBe(false);
    });

    it('one action finishing does not release another still in flight', async () => {
      const finish: Record<string, (v: AgentVersion) => void> = {};
      mockApi.changeStatus.mockImplementation((id: string) => new Promise((r) => { finish[id] = r; }));
      await renderAt('/admin/voice-studio/agents');
      await press('Publish');
      await press('Second agent');
      await press('Publish');
      await act(async () => { finish.va({ ...VERSION, status: 'published' }); });
      await settle();
      expect(button('Publish').disabled).toBe(true);
    });
  });

  it('a successful publish says new calls use it and reloads', async () => {
    mockApi.listAgents.mockResolvedValue([CARD]);
    mockApi.listVersions.mockResolvedValue([VERSION]);
    mockApi.changeStatus.mockResolvedValue({ ...VERSION, status: 'published' });
    await renderAt('/admin/voice-studio/agents');
    const publish = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Publish') as HTMLButtonElement;
    await act(async () => { publish.click(); });
    await settle();
    expect(text('[data-testid="action-msg"]')).toContain('New calls use it');
    expect(mockApi.listVersions).toHaveBeenCalledTimes(2);
  });

  it('no agents: an empty state that says how the first one is created', async () => {
    mockApi.listAgents.mockResolvedValue([]);
    await renderAt('/admin/voice-studio/agents');
    expect(container.textContent).toContain('No phone agents yet');
  });

  it('Edit a copy opens the editor; Validate shows the tools a call would get', async () => {
    mockApi.listAgents.mockResolvedValue([CARD]);
    mockApi.listVersions.mockResolvedValue([VERSION]);
    mockApi.validateContent.mockResolvedValue({ valid: true, hash: 'b'.repeat(64), preview: { ok: true, system: 's', greeting: 'Hello, I am an AI.' }, tools: { allowed: ['admissions_knowledge'], denied: [{ name: 'transfer_to_human', reason: 'not_in_version' }] } });
    await renderAt('/admin/voice-studio/agents');
    const edit = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Edit a copy') as HTMLButtonElement;
    await act(async () => { edit.click(); });
    await settle();
    const validate = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Validate') as HTMLButtonElement;
    await act(async () => { validate.click(); });
    await settle();
    expect(text('[data-testid="validate-ok"]')).toContain('admissions_knowledge');
    expect(text('[data-testid="validate-ok"]')).toContain('transfer_to_human (not in version)');
    expect(mockApi.saveDraft).not.toHaveBeenCalled();
  });
});

describe('format helpers', () => {
  it('formatKpiValue never turns null into 0', () => {
    expect(formatKpiValue({ value: null, unit: 'count' })).toBe(NO_DATA);
    expect(formatKpiValue({ value: 0, unit: 'count' })).toBe('0');
    expect(formatKpiValue({ value: 1234.6, unit: 'ms' })).toBe('1,235 ms');
  });
  it('lineDiff marks added and removed lines', () => {
    expect(lineDiff('a\nb\nc', 'a\nc\nd')).toEqual([{ kind: 'same', text: 'a' }, { kind: 'removed', text: 'b' }, { kind: 'same', text: 'c' }, { kind: 'added', text: 'd' }]);
  });
});
