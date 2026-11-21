import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import axe from 'axe-core';
import EventbriteEvents, { centralWhen } from '../EventbriteEvents';
import * as api from '../../../../../services/commsHubApi';
import type { EventbriteEvent } from '../../../../../services/commsHubApi';

jest.mock('../../../../../services/commsHubApi', () => ({ ...jest.requireActual('../../../../../services/commsHubApi'), listEventbriteEvents: jest.fn() }));

/** CH9.2 "From Eventbrite" on the Events tab: the cards, and three states that never pass a failure off as "no events". */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
const settle = async (): Promise<void> => { for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); }); };
const EV: EventbriteEvent = {
  ccpp_event_id: '1234567890', title: 'AI Open House', starts_at: '2026-12-04T00:30:00.000Z', ends_at: null,
  registration_url: 'https://www.eventbrite.com/e/ai-open-house-1234567890', image_url: 'https://img.test/x.png', registered: 14, description: null, eventbrite_status: 'live', adopted_event_id: null,
};
const list = (o: Partial<api.EventbriteList> = {}): api.EventbriteList => ({ status: 'ok', window: 'upcoming', events: [EV], fetched_at: '2026-11-21T22:00:00.000Z', ...o });
async function render(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<EventbriteEvents />); });
  await settle();
}
afterEach(() => { act(() => { root.unmount(); }); container.remove(); jest.clearAllMocks(); });
const text = (): string => container.textContent ?? '';
const btn = (label: string): HTMLButtonElement => Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(label)) as HTMLButtonElement;

it('a card shows the picture, title, Central date and time, the registered count and a link out to Eventbrite', async () => {
  (api.listEventbriteEvents as jest.Mock).mockResolvedValue(list());
  await render();
  const card = container.querySelector('article')!;
  expect(card.querySelector('img')?.getAttribute('src')).toBe('https://img.test/x.png');
  expect(card.textContent).toContain('AI Open House');
  expect(card.textContent).toContain('Thu, Dec 3, 6:30 PM CST');
  expect(card.textContent).toContain('14 registered');
  expect(card.textContent).toContain('From Eventbrite');
  const link = card.querySelector('a')!;
  expect([link.getAttribute('href'), link.getAttribute('target'), link.getAttribute('rel')]).toEqual([EV.registration_url, '_blank', 'noopener noreferrer']);
});

it('an unknown count reads as not known, never 0; one person is singular', async () => {
  (api.listEventbriteEvents as jest.Mock).mockResolvedValue(list({ events: [{ ...EV, registered: null }, { ...EV, ccpp_event_id: '2', registered: 1 }] }));
  await render();
  expect(text()).toContain('Registrations not known');
  expect(text()).toContain('1 registered');
  expect(text()).not.toContain('0 registered');
});

it('loading, then the list; switching to Past asks for the past window', async () => {
  (api.listEventbriteEvents as jest.Mock).mockResolvedValue(list());
  await render();
  expect(api.listEventbriteEvents).toHaveBeenCalledWith('upcoming');
  (api.listEventbriteEvents as jest.Mock).mockResolvedValue(list({ window: 'past', events: [] }));
  await act(async () => { btn('Past 90 days').click(); });
  await settle();
  expect(api.listEventbriteEvents).toHaveBeenLastCalledWith('past');
  expect(text()).toContain('No Eventbrite events in the past 90 days');
});

it('"unavailable" says so with a retry and never claims there are no events; the retry reloads', async () => {
  (api.listEventbriteEvents as jest.Mock).mockResolvedValue(list({ status: 'unavailable', events: [] }));
  await render();
  expect(container.querySelector('[data-testid="eventbrite-unavailable"]')?.textContent).toContain('unavailable right now');
  expect(text()).not.toContain('No upcoming Eventbrite events');
  (api.listEventbriteEvents as jest.Mock).mockResolvedValue(list());
  await act(async () => { btn('Try again').click(); });
  await settle();
  expect(text()).toContain('AI Open House');
});

it('a failed request is the same honest state, and "not configured" says Eventbrite is not connected', async () => {
  (api.listEventbriteEvents as jest.Mock).mockRejectedValue(new Error('Network Error'));
  await render();
  expect(container.querySelector('[data-testid="eventbrite-unavailable"]')).not.toBeNull();
  act(() => { root.unmount(); }); container.remove();
  (api.listEventbriteEvents as jest.Mock).mockResolvedValue(list({ status: 'not_configured', events: [] }));
  await render();
  expect(text()).toContain('Eventbrite is not connected on this server.');
});

it('accessibility: axe finds no WCAG A/AA violations; the picture is decorative; controls carry the 44px class', async () => {
  (api.listEventbriteEvents as jest.Mock).mockResolvedValue(list());
  await render();
  const results = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  expect(container.querySelector('img')?.getAttribute('alt')).toBe('');
  for (const el of Array.from(container.querySelectorAll<HTMLElement>('button, a[href]'))) expect(el.className).toMatch(/comms-hub-action/);
});

it('centralWhen writes Central time with the zone, across daylight saving', () => {
  expect(centralWhen('2026-07-01T23:00:00.000Z')).toBe('Wed, Jul 1, 6:00 PM CDT');
  expect(centralWhen('2026-12-04T00:30:00.000Z')).toBe('Thu, Dec 3, 6:30 PM CST');
});
