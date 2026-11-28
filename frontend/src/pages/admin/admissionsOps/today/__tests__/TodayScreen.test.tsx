import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import TodayScreen from '../TodayScreen';
import { TODAY_SAMPLE } from '../todaySample.fixture';
import { centralTime, filterQueue } from '../todayFormat';
import { getToday } from '../../../../../services/admissionsOpsApi';

jest.mock('../../../../../services/admissionsOpsApi', () => ({ getToday: jest.fn() }));
const mockGet = getToday as jest.Mock;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;
beforeEach(() => { jest.clearAllMocks(); host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

async function mount(): Promise<void> {
  await act(async () => { root.render(<MemoryRouter><TodayScreen /></MemoryRouter>); });
  await act(async () => { await Promise.resolve(); });
}
const q = (id: string) => host.querySelector(`[data-testid="${id}"]`);
const click = async (id: string) => { await act(async () => { (q(id) as HTMLElement).click(); }); };

describe('AO2.1 Today', () => {
  it('renders the briefing, the target, the sample label, and every item with its sources and pull time', async () => {
    mockGet.mockResolvedValue(TODAY_SAMPLE);
    await mount();
    expect(q('today-sample')?.textContent).toMatch(/Sample data/);
    expect(q('today-briefing')?.textContent).toMatch(/2 things need you today\. Start with: Paid but not activated: Marcus Bell/);
    expect(q('today-target')?.textContent).toMatch(/5 a day/);
    expect(q('today-target')?.textContent).toMatch(/1,850/);
    expect(q('today-target')?.textContent).toMatch(/assumed 8%/);
    for (const item of TODAY_SAMPLE.queue) {
      expect(q(`today-source-${item.id}`)?.textContent).toMatch(/^Checked .+, pulled .+ C[SD]T\.$/);
    }
  });

  it('a down source is shown as down on its items and in the systems list, never as current', async () => {
    mockGet.mockResolvedValue(TODAY_SAMPLE);
    await mount();
    expect(q('today-down-q-ticket')?.textContent).toMatch(/Zendesk is down/);
    expect(q('today-down-q-marcus')).toBeNull();
    expect(q('today-system-zendesk')?.getAttribute('data-status')).toBe('down');
    expect(q('today-system-zendesk')?.textContent).toMatch(/Down/);
    expect(q('today-system-sheets')?.textContent).toMatch(/Not connected/);
  });

  it('the target card is never shown as current when its source (PaySimple) is down; up, it is current', async () => {
    const paysimpleDown = { ...TODAY_SAMPLE, systems: TODAY_SAMPLE.systems.map((s) => (s.id === 'paysimple' ? { ...s, status: 'down' as const } : s)) };
    mockGet.mockResolvedValue(paysimpleDown);
    await mount();
    expect(q('today-target')?.getAttribute('data-current')).toBe('no');
    expect(q('today-target-not-current')?.textContent).toMatch(/PaySimple is down\. These figures are from the last pull and are not current\./);
    act(() => root.unmount());
    host.innerHTML = ''; root = createRoot(host);
    mockGet.mockResolvedValue(TODAY_SAMPLE);
    await mount();
    expect(q('today-target')?.getAttribute('data-current')).toBe('yes');
    expect(q('today-target-not-current')).toBeNull();
  });

  it('a filter whose count includes items from a down system says so', async () => {
    mockGet.mockResolvedValue(TODAY_SAMPLE);
    await mount();
    expect(q('today-lens-down-all')?.textContent).toBe('1 from a down system');
    expect(q('today-lens-down-students')?.textContent).toBe('1 from a down system');
    expect(q('today-lens-down-admissions')).toBeNull();
  });

  it('the seven filters show the derived counts and change the queue to match', async () => {
    mockGet.mockResolvedValue(TODAY_SAMPLE);
    await mount();
    expect(host.querySelectorAll('button[data-testid^="today-lens-"]')).toHaveLength(7);
    expect(q('today-lens-all')?.textContent).toMatch(/Everything3/);
    for (const s of TODAY_SAMPLE.sections) {
      await click(`today-lens-${s.id}`);
      const shown = host.querySelectorAll('[data-testid^="today-item-"]').length;
      expect({ lens: s.id, shown }).toEqual({ lens: s.id, shown: s.count });
      if (s.count === 0) expect(q('today-queue-empty')).not.toBeNull();
    }
  });

  it('a student item opens their Student 360; a group item opens its screen', async () => {
    mockGet.mockResolvedValue(TODAY_SAMPLE);
    await mount();
    expect(q('today-item-q-marcus')?.querySelector('a')?.getAttribute('href')).toBe('/admin/admissions-ops/students/sample-marcus-bell');
    expect(q('today-item-q-tfc')?.querySelector('a')?.getAttribute('href')).toBe('/admin/admissions-ops/payments/tfc-audit');
  });

  it('failure: a failed load says nothing is current and offers a retry that works', async () => {
    mockGet.mockRejectedValueOnce(new Error('503')).mockResolvedValueOnce(TODAY_SAMPLE);
    await mount();
    expect(q('today-error')?.textContent).toMatch(/Nothing on this screen is current/);
    await act(async () => { (q('today-error')?.querySelector('button') as HTMLElement).click(); });
    await act(async () => { await Promise.resolve(); });
    expect(q('ops-today')).not.toBeNull();
    expect(mockGet).toHaveBeenCalledTimes(2);
  });

  it('a live payload (sample false) shows no sample label', async () => {
    mockGet.mockResolvedValue({ ...TODAY_SAMPLE, sample: false });
    await mount();
    expect(q('today-sample')).toBeNull();
  });
});

describe('todayFormat', () => {
  it('shows Central with the zone written out, across daylight saving', () => {
    const now = new Date('2026-11-30T20:00:00.000Z');
    expect(centralTime('2026-11-30T14:51:00.000Z', now)).toBe('8:51 AM CST');
    expect(centralTime('2026-07-01T14:51:00.000Z', new Date('2026-07-01T18:00:00.000Z'))).toBe('9:51 AM CDT');
    expect(centralTime('2026-11-29T14:51:00.000Z', now)).toBe('Nov 29, 8:51 AM CST');
    expect(centralTime(null, now)).toBe('never');
    expect(centralTime('not a date', now)).toBe('unknown');
  });
  it('filterQueue puts today first and keeps order otherwise', () => {
    expect(filterQueue(TODAY_SAMPLE.queue, 'all').map((x) => x.id)).toEqual(['q-marcus', 'q-ticket', 'q-tfc']);
    expect(filterQueue(TODAY_SAMPLE.queue, 'events')).toEqual([]);
  });
});
