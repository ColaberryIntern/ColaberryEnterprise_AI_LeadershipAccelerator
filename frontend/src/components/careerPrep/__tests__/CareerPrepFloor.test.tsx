import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { CareerPrepFloor, CareerPrepPanelRows } from '../CareerPrepFloor';
import { resetCareerPrepSummaryCache } from '../useCareerPrepSummary';
import { fetchPrepSummary } from '../careerPrepApi';
import { CAREER_PREP_ROOM_PATH } from '../../campus/hq/careerPrepDoors';
import type { HqFloor } from '../../campus/hq/hqModel';

jest.mock('../careerPrepApi', () => ({ fetchPrepSummary: jest.fn() }));
const summary = fetchPrepSummary as jest.Mock;

const floor: HqFloor = { key: 'group-6', num: '6', label: 'Career Prep', own: true, openCount: 1, access: 'all',
  rooms: [{ path: CAREER_PREP_ROOM_PATH, label: 'Career Prep', icon: 'focus-3-line', section: 'own', newTab: false, external: false, open: true, own: true }] };

let host: HTMLDivElement;
let root: Root;
async function mount(el: React.ReactElement): Promise<void> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root.render(el); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}
afterEach(() => { act(() => root.unmount()); host.remove(); resetCareerPrepSummaryCache(); summary.mockReset(); });

const q = (id: string) => host.querySelector(`[data-testid="${id}"]`) as HTMLAnchorElement | null;

describe('the Career Prep floor (CP2.3)', () => {
  it('sends the door, Walk in, Cora and every stop to the one room', async () => {
    summary.mockResolvedValue({ firstName: 'Ali', stops: { readiness: 64, readyAt: 75, streak: 3, thisWeek: 40 }, interviews: [], today: '2026-11-16' });
    await mount(<CareerPrepFloor f={floor} onElevator={jest.fn()} onLobby={jest.fn()} />);
    for (const id of ['cp-door', 'cp-walkin', 'cp-cora', 'cp-stop-readiness', 'cp-stop-readyAt', 'cp-stop-streak', 'cp-stop-thisWeek']) {
      expect(q(id)?.getAttribute('href')).toBe(CAREER_PREP_ROOM_PATH);
    }
    expect(host.querySelectorAll('a[data-testid="cp-door"]')).toHaveLength(1);
    expect(q('cp-door')?.textContent).toContain('Start here');
    expect(host.textContent).toContain('FLOOR 6');
  });

  it('renders no stop that has no data (never a zero)', async () => {
    summary.mockResolvedValue({ firstName: 'Ali', stops: { readiness: 64 }, interviews: [], today: '2026-11-16' });
    await mount(<CareerPrepFloor f={floor} onElevator={jest.fn()} onLobby={jest.fn()} />);
    expect(q('cp-stop-readiness')).not.toBeNull();
    expect(q('cp-stop-streak')).toBeNull();
    expect(q('cp-stop-thisWeek')).toBeNull();
  });

  it('still opens the room when the summary cannot load', async () => {
    summary.mockRejectedValue(new Error('offline'));
    await mount(<CareerPrepFloor f={floor} onElevator={jest.fn()} onLobby={jest.fn()} />);
    expect(q('cp-door')?.getAttribute('href')).toBe(CAREER_PREP_ROOM_PATH);
    expect(host.querySelector('.cp-stops')).toBeNull();
    expect(q('cp-greeting')?.textContent).toBe('Cora, your interview coach, is ready when you are.');
  });

  it('takes the floor number from the floor, never a constant', async () => {
    summary.mockResolvedValue(null);
    await mount(<CareerPrepFloor f={{ ...floor, num: '4' }} onElevator={jest.fn()} onLobby={jest.fn()} />);
    expect(host.textContent).toContain('FLOOR 4');
  });
});

describe('the side panel rows', () => {
  it('shows what is waiting, each row opening the room', async () => {
    summary.mockResolvedValue({ stops: {}, interviews: [], today: '2026-11-16', nextInterview: { id: 'i1', source: 'real', company: 'Acme', role: 'AI Engineer', type: 'technical', startsAt: '2026-11-19T20:00:00Z', readiness: 64, target: 75 } });
    await mount(<CareerPrepPanelRows />);
    const row = host.querySelector('[data-testid="cp-waiting"] a') as HTMLAnchorElement;
    expect(row.textContent).toContain('Your Acme readiness · 64 now · 75 is ready');
    expect(row.getAttribute('href')).toBe(CAREER_PREP_ROOM_PATH);
  });

  it('renders nothing when nothing is waiting', async () => {
    summary.mockResolvedValue({ stops: {}, interviews: [], today: '2026-11-16' });
    await mount(<CareerPrepPanelRows />);
    expect(host.innerHTML).toBe('');
  });
});
