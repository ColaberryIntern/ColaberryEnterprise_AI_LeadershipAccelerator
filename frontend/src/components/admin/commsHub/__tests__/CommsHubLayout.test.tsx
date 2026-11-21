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

beforeEach(() => {
  (commsHubApi.getCommsHubSummary as jest.Mock).mockResolvedValue(EMPTY);
  // CH3.1: the Events tab loads its own list; an empty hub has no events.
  (commsHubApi.listHubEvents as jest.Mock).mockResolvedValue([]);
  // CH9.2: the Events tab also lists the Eventbrite events.
  (commsHubApi.listEventbriteEvents as jest.Mock).mockResolvedValue({ status: 'ok', window: 'upcoming', events: [], fetched_at: '2026-11-21T22:00:00.000Z' });
  // CH6.5: Compose loads the recipient options.
  (commsHubApi.getDestinationOptions as jest.Mock).mockResolvedValue([]);
  // CH7.4: Today and Schedule & history load their lists, the safety controls and the activity log.
  (commsHubApi.getBoard as jest.Mock).mockResolvedValue([]);
  (commsHubApi.getHubSettings as jest.Mock).mockResolvedValue({ sending_paused: false, quiet_hours: null, alert_recipients: [], test_cohort: null, updated_at: null });
  (commsHubApi.listHubCohorts as jest.Mock).mockResolvedValue([]);
  (commsHubApi.getActivity as jest.Mock).mockResolvedValue([]);
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); jest.clearAllMocks(); });

const text = (): string => container.textContent ?? '';
const activeTab = (): string => (container.querySelector('nav[aria-label="Communications Hub sections"] a.active')?.textContent ?? '');
const button = (label: string): HTMLButtonElement => Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(label)) as HTMLButtonElement;

