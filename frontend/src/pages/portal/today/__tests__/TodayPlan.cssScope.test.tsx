/**
 * TodayPlan — CSS scope regression test (CAPE Phase 5 production incident,
 * 2026-08-04/05). Root cause: `TodayPlan.tsx` composed `TodayPlanCard.tsx`
 * (which renders the shared `<TimelineCard>`) WITHOUT the `.tl-de` scope
 * wrapper that every other `<TimelineCard>` call site in this repo uses
 * (`TodayFeedV2.tsx`, `TimelineEditorTab.tsx` x2, `CardDetailDrawer.tsx`,
 * `TimelineFeed.tsx`). Every sizing/color rule for a card's tile (`.mthumb`)
 * and header icon badge (`.ico`) in `components/timeline/timeline.css` is
 * written as a `.tl-de <selector>` DESCENDANT rule — so a `<TimelineCard>`
 * rendered outside a `.tl-de` ancestor gets NONE of that styling: the icon
 * badge's SVG has no CSS-imposed width/height (browser UA default ~300x150)
 * and no imposed white icon color (falls back to default black text), and
 * the media tile loses its 100%-width/16:9-aspect/block layout — which is
 * exactly the "huge black rectangular and circular blocks" Ali reported on
 * enterprise.colaberry.ai/portal/today when both CAPE flags were flipped on.
 *
 * This test loads the REAL `timeline.css` text (jest's default CRA config
 * stubs `.css` imports to an empty module, so a plain `import` proves
 * nothing) into jsdom via a `<style>` tag and uses `getComputedStyle` — a
 * real CSS selector-matching engine — to prove the ancestor-scoped rules do
 * or don't apply, rather than asserting on class-name strings alone.
 */
import React from 'react';
import fs from 'fs';
import path from 'path';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import './testEnv/intersectionObserverMock';
import { fetchTodayPlan, submitTodayPlanFeedback, startTestOut } from '../../../../services/capeApi';
import { todayFeedApi, type TodayFeedItem } from '../todayFeedApi';

jest.mock('../../../../services/capeApi', () => ({
  fetchTodayPlan: jest.fn(),
  submitTodayPlanFeedback: jest.fn().mockResolvedValue({ ok: true, created: true }),
  startTestOut: jest.fn().mockResolvedValue({ attempt_id: 'a1', skill_id: 'rag', trigger: 'test_out', items: [] }),
}));
jest.mock('../todayFeedApi', () => ({
  todayFeedApi: { list: jest.fn(), interact: jest.fn().mockResolvedValue({ ok: true }) },
}));

import TodayPlan from '../TodayPlan';
import TodayFeedV2 from '../TodayFeedV2';

const mockFetchPlan = fetchTodayPlan as unknown as jest.Mock;
const mockList = todayFeedApi.list as unknown as jest.Mock;
const noop = () => {};

function planItem(overrides: Record<string, any> = {}) {
  return {
    position: 0, kind: 'anchored', ref: 'card:a0', surface: 'today', type: 'announcement', render_band: 'announcement',
    card_id: 'a0', title: 'Week 4 kickoff', subtitle: null, description: null, image: null, video: null, blog: null,
    content: null, week: 4, estimated_time: 15, status: 'available', interacted: false,
    slot: 'next_best', chips: { why_this: 'Builds your RAG skill', level: 'Working', proof: 'Learn' },
    ...overrides,
  };
}
function feedItem(overrides: Partial<TodayFeedItem>): TodayFeedItem {
  return {
    position: 0, kind: 'ambient', ref: 'x', surface: 'today', type: 'intel', render_band: 'intel',
    card_id: null, title: 'Perplexity — Architecture Breakdown', subtitle: null, description: null, image: null,
    video: null, blog: null, content: null, week: null, estimated_time: 10, status: null, interacted: false,
    ...overrides,
  };
}

