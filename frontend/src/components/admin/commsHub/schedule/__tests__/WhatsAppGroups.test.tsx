import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import axe from 'axe-core';
import WhatsAppGroups, { syncSummary } from '../WhatsAppGroups';
import * as api from '../../../../../services/commsHubApi';
import type { WhatsAppGroup } from '../../../../../services/commsHubApi';

/** CH10.2 the groups list: Sync only when connected, one switch per group, can't-send groups explain themselves. */
jest.mock('../../../../../services/commsHubApi');
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const G = (o: Partial<WhatsAppGroup>): WhatsAppGroup => ({
  id: '11111111-1111-4111-8111-111111111111', name: 'Comms Hub test group', participants_count: 2, enabled: false, sendable: true, cant_send_reason: null, last_synced_at: '2026-11-21T22:00:00.000Z', ...o,
});
const TEST = G({});
const ADMINS = G({ id: '33333333-3333-4333-8333-333333333333', name: 'Announcements only', sendable: false, cant_send_reason: 'Only admins can post here, and the hub number is not an admin.' });
let container: HTMLDivElement;
let root: Root;
const settle = async (): Promise<void> => { for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); }); };
async function render(connected = true): Promise<void> {
  await act(async () => { root.render(<WhatsAppGroups connected={connected} />); });
  await settle();
}
const sw = (name: string): HTMLInputElement => {
  const label = Array.from(container.querySelectorAll('label')).find((l) => l.textContent === name)!;
  return document.getElementById(label.htmlFor) as HTMLInputElement;
};
const button = (text: string): HTMLButtonElement | undefined => Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(text));

beforeEach(() => {
  (api.listWhatsAppGroups as jest.Mock).mockResolvedValue([TEST, ADMINS]);
  (api.apiErrorMessage as jest.Mock).mockImplementation((err: { response?: { data?: { error?: string } } }, fallback: string) => err?.response?.data?.error ?? fallback);
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

it('lists each group with a labelled switch, off by default; a can\'t-send group says why and cannot be switched on', async () => {
  await render();
  expect([sw('Comms Hub test group').checked, sw('Comms Hub test group').disabled, sw('Comms Hub test group').getAttribute('role')]).toEqual([false, false, 'switch']);
  expect(sw('Announcements only').disabled).toBe(true);
  expect(container.textContent).toContain("Can't send here: Only admins can post here, and the hub number is not an admin.");
  expect(container.textContent).toContain('2 members. Sending is off.');
  const results = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

it('switching a group on calls the API, shows it on, and says so', async () => {
  (api.setWhatsAppGroupEnabled as jest.Mock).mockResolvedValue({ ...TEST, enabled: true });
  await render();
  await act(async () => { sw('Comms Hub test group').click(); });
  await settle();
  expect(api.setWhatsAppGroupEnabled).toHaveBeenCalledWith(TEST.id, true);
  expect(sw('Comms Hub test group').checked).toBe(true);
  expect(container.querySelector('[role="status"]')?.textContent).toBe('WhatsApp sending to Comms Hub test group is on.');
});

it('a refused switch shows the server\'s reason and leaves the switch off', async () => {
  (api.setWhatsAppGroupEnabled as jest.Mock).mockRejectedValue({ response: { data: { error: 'This group cannot be switched on: WhatsApp has suspended this group.' } } });
  await render();
  await act(async () => { sw('Comms Hub test group').click(); });
  await settle();
  expect(container.querySelector('[role="alert"]')?.textContent).toBe('This group cannot be switched on: WhatsApp has suspended this group.');
  expect(sw('Comms Hub test group').checked).toBe(false);
});

it('Sync groups shows only when connected, reports what it found, and reloads the list', async () => {
  (api.syncWhatsAppGroups as jest.Mock).mockResolvedValue({ listed: 3, added: 1, left: 1 });
  await render(false);
  expect(button('Sync groups')).toBeUndefined();
  await act(async () => { root.render(<WhatsAppGroups connected />); });
  await settle();
  await act(async () => { button('Sync groups')!.click(); });
  await settle();
  expect(container.textContent).toContain('3 groups found, 1 new, 1 no longer include the hub number.');
  expect((api.listWhatsAppGroups as jest.Mock).mock.calls.length).toBeGreaterThanOrEqual(2);
});

it('a failed sync shows the reason; an empty list says what to do; a failed load can be retried', async () => {
  (api.syncWhatsAppGroups as jest.Mock).mockRejectedValue({ response: { data: { error: 'WhatsApp did not answer, so nothing changed. Try again in a minute.' } } });
  (api.listWhatsAppGroups as jest.Mock).mockResolvedValueOnce([]);
  await render();
  expect(container.textContent).toContain('No groups yet. Use Sync groups');
  await act(async () => { button('Sync groups')!.click(); });
  await settle();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('WhatsApp did not answer');
  act(() => root.unmount());
  root = createRoot(container);
  (api.listWhatsAppGroups as jest.Mock).mockRejectedValueOnce(new Error('500'));
  await render();
  expect(container.textContent).toContain('The groups did not load.');
  await act(async () => { button('Try again')!.click(); });
  await settle();
  expect(container.textContent).toContain('Comms Hub test group');
});

it('the sync summary reads as a sentence', () => {
  expect(syncSummary({ listed: 1, added: 0, left: 0 })).toBe('1 group found.');
  expect(syncSummary({ listed: 0, added: 0, left: 2 })).toBe('0 groups found, 2 no longer include the hub number.');
});
