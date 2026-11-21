import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import EventbriteCardActions from '../EventbriteCardActions';
import * as api from '../../../../../services/commsHubApi';
import type { EventbriteEvent } from '../../../../../services/commsHubApi';

jest.mock('../../../../../services/commsHubApi', () => ({ ...jest.requireActual('../../../../../services/commsHubApi'), adoptEventbriteEvent: jest.fn() }));

/** CH9.5 the Eventbrite card's buttons: Manage in the hub links and opens it; a linked card opens its hub event; an ended one offers no Manage. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
const settle = async (): Promise<void> => { for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); }); };
const future = new Date(Date.now() + 5 * 86_400_000).toISOString();
const EV = (o: Partial<EventbriteEvent> = {}): EventbriteEvent => ({
  ccpp_event_id: '777', title: 'AI Open House', starts_at: future, ends_at: null, registration_url: null, image_url: null, registered: 2, eventbrite_status: 'live', adopted_event_id: null, ...o,
});
const onOpen = jest.fn(); const onRegistrants = jest.fn();
async function render(ev: EventbriteEvent): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<EventbriteCardActions ev={ev} onOpen={onOpen} onRegistrants={onRegistrants} />); });
}
afterEach(() => { act(() => { root.unmount(); }); container.remove(); jest.clearAllMocks(); });
const btn = (label: string): HTMLButtonElement | undefined => Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').startsWith(label));

it('Manage in the hub links the event and opens the hub event it made', async () => {
  (api.adoptEventbriteEvent as jest.Mock).mockResolvedValue({ id: 'hub-1' });
  await render(EV());
  await act(async () => { btn('Manage in the hub')!.click(); });
  await settle();
  expect(api.adoptEventbriteEvent).toHaveBeenCalledWith('777');
  expect(onOpen).toHaveBeenCalledWith('hub-1');
});

it('a linked card says Managed in the hub and opens that event; no second Manage', async () => {
  await render(EV({ adopted_event_id: 'hub-9' }));
  expect(container.querySelector('[data-testid="ch-managed"]')?.textContent).toContain('Managed in the hub');
  expect(btn('Manage in the hub')).toBeUndefined();
  await act(async () => { btn('Open in the hub')!.click(); });
  expect(onOpen).toHaveBeenCalledWith('hub-9');
  expect(api.adoptEventbriteEvent).not.toHaveBeenCalled();
});

it('an event that has ended offers registrants but not Manage', async () => {
  await render(EV({ starts_at: '2026-01-01T00:00:00.000Z', ends_at: '2026-01-01T01:00:00.000Z' }));
  expect(btn('Manage in the hub')).toBeUndefined();
  expect(btn('View registrants')).toBeDefined();
});

it('a refused Manage says why and the button comes back', async () => {
  (api.adoptEventbriteEvent as jest.Mock).mockRejectedValue({ response: { data: { error: 'The Eventbrite list is unavailable right now. Try again in a few minutes.' } } });
  await render(EV());
  await act(async () => { btn('Manage in the hub')!.click(); });
  await settle();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('unavailable right now');
  expect(btn('Manage in the hub')!.disabled).toBe(false);
  expect(onOpen).not.toHaveBeenCalled();
});

it('View registrants hands the event up', async () => {
  await render(EV());
  await act(async () => { btn('View registrants')!.click(); });
  expect(onRegistrants).toHaveBeenCalledWith(expect.objectContaining({ ccpp_event_id: '777' }));
});
