import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import axe from 'axe-core';
import WhatsAppPause, { centralWhen } from '../WhatsAppPause';
import * as api from '../../../../../services/commsHubApi';

/** CH10.4 "Paused by WhatsApp until ..." with a confirm before resuming early. */
jest.mock('../../../../../services/commsHubApi');
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const UNTIL = '2026-12-03T18:00:00.000Z';
let container: HTMLDivElement;
let root: Root;
const onCleared = jest.fn();
const settle = async (): Promise<void> => { for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); }); };
const button = (t: string): HTMLButtonElement | undefined => Array.from(container.querySelectorAll('button')).find((b) => b.textContent === t);
async function render(): Promise<void> { await act(async () => { root.render(<WhatsAppPause until={UNTIL} onCleared={onCleared} />); }); await settle(); }

beforeEach(() => {
  jest.clearAllMocks();
  (api.apiErrorMessage as jest.Mock).mockImplementation((err: { response?: { data?: { error?: string } } }, fb: string) => err?.response?.data?.error ?? fb);
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

it('says until when in Central time, and that other channels keep sending', async () => {
  await render();
  expect(centralWhen(UNTIL)).toBe('Thu, Dec 3, 12:00 PM CST');
  const text = container.querySelector('[data-testid="ch-wa-paused"]')!.textContent;
  expect(text).toContain('Paused by WhatsApp until Thu, Dec 3, 12:00 PM CST.');
  expect(text).toContain('Other channels keep sending.');
  expect((await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })).violations.map((v) => v.id)).toEqual([]);
});

it('resuming early asks first; "Keep it paused" changes nothing', async () => {
  await render();
  await act(async () => { button('Resume WhatsApp early')!.click(); });
  expect(container.textContent).toContain('Resuming early can get the number blocked for longer. Resume now?');
  await act(async () => { button('Keep it paused')!.click(); });
  expect(api.clearWhatsAppPause).not.toHaveBeenCalled();
  expect(button('Resume WhatsApp early')).toBeDefined();
});

it('"Yes, resume now" clears it and reloads the card', async () => {
  (api.clearWhatsAppPause as jest.Mock).mockResolvedValue({ cleared: true });
  await render();
  await act(async () => { button('Resume WhatsApp early')!.click(); });
  await act(async () => { button('Yes, resume now')!.click(); });
  await settle();
  expect(api.clearWhatsAppPause).toHaveBeenCalledTimes(1);
  expect(onCleared).toHaveBeenCalledTimes(1);
});

it('a refusal (not an organizer) shows the server\'s words and keeps the pause', async () => {
  (api.clearWhatsAppPause as jest.Mock).mockRejectedValue({ response: { data: { error: 'Only an owner, admin or community organizer can resume WhatsApp early.' } } });
  await render();
  await act(async () => { button('Resume WhatsApp early')!.click(); });
  await act(async () => { button('Yes, resume now')!.click(); });
  await settle();
  expect(container.textContent).toContain('Only an owner, admin or community organizer can resume WhatsApp early.');
  expect(onCleared).not.toHaveBeenCalled();
});
