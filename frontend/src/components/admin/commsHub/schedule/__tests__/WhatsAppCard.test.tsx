import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import axe from 'axe-core';
import WhatsAppCard, { whatsAppHeadline } from '../WhatsAppCard';
import * as api from '../../../../../services/commsHubApi';
import type { WhatsAppStatus } from '../../../../../services/commsHubApi';

/** CH10.1 The WhatsApp card: each state in words with an icon, a failed load can be retried. */
jest.mock('../../../../../services/commsHubApi');
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const S = (o: Partial<WhatsAppStatus>): WhatsAppStatus => ({ configured: true, enabled: true, state: 'connected', number_last4: '4567', reason: null, ...o });
let container: HTMLDivElement;
let root: Root;
const settle = async (): Promise<void> => { for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); }); };
async function render(): Promise<void> {
  await act(async () => { root.render(<WhatsAppCard />); });
  await settle();
}
const card = (): string => container.querySelector('[data-testid="ch-whatsapp-card"]')?.textContent ?? '';

beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

it.each([
  [S({ configured: false, enabled: false, state: 'not_configured', number_last4: null, reason: 'WhatsApp is switched off for the hub.' }), 'Not connected', 'WhatsApp is not connected. Nothing is sent to WhatsApp groups until it is set up.'],
  [S({}), 'Connected', 'Connected as the number ending 4567.'],
  [S({ state: 'waiting_for_qr', number_last4: null, reason: 'Scan the QR code on the WhatsApp channel with the company phone.' }), 'Waiting for QR scan', 'Scan the QR code'],
  [S({ state: 'disconnected', number_last4: null, reason: 'The phone and the WhatsApp channel are out of sync.' }), 'Disconnected', 'out of sync'],
])('state %#: badge %s and the plain-words line', async (status, badge, line) => {
  (api.getWhatsAppStatus as jest.Mock).mockResolvedValue(status);
  await render();
  expect(container.querySelector('.ch-status')?.textContent).toBe(badge);
  expect(container.querySelector('.ch-status i')?.getAttribute('aria-hidden')).toBe('true');
  expect(card()).toContain(line);
  const results = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
  expect(results.violations.map((v) => v.id)).toEqual([]);
});

it('a failed load says so and Try again loads it', async () => {
  (api.getWhatsAppStatus as jest.Mock).mockRejectedValueOnce(new Error('500')).mockResolvedValueOnce(S({}));
  await render();
  expect(card()).toContain('The WhatsApp status did not load.');
  const retry = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Try again')!;
  await act(async () => { retry.click(); });
  await settle();
  expect(card()).toContain('Connected as the number ending 4567.');
  expect(api.getWhatsAppStatus).toHaveBeenCalledTimes(2);
});

it('connected without a reported number still reads cleanly', () => {
  expect(whatsAppHeadline(S({ number_last4: null }))).toBe('Connected.');
  expect(whatsAppHeadline(S({ state: 'disconnected', number_last4: null, reason: null }))).toBe('WhatsApp is not sending right now.');
});
