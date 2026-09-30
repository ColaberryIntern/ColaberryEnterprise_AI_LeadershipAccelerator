/**
 * TodayFeedV2.filter — CAPE Phase 5 (design doc §11 "Timeline header") real
 * filter-chip proof: switching the `filter` prop never re-fetches and never
 * loses already-loaded rows ("chips filter without resetting progress") —
 * an automated replacement for what would otherwise be a manual trace, per
 * CLAUDE.md "if behavior can be tested via code, do not validate it
 * narratively."
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import './testEnv/intersectionObserverMock';
import { todayFeedApi, type TodayFeedItem } from '../todayFeedApi';

jest.mock('../todayFeedApi', () => ({
  todayFeedApi: { list: jest.fn(), interact: jest.fn().mockResolvedValue({ ok: true }) },
}));

import TodayFeedV2 from '../TodayFeedV2';

const mockList = todayFeedApi.list as unknown as jest.Mock;

function item(overrides: Partial<TodayFeedItem>): TodayFeedItem {
  return {
    position: 0, kind: 'ambient', ref: 'x', surface: 'today', type: 'blog', render_band: 'reading',
    card_id: null, title: 't', subtitle: null, description: null, image: null, video: null, blog: null,
    content: null, week: null, estimated_time: 10, status: null, interacted: false,
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  document.body.removeChild(container);
});

describe('TodayFeedV2 — filter prop change never re-fetches, never loses loaded rows', () => {
  it('a multi-category page loads once; changing the filter only changes what renders, and switching back to "all" restores every card with no second fetch', async () => {
    const page = {
      items: [
        item({ ref: 'ai0', type: 'ai_news_flash' }),
        item({ ref: 'proj0', type: 'implementation_task' }),
        item({ ref: 'com0', type: 'community_discussion' }),
      ],
      nextCursor: 3,
      exhausted: true,
    };
    mockList.mockResolvedValue(page);

    await act(async () => {
      root = createRoot(container);
      root.render(<TodayFeedV2 fallbackCards={[]} onOpen={() => {}} onWorkspace={() => {}} filter="all" />);
    });

    expect(mockList).toHaveBeenCalledTimes(1);
    // All 3 cards present under 'all'.
    expect(container.querySelectorAll('.tl-card').length).toBe(3);

    // Switch to ai_pulse only — no re-fetch, only 1 card renders.
    await act(async () => {
      root.render(<TodayFeedV2 fallbackCards={[]} onOpen={() => {}} onWorkspace={() => {}} filter="ai_pulse" />);
    });
    expect(mockList).toHaveBeenCalledTimes(1); // still just the one fetch
    expect(container.querySelectorAll('.tl-card').length).toBe(1);

    // Switch back to 'all' — every original card reappears, still no 2nd fetch.
    await act(async () => {
      root.render(<TodayFeedV2 fallbackCards={[]} onOpen={() => {}} onWorkspace={() => {}} filter="all" />);
    });
    expect(mockList).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll('.tl-card').length).toBe(3);
  });

  it('onCounts fires with live counts of currently-loaded items, and does NOT re-fire just because the filter prop changed (only when rows change)', async () => {
    const page = {
      items: [item({ ref: 'ai0', type: 'ai_news_flash' }), item({ ref: 'ai1', type: 'ai_news_flash' })],
      nextCursor: 2,
      exhausted: true,
    };
    mockList.mockResolvedValue(page);
    const onCounts = jest.fn();

    await act(async () => {
      root = createRoot(container);
      root.render(<TodayFeedV2 fallbackCards={[]} onOpen={() => {}} onWorkspace={() => {}} filter="all" onCounts={onCounts} />);
    });
    // Fires once for the initial empty `rows` (before the fetch resolves) and
    // once more after the real page loads — both are genuine `rows` changes,
    // not a bug. The FINAL call is what matters for correctness.
    const lastCall = onCounts.mock.calls[onCounts.mock.calls.length - 1][0];
    expect(lastCall.ai_pulse).toBe(2);

    const callsBefore = onCounts.mock.calls.length;
    await act(async () => {
      root.render(<TodayFeedV2 fallbackCards={[]} onOpen={() => {}} onWorkspace={() => {}} filter="community" onCounts={onCounts} />);
    });
    expect(onCounts.mock.calls.length).toBe(callsBefore); // rows didn't change on a filter-only change -> no new call
  });

  it('an unset/undefined filter behaves exactly like "all" (byte-identical default, matching pre-Phase-5 behavior)', async () => {
    const page = { items: [item({ ref: 'a', type: 'blog' }), item({ ref: 'b', type: 'community_discussion' })], nextCursor: 2, exhausted: true };
    mockList.mockResolvedValue(page);

    await act(async () => {
      root = createRoot(container);
      root.render(<TodayFeedV2 fallbackCards={[]} onOpen={() => {}} onWorkspace={() => {}} />);
    });
    expect(container.querySelectorAll('.tl-card').length).toBe(2);
  });
});
