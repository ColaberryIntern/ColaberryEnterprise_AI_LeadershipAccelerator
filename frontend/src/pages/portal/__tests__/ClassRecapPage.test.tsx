import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The class recap page (WL1.2): opened from the recap email, no login. With a personal token it shows
 * the class chat; without one (forwarded or expired) only the overview; a class with no recap is a
 * clear "not available", never a blank page or a login prompt.
 */
let mockSearch = 't=tok';
jest.mock('react-router-dom', () => ({
  __esModule: true,
  useParams: () => ({ sessionId: 'sess-1' }),
  useSearchParams: () => [new URLSearchParams(mockSearch)],
}));
jest.mock('../../../services/weeklyLiveRecapApi', () => ({ __esModule: true, getPublicRecap: jest.fn() }));

import { getPublicRecap } from '../../../services/weeklyLiveRecapApi';
import ClassRecapPage, { RECAP_TAB_TITLE } from '../ClassRecapPage';

const mockGet = getPublicRecap as unknown as jest.Mock;
const SUMMARY = {
  headline: 'It Works While You Sleep', intro: 'Thanks for joining.',
  ideas: [{ icon: '', title: 'One skill, one job', text: 'Sort, draft, brief' }],
  steps: ['Sort', 'Draft'], quote: 'It drafts. You decide.', homework: 'Pick one overnight task',
};
const BASE = { title: 'Weekly Live Ep 2', date: 'Monday, November 30', summary: SUMMARY, nextEventUrl: 'https://www.eventbrite.com/e/1', chat: null, personal: false };

let container: HTMLDivElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); mockGet.mockReset(); mockSearch = 't=tok'; });
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
const q = (id: string) => container.querySelector(`[data-testid="${id}"]`);

it('with a personal token: overview, next-event button and the class chat', async () => {
  mockGet.mockResolvedValue({ ...BASE, personal: true, chat: [{ id: 'm1', kind: 'attendee', name: 'Ana', content: 'Can it run on my phone?', at: '2026-11-30T00:40:00Z' }] });
  act(() => { root.render(<ClassRecapPage />); });
  await flush();
  expect(mockGet).toHaveBeenCalledWith('sess-1', 'tok');
  expect(document.title).toBe(RECAP_TAB_TITLE);
  expect(q('rcp-hero')?.textContent).toContain('It Works While You Sleep');
  expect(q('rcp-ideas')?.textContent).toContain('One skill, one job');
  expect(q('rcp-next')?.getAttribute('href')).toBe('https://www.eventbrite.com/e/1');
  expect(q('rcp-chat')?.textContent).toContain('Can it run on my phone?');
  expect(q('rcp-chat-locked')).toBeNull();
});

it('without a token: overview only, the chat stays locked', async () => {
  mockSearch = '';
  mockGet.mockResolvedValue(BASE);
  act(() => { root.render(<ClassRecapPage />); });
  await flush();
  expect(mockGet).toHaveBeenCalledWith('sess-1', null);
  expect(q('rcp-hero')).not.toBeNull();
  expect(q('rcp-chat')).toBeNull();
  expect(q('rcp-chat-locked')).not.toBeNull();
});

it('a class with no recap says so, and never shows a login prompt', async () => {
  mockGet.mockRejectedValue({ response: { status: 404 } });
  act(() => { root.render(<ClassRecapPage />); });
  await flush();
  expect(q('rcp-missing')?.textContent).toContain('not available');
  expect(container.textContent?.toLowerCase()).not.toContain('log in');
  expect(container.textContent?.toLowerCase()).not.toContain('sign in');
});

it('a network failure is a retry message, not a blank page', async () => {
  mockGet.mockRejectedValue(new Error('offline'));
  act(() => { root.render(<ClassRecapPage />); });
  await flush();
  expect(q('rcp-missing')?.textContent).toContain('could not load');
});
