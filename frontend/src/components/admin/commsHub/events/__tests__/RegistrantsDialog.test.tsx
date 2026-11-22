import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import axe from 'axe-core';
import RegistrantsDialog from '../RegistrantsDialog';
import * as api from '../../../../../services/commsHubApi';
import type { EventbriteEvent, RegistrantList } from '../../../../../services/commsHubApi';

jest.mock('../../../../../services/commsHubApi', () => ({
  ...jest.requireActual('../../../../../services/commsHubApi'),
  getRegistrants: jest.fn(), downloadRegistrantsCsv: jest.fn(),
}));

/**
 * CH9.3 the registrants dialog: count, search on the loaded rows (never in a URL), a partial list said
 * to be partial, Download CSV, no phone numbers on screen, and accessible.
 */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
const settle = async (): Promise<void> => { for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); }); };
const EV: EventbriteEvent = { ccpp_event_id: '777', title: 'AI Open House', starts_at: '2026-12-04T00:30:00.000Z', ends_at: null, registration_url: null, image_url: null, registered: 2, description: null, eventbrite_status: 'live', adopted_event_id: null };
const LIST: RegistrantList = {
  event: { ccpp_event_id: '777', title: 'AI Open House', starts_at: '2026-12-04T00:30:00.000Z' }, eventbrite: 'ok', count: 2,
  rows: [
    { name: 'Ada Lovelace', email: 'ada@x.test', registered_at: '2026-11-09T18:00:00.000Z', sources: ['eventbrite', 'site'], has_account: true },
    { name: '', email: 'grace@x.test', registered_at: null, sources: ['site'], has_account: false },
  ],
};
const onClose = jest.fn();
async function render(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<RegistrantsDialog ev={EV} onClose={onClose} />); });
  await settle();
}
afterEach(() => { act(() => { root.unmount(); }); container.remove(); jest.clearAllMocks(); });
const text = (): string => container.textContent ?? '';
const btn = (label: string): HTMLButtonElement => Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(label)) as HTMLButtonElement;
function type(el: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

it('shows the count and one row per person, with Central time, sources and account; no phone column', async () => {
  (api.getRegistrants as jest.Mock).mockResolvedValue(LIST);
  await render();
  expect(api.getRegistrants).toHaveBeenCalledWith('777');
  expect(container.querySelector('[data-testid="registrants-count"]')?.textContent).toBe('2 people');
  const cells = Array.from(container.querySelectorAll('tbody tr')).map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => td.textContent));
  expect(cells).toEqual([
    ['Ada Lovelace', 'ada@x.test', 'Nov 9, 12:00 PM CST', 'Eventbrite + Our site', 'Yes'],
    ['No name given', 'grace@x.test', 'Not recorded', 'Our site', 'No'],
  ]);
  expect(Array.from(container.querySelectorAll('th')).map((th) => th.textContent)).not.toContain('Phone');
});

it('search filters the loaded rows and asks the server nothing more', async () => {
  (api.getRegistrants as jest.Mock).mockResolvedValue(LIST);
  await render();
  await act(async () => { type(container.querySelector('input[type="search"]') as HTMLInputElement, 'GRACE'); });
  expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
  await act(async () => { type(container.querySelector('input[type="search"]') as HTMLInputElement, 'nobody-here'); });
  expect(text()).toContain('No one matches that search.');
  expect(api.getRegistrants).toHaveBeenCalledTimes(1);
});

it('a partial list says Eventbrite could not be read', async () => {
  (api.getRegistrants as jest.Mock).mockResolvedValue({ ...LIST, eventbrite: 'unavailable', count: 1, rows: [LIST.rows[1]] });
  await render();
  expect(container.querySelector('[data-testid="registrants-partial"]')?.textContent).toContain('only the people who registered on our site');
});

it('nobody yet: says so, and Download is off; a failed load says so', async () => {
  (api.getRegistrants as jest.Mock).mockResolvedValue({ ...LIST, count: 0, rows: [] });
  await render();
  expect(text()).toContain('Nobody has registered yet.');
  expect(btn('Download CSV').disabled).toBe(true);
  act(() => { root.unmount(); }); container.remove();
  (api.getRegistrants as jest.Mock).mockRejectedValue(new Error('Network Error'));
  await render();
  expect(container.querySelector('[role="alert"]')?.textContent).toBeTruthy();
});

it('Download CSV saves the file the server named; a failure says so', async () => {
  (api.getRegistrants as jest.Mock).mockResolvedValue(LIST);
  const created = jest.fn(() => 'blob:x'); const revoked = jest.fn();
  Object.assign(URL, { createObjectURL: created, revokeObjectURL: revoked });
  const clicks: string[] = [];
  const spy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clicks.push(this.download); });
  (api.downloadRegistrantsCsv as jest.Mock).mockResolvedValue({ blob: new Blob(['x']), filename: 'registrants-ai-open-house-2026-12-03.csv' });
  await render();
  await act(async () => { btn('Download CSV').click(); });
  await settle();
  expect(api.downloadRegistrantsCsv).toHaveBeenCalledWith('777');
  expect(clicks).toEqual(['registrants-ai-open-house-2026-12-03.csv']);
  expect(revoked).toHaveBeenCalledWith('blob:x');
  (api.downloadRegistrantsCsv as jest.Mock).mockRejectedValue(new Error('Network Error'));
  await act(async () => { btn('Download CSV').click(); });
  await settle();
  // A plain network failure shows the plain-language fallback, not the raw error text.
  expect(text()).toContain('The download did not start. Try again.');
  spy.mockRestore();
});

it('Escape and Close both close it', async () => {
  (api.getRegistrants as jest.Mock).mockResolvedValue(LIST);
  await render();
  await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
  await act(async () => { btn('Close').click(); });
  expect(onClose).toHaveBeenCalledTimes(2);
});

it('accessibility: a labelled modal dialog, focus on its heading, axe clean, controls carry the 44px rules', async () => {
  (api.getRegistrants as jest.Mock).mockResolvedValue(LIST);
  await render();
  const dialog = container.querySelector('[role="dialog"]')!;
  expect([dialog.getAttribute('aria-modal'), dialog.getAttribute('aria-labelledby')]).toEqual(['true', 'ch-registrants-title']);
  expect(document.activeElement?.id).toBe('ch-registrants-title');
  const results = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  for (const b of Array.from(container.querySelectorAll('button'))) expect(b.className).toMatch(/comms-hub-action/);
});

describe('registrantsPath (no query string, ever)', () => {
  it('builds the two addresses from a digits-only id', () => {
    expect(api.registrantsPath('777')).toBe('/api/admin/comms-hub/eventbrite-events/777/registrants');
    expect(api.registrantsPath('777', true)).toBe('/api/admin/comms-hub/eventbrite-events/777/registrants.csv');
    expect(api.registrantsPath('777')).not.toContain('?');
  });
  it('refuses anything that is not an Eventbrite id', () => {
    expect(() => api.registrantsPath('7?email=a@x.test')).toThrow();
    expect(() => api.registrantsPath('../users')).toThrow();
  });
});
