/**
 * C107: an Explorer's starter lineup ends with what opens the rest, and asks for no more pages; the ordinary feed
 * still ends with "all caught up". Each card is wrapped so the seen tracker can watch it.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import './testEnv/intersectionObserverMock';
import { todayFeedApi, type TodayFeedItem } from '../todayFeedApi';

jest.mock('../todayFeedApi', () => ({
  todayFeedApi: { list: jest.fn(), interact: jest.fn(), events: jest.fn() },
  MAX_EVENTS_PER_CALL: 30,
}));

import TodayFeedV2 from '../TodayFeedV2';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mockList = todayFeedApi.list as unknown as jest.Mock;

function item(i: number): TodayFeedItem {
  return {
    position: i, kind: 'ambient', ref: `blog:${i}`, surface: 'today', type: 'blog', render_band: 'reading', card_id: null,
    title: `Item ${i}`, subtitle: null, description: null, image: null, video: null, blog: null, content: null, week: null,
    estimated_time: 5, status: null, interacted: false,
  };
}

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });
async function mount() {
  await act(async () => {
    root = createRoot(container);
    root.render(<TodayFeedV2 fallbackCards={[]} onOpen={() => undefined} onWorkspace={() => undefined} filter="all" />);
  });
}

it('a starter lineup ends with what opens the full feed, and fetches no second page', async () => {
  mockList.mockResolvedValue({ items: [0, 1, 2, 3, 4].map(item), nextCursor: 5, exhausted: true, starter: true });
  await mount();
  expect(container.querySelector('[data-testid="te-feed-starter-end"]')!.textContent).toBe('Finish your first lesson and your full feed opens up.');
  expect(container.textContent).not.toContain("You're all caught up");
  expect(mockList).toHaveBeenCalledTimes(1);
});

it('the ordinary feed still ends with "all caught up"', async () => {
  mockList.mockResolvedValue({ items: [0, 1].map(item), nextCursor: 2, exhausted: true });
  await mount();
  expect(container.querySelector('[data-testid="te-feed-starter-end"]')).toBeNull();
  expect(container.textContent).toContain("You're all caught up for now.");
});

it('every card sits in a wrapper the seen tracker can watch, keyed by its ref', async () => {
  mockList.mockResolvedValue({ items: [0, 1, 2].map(item), nextCursor: 3, exhausted: true, starter: true });
  await mount();
  expect(Array.from(container.querySelectorAll('[data-today-ref]')).map((e) => e.getAttribute('data-today-ref')))
    .toEqual(['blog:0', 'blog:1', 'blog:2']);
});
