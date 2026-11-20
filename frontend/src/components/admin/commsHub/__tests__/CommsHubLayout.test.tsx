import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import axe from 'axe-core';
import CommsHubLayout from '../CommsHubLayout';
import TodayTab from '../TodayTab';
import EventsTab from '../EventsTab';
import ComposeTab from '../ComposeTab';
import ScheduleTab from '../ScheduleTab';
import * as commsHubApi from '../../../../services/commsHubApi';

// No Testing Library in this repo: render with createRoot + act, query the DOM, run axe-core directly.
jest.mock('../../../../services/commsHubApi');

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const WCAG: string[] = ['wcag2a', 'wcag2aa'];
const EMPTY = { awaiting_approval: 0, scheduled_next_7_days: 0, upcoming_events: 0, events_missing_thumbnail: 0, needs_attention: 0, sending_paused: false };

let container: HTMLDivElement;
let root: Root;
const settle = async (): Promise<void> => { for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); }); };

async function renderAt(path: string): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/comms-hub" element={<CommsHubLayout />}>
            <Route index element={<TodayTab />} />
            <Route path="events" element={<EventsTab />} />
            <Route path="compose" element={<ComposeTab />} />
            <Route path="schedule" element={<ScheduleTab />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  });
  await settle();
}

beforeEach(() => { (commsHubApi.getCommsHubSummary as jest.Mock).mockResolvedValue(EMPTY); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); jest.clearAllMocks(); });

const text = (): string => container.textContent ?? '';
const activeTab = (): string => (container.querySelector('nav[aria-label="Communications Hub sections"] a.active')?.textContent ?? '');
const button = (label: string): HTMLButtonElement => Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(label)) as HTMLButtonElement;

describe('CH1.3 Communications Hub shell', () => {
  it.each([
    ['/admin/comms-hub', 'Today', 'Nothing is waiting for your approval'],
    ['/admin/comms-hub/events', 'Events', 'No events yet'],
    ['/admin/comms-hub/compose', 'Compose', 'Start a message'],
    ['/admin/comms-hub/schedule', 'Schedule & history', 'Nothing is scheduled'],
  ])('%s deep-links to its tab (%s) and renders its empty state', async (path, tab, empty) => {
    await renderAt(path);
    expect(activeTab()).toBe(tab);
    expect(text()).toContain(empty);
    expect(commsHubApi.getCommsHubSummary).toHaveBeenCalledTimes(1);
  });

  it('the header carries Pause all sending, New event and New message; pause is disabled and says why', async () => {
    await renderAt('/admin/comms-hub');
    const pause = button('Pause all sending');
    expect(pause.disabled).toBe(true);
    const note = container.querySelector(`#${pause.getAttribute('aria-describedby')}`);
    expect(note?.textContent).toMatch(/nothing to pause/);
    expect(button('New event')).toBeDefined();
    expect(button('New message')).toBeDefined();
  });

  it('Today shows the summary counts from the server', async () => {
    (commsHubApi.getCommsHubSummary as jest.Mock).mockResolvedValue({ ...EMPTY, awaiting_approval: 2, upcoming_events: 4, events_missing_thumbnail: 1 });
    await renderAt('/admin/comms-hub');
    expect(text()).toContain('Waiting for your approval');
    expect(text()).toContain('1 still need a thumbnail');
  });

  it('a failed summary shows a retry instead of zeros, and the retry reloads', async () => {
    (commsHubApi.getCommsHubSummary as jest.Mock).mockRejectedValueOnce(new Error('down'));
    await renderAt('/admin/comms-hub');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('did not load');
    await act(async () => { button('Try again').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await settle();
    expect(commsHubApi.getCommsHubSummary).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('accessibility: axe finds no WCAG A/AA violations on any tab', async () => {
    for (const path of ['/admin/comms-hub', '/admin/comms-hub/events', '/admin/comms-hub/compose', '/admin/comms-hub/schedule']) {
      await renderAt(path);
      const results = await axe.run(container, { runOnly: { type: 'tag', values: WCAG } });
      expect(results.violations.map((v) => `${path} ${v.id}: ${v.help}`)).toEqual([]);
      act(() => { root.unmount(); }); container.remove();
    }
    await renderAt('/admin/comms-hub');
  });

  it('accessibility: focus order is header controls, then the four tabs in order; every control carries the 44px class', async () => {
    await renderAt('/admin/comms-hub');
    const focusables = Array.from(container.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]'));
    const order: string[] = [];
    for (const el of focusables) { el.focus(); order.push((document.activeElement?.textContent ?? '').trim()); }
    expect(order).toEqual(['New event', 'New message', 'Today', 'Events', 'Compose', 'Schedule & history']);
    for (const el of focusables) expect(el.className).toMatch(/comms-hub-(action|tab)/);
  });
});
