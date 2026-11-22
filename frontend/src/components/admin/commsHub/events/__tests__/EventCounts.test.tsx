import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import axe from 'axe-core';
import EventCounts, { LIVE_VS_REPLAY } from '../EventCounts';
import * as api from '../../../../../services/commsHubApi';

jest.mock('../../../../../services/commsHubApi', () => ({ ...jest.requireActual('../../../../../services/commsHubApi'), getEventCounts: jest.fn() }));

/** CH9.7 the event's three counts: a number when known, its reason when not (never 0), the exact copy line, a retry on failure. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
const settle = async (): Promise<void> => { for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); }); };
async function render(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<EventCounts eventId="hub-1" />); });
  await settle();
}
afterEach(() => { act(() => { root.unmount(); }); container.remove(); jest.clearAllMocks(); });
const tiles = (): string[][] => Array.from(container.querySelectorAll('.ch-count-tile')).map((t) => Array.from(t.children).map((c) => c.textContent ?? ''));

it('known counts show as numbers; an unknown one shows its reason, not 0; the copy line explains live vs replay', async () => {
  (api.getEventCounts as jest.Mock).mockResolvedValue({
    registered: { value: 1240, reason: null }, watched_live: { value: 312, reason: null },
    watched_replay: { value: null, reason: 'The stream has not ended yet, so there is no replay.' },
  });
  await render();
  expect(api.getEventCounts).toHaveBeenCalledWith('hub-1');
  expect(tiles()).toEqual([
    ['Registered', '1,240'], ['Watched live', '312'], ['Watched the replay', 'The stream has not ended yet, so there is no replay.'],
  ]);
  expect(container.textContent).toContain(LIVE_VS_REPLAY);
  expect(LIVE_VS_REPLAY).toBe('Live and replay are told apart by when each person first started watching.');
  expect(container.textContent).not.toMatch(/\b0\b/);
});

it('a real 0 is shown as 0', async () => {
  (api.getEventCounts as jest.Mock).mockResolvedValue({ registered: { value: 0, reason: null }, watched_live: { value: 0, reason: null }, watched_replay: { value: 0, reason: null } });
  await render();
  expect(tiles().map((t) => t[1])).toEqual(['0', '0', '0']);
});

it('a failed load says so and the retry reloads', async () => {
  (api.getEventCounts as jest.Mock).mockRejectedValueOnce(new Error('Network Error'));
  await render();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('The counts did not load.');
  (api.getEventCounts as jest.Mock).mockResolvedValue({ registered: { value: 2, reason: null }, watched_live: { value: null, reason: 'Not streamed yet.' }, watched_replay: { value: null, reason: 'Not streamed yet.' } });
  await act(async () => { (container.querySelector('button') as HTMLButtonElement).click(); });
  await settle();
  expect(tiles()[1]).toEqual(['Watched live', 'Not streamed yet.']);
});

it('accessibility: no axe violations', async () => {
  (api.getEventCounts as jest.Mock).mockResolvedValue({ registered: { value: 2, reason: null }, watched_live: { value: null, reason: 'Not streamed yet.' }, watched_replay: { value: null, reason: 'Not streamed yet.' } });
  await render();
  const results = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
  expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
});