// Real CSS text from the actual production stylesheet — NOT a jest-stubbed
// `.css` import (CRA's cssTransform turns those into `{}`).
const timelineCss = fs.readFileSync(
  path.join(__dirname, '../../../../components/timeline/timeline.css'),
  'utf8',
);

let container: HTMLDivElement;
let root: Root;
let styleEl: HTMLStyleElement;

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  styleEl = document.createElement('style');
  styleEl.textContent = timelineCss;
  document.head.appendChild(styleEl);
});

afterEach(() => {
  act(() => { root.unmount(); });
  document.body.removeChild(container);
  document.head.removeChild(styleEl);
});

async function mount(ui: React.ReactElement) {
  await act(async () => {
    root = createRoot(container);
    root.render(ui);
  });
}

describe('TodayPlan — .tl-de CSS scope (regression for the CAPE Phase 5 black-block incident)', () => {
  it('a Today Plan card\'s icon badge (.ico) and media tile (.mthumb) receive the REAL timeline.css sizing/color rules — proving they sit inside a .tl-de ancestor', async () => {
    mockFetchPlan.mockResolvedValue({ mode: 'foundation', items: [planItem()], estimated_total_minutes: 15 });
    await mount(<TodayPlan onRefs={noop} onOpen={noop} onWorkspace={noop} />);

    const ico = container.querySelector('.fc-head .ico') as HTMLElement;
    const mthumb = container.querySelector('.mthumb') as HTMLElement;
    expect(ico).toBeTruthy();
    expect(mthumb).toBeTruthy();

    const icoStyle = window.getComputedStyle(ico);
    const thumbStyle = window.getComputedStyle(mthumb);

    // `.tl-de .fc-head .ico{width:38px;height:38px;...;color:#fff;...}` —
    // BEFORE the fix these all read as unset ('', default black text) because
    // TodayPlan's tree has no `.tl-de` ancestor.
    expect(icoStyle.width).toBe('38px');
    expect(icoStyle.height).toBe('38px');
    expect(icoStyle.color).toBe('rgb(255, 255, 255)');
    expect(icoStyle.display).toBe('flex');

    // `.tl-de .mthumb{width:100%;display:block;aspect-ratio:16/9;cursor:pointer}`
    expect(thumbStyle.width).toBe('100%');
    expect(thumbStyle.display).toBe('block');
    expect(thumbStyle.cursor).toBe('pointer');
  });

  it('mounting TodayPlan alongside TodayFeedV2 (their real sibling layout in TodayShell) never regresses the regular feed\'s own cards', async () => {
    mockFetchPlan.mockResolvedValue({ mode: 'foundation', items: [planItem()], estimated_total_minutes: 15 });
    mockList.mockResolvedValue({
      items: [feedItem({ ref: 'perplexity-1' })],
      nextCursor: 1,
      exhausted: true,
    });

    await mount(
      <div>
        <TodayPlan onRefs={noop} onOpen={noop} onWorkspace={noop} />
        <div className="te-feed">
          <TodayFeedV2 fallbackCards={[]} onOpen={noop} onWorkspace={noop} />
        </div>
      </div>,
    );

    // The regular feed's own wrapper is still the scope root — its card gets
    // the real sizing regardless of whether Today's Plan is also mounted.
    const feedCard = container.querySelector('.tl-de.te-feed, .te-feed .tl-de') as HTMLElement | null
      ?? container.querySelector('.te-feed .fcard');
    const feedThumb = container.querySelector('.te-feed .mthumb') as HTMLElement;
    expect(feedThumb).toBeTruthy();
    expect(window.getComputedStyle(feedThumb).width).toBe('100%');
    expect(window.getComputedStyle(feedThumb).display).toBe('block');

    // And the Today Plan card in the SAME document is also correctly scoped
    // post-fix (this is the actual defect under test).
    const planThumb = container.querySelector('.today-plan .mthumb') as HTMLElement;
    expect(planThumb).toBeTruthy();
    expect(window.getComputedStyle(planThumb).width).toBe('100%');
  });
});