describe('CH1.3 Communications Hub shell', () => {
  it.each([
    ['/admin/comms-hub', 'Today', 'Nothing is waiting for your approval'],
    ['/admin/comms-hub/events', 'Events', 'No upcoming events'],
    ['/admin/comms-hub/compose', 'Compose', '1. What is it about?'],
    ['/admin/comms-hub/schedule', 'Schedule & history', 'Nothing is scheduled'],
  ])('%s deep-links to its tab (%s) and renders its empty state', async (path, tab, empty) => {
    await renderAt(path);
    expect(activeTab()).toBe(tab);
    expect(text()).toContain(empty);
    expect(commsHubApi.getCommsHubSummary).toHaveBeenCalledTimes(1);
  });

  it('the header carries Pause all sending, New event and New message', async () => {
    await renderAt('/admin/comms-hub');
    const pause = button('Pause all sending');
    expect([pause.disabled, pause.getAttribute('aria-pressed')]).toEqual([false, 'false']);
    expect(button('New event')).toBeDefined();
    expect(button('New message')).toBeDefined();
  });

  it.each(['/admin/comms-hub', '/admin/comms-hub/events', '/admin/comms-hub/compose', '/admin/comms-hub/schedule'])(
    'CH7.4 Pause works from %s: it calls the server, and the tab then says sending is paused', async (path) => {
      (commsHubApi.setSendingPaused as jest.Mock).mockResolvedValue({ sending_paused: true });
      await renderAt(path);
      expect(container.querySelector('[data-testid="ch-paused"]')).toBeNull();
      await act(async () => { button('Pause all sending').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await settle();
      expect(commsHubApi.setSendingPaused).toHaveBeenCalledWith(true);
      expect(container.querySelector('[data-testid="ch-paused"]')?.textContent).toContain('Sending is paused.');
      const resume = button('Resume sending');
      expect(resume.getAttribute('aria-pressed')).toBe('true');
    });

  it.each(['/admin/comms-hub', '/admin/comms-hub/events', '/admin/comms-hub/compose', '/admin/comms-hub/schedule'])(
    'CH7.4 a hub that is already paused says so on %s, with an icon and words; Resume calls the server', async (path) => {
      (commsHubApi.getCommsHubSummary as jest.Mock).mockResolvedValue({ ...EMPTY, sending_paused: true });
      (commsHubApi.setSendingPaused as jest.Mock).mockResolvedValue({ sending_paused: false });
      await renderAt(path);
      const banner = container.querySelector('[data-testid="ch-paused"]');
      expect(banner?.textContent).toMatch(/Sending is paused\. Nothing goes out on any channel until you resume/);
      expect(banner?.querySelector('i[aria-hidden="true"]')).not.toBeNull();
      await act(async () => { button('Resume sending').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await settle();
      expect(commsHubApi.setSendingPaused).toHaveBeenCalledWith(false);
      expect(container.querySelector('[data-testid="ch-paused"]')).toBeNull();
    });

  it('CH7.4 a pause the server refused says so and the hub is not shown as paused', async () => {
    (commsHubApi.setSendingPaused as jest.Mock).mockRejectedValue(new Error('down'));
    (commsHubApi.apiErrorMessage as jest.Mock).mockImplementation((_e: unknown, f: string) => f);
    await renderAt('/admin/comms-hub');
    await act(async () => { button('Pause all sending').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await settle();
    expect(Array.from(container.querySelectorAll('[role="alert"]')).map((a) => a.textContent).join(' ')).toContain('Sending was not paused. Try again.');
    expect(container.querySelector('[data-testid="ch-paused"]')).toBeNull();
  });

  it('Today shows the summary counts from the server, and the approval card agrees with its tile', async () => {
    (commsHubApi.getCommsHubSummary as jest.Mock).mockResolvedValue({ ...EMPTY, awaiting_approval: 2, upcoming_events: 4, events_missing_thumbnail: 1 });
    const row = (id: string) => ({ id, status: 'needs_approval', kind: 'reminder', title: `Message ${id}`, event: null, send_at: null, updated_at: '2026-11-20T16:00:00.000Z', destinations: [], preview: null, include: { thumbnail: false, join_link: false, registration_link: false }, approved_by: null, deliveries: { total: 0, sent: 0, failed: 0, pending: 0, cancelled: 0 }, failure: null });
    (commsHubApi.getBoard as jest.Mock).mockImplementation(async (scope: string) => (scope === 'approval' ? [row('a'), row('b')] : []));
    await renderAt('/admin/comms-hub');
    const tile = (label: string): string => {
      const card = Array.from(container.querySelectorAll('div')).find((d) => d.textContent?.startsWith(label) || (d.firstElementChild?.textContent ?? '') === label);
      return card?.parentElement?.textContent ?? '';
    };
    expect(tile('Waiting for your approval')).toContain('2');
    expect(tile('Upcoming events')).toContain('4');
    expect(text()).toContain('1 still need a thumbnail');
    expect(text()).toContain('2 waiting');
    expect(text()).not.toContain('Nothing is waiting for your approval');
  });

  it('a failed event list on Events shows its own retry and never claims there are no events', async () => {
    (commsHubApi.listHubEvents as jest.Mock).mockRejectedValueOnce(new Error('down'));
    (commsHubApi.apiErrorMessage as jest.Mock).mockReturnValue('The events did not load.');
    await renderAt('/admin/comms-hub/events');
    expect(Array.from(container.querySelectorAll('[role="alert"]')).map((a) => a.textContent).join(' ')).toContain('The events did not load.');
    expect(text()).not.toContain('No upcoming events');
  });

  it.each([
    ['/admin/comms-hub', 'Nothing is waiting for your approval'],
    ['/admin/comms-hub/schedule', 'Nothing is scheduled'],
  ])('a failed summary on %s shows the retry and never claims emptiness', async (path, emptyCopy) => {
    (commsHubApi.getCommsHubSummary as jest.Mock).mockRejectedValueOnce(new Error('down'));
    await renderAt(path);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('did not load');
    expect(text()).not.toContain(emptyCopy);
    expect(Array.from(container.querySelectorAll('[role="status"]')).map((x) => x.textContent).join(' ')).toContain('unavailable until the summary loads');
  });

  it('before the summary arrives, tabs say Loading rather than empty', async () => {
    (commsHubApi.getCommsHubSummary as jest.Mock).mockReturnValue(new Promise(() => undefined));
    await renderAt('/admin/comms-hub/schedule');
    expect(text()).toContain('Loading...');
    expect(text()).not.toContain('Nothing is scheduled');
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
    const focusables = Array.from(container.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')).slice(0, 7);
    const order: string[] = [];
    for (const el of focusables) { el.focus(); order.push((document.activeElement?.textContent ?? '').trim()); }
    expect(order).toEqual(['Pause all sending', 'New event', 'New message', 'Today', 'Events', 'Compose', 'Schedule & history']);
    for (const el of focusables) expect(el.className).toMatch(/comms-hub-(action|tab)/);
  });
});
