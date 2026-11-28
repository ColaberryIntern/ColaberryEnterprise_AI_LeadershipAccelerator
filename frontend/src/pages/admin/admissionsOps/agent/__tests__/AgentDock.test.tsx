import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import AdmissionsOpsLayout from '../../AdmissionsOpsLayout';
import { admissionsOpsChildRoutes } from '../../admissionsOpsRoutes';
import { OPS_BASE, SCREENS, screenHref, type ScreenId } from '../../screens';
import { TODAY_SAMPLE } from '../../today/todaySample.fixture';
import { getApprovalCount, getToday, newRequestId, postIntent } from '../../../../../services/admissionsOpsApi';

jest.mock('../../../../../services/admissionsOpsApi', () => ({ getToday: jest.fn(), getApprovalCount: jest.fn(), postIntent: jest.fn(), newRequestId: jest.fn() }));
const mockCount = getApprovalCount as jest.Mock;
const mockIntent = postIntent as jest.Mock;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
let where = '';
function Where(): null { where = useLocation().pathname; return null; }
beforeEach(() => {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  (getToday as jest.Mock).mockResolvedValue(TODAY_SAMPLE);
  mockCount.mockResolvedValue(0);
  mockIntent.mockResolvedValue({ outcome: 'done' });
  (newRequestId as jest.Mock).mockReturnValue('req-dock-0001');
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

async function renderAt(path: string): Promise<void> {
  await act(async () => {
    root.render(
      <MemoryRouter key={path} initialEntries={[path]}>
        <Routes><Route path={OPS_BASE} element={<><AdmissionsOpsLayout /><Where /></>}>{admissionsOpsChildRoutes()}</Route></Routes>
      </MemoryRouter>,
    );
  });
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
const q = (id: string) => host.querySelector(`[data-testid="${id}"]`);
const url = (id: ScreenId) => (id === 'student360' ? `${OPS_BASE}/students/example` : screenHref(id));

describe('AO2.3 the agent dock', () => {
  it('is on every screen except Ask AURA, in Answer mode, with three suggestions from that screen\'s manifest', async () => {
    for (const s of SCREENS) {
      await renderAt(url(s.id));
      if (s.id === 'agent') { expect(q('ops-dock')).toBeNull(); continue; }
      expect({ screen: s.id, dock: q('ops-dock') !== null }).toEqual({ screen: s.id, dock: true });
      expect(q('ops-dock-mode')?.textContent).toBe('Answer mode');
      expect(host.querySelectorAll('[data-testid^="ops-dock-suggest-"]')).toHaveLength(3);
    }
  });

  it('says plainly that no agent is connected yet (the input is disabled)', async () => {
    await renderAt(url('today'));
    const input = q('ops-dock-input') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(input.placeholder).toMatch(/not connected yet/);
  });

  it('a suggestion records one navigate intent and moves the screen', async () => {
    await renderAt(url('today'));
    await act(async () => { (q('ops-dock-suggest-tfcAudit.open') as HTMLElement).click(); });
    expect(mockIntent).toHaveBeenCalledTimes(1);
    expect(mockIntent).toHaveBeenCalledWith({ request_id: 'req-dock-0001', type: 'navigate', screen: 'today', action: 'tfcAudit.open' });
    expect(where).toBe(`${OPS_BASE}/payments/tfc-audit`);
  });

  it('if recording fails, the person still gets where they asked to go', async () => {
    mockIntent.mockRejectedValue(new Error('503'));
    await renderAt(url('today'));
    await act(async () => { (q('ops-dock-suggest-approvals.open') as HTMLElement).click(); });
    expect(where).toBe(`${OPS_BASE}/approvals`);
  });
});

describe('AO2.3 the Approvals count in the section bar', () => {
  it('shows the open count from the API', async () => {
    mockCount.mockResolvedValue(3);
    await renderAt(url('today'));
    expect(q('ops-badge-approvals')?.textContent).toBe('3');
  });
  it('shows no badge at zero, and none (rather than a wrong number) when the count fails', async () => {
    await renderAt(url('today'));
    expect(q('ops-badge-approvals')).toBeNull();
    mockCount.mockRejectedValue(new Error('500'));
    await renderAt(url('students'));
    expect(q('ops-badge-approvals')).toBeNull();
  });
});
