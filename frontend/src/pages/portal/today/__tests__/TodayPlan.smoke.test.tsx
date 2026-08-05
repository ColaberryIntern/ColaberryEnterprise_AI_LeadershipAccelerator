/**
 * TodayPlan — CAPE Phase 5 render-smoke tests (design doc §10, §16 Phase 5),
 * using the `renderToStaticMarkup`/`react-dom/test-utils` pattern already
 * proven in this repo (frontend/src/components/admin/kitConfig/__tests__/
 * panels.smoke.test.tsx) — no `@testing-library/react` dependency needed.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import './testEnv/intersectionObserverMock';
import { fetchTodayPlan, submitTodayPlanFeedback, startTestOut } from '../../../../services/capeApi';

jest.mock('../../../../services/capeApi', () => ({
  fetchTodayPlan: jest.fn(),
  submitTodayPlanFeedback: jest.fn().mockResolvedValue({ ok: true, created: true }),
  startTestOut: jest.fn().mockResolvedValue({ attempt_id: 'a1', skill_id: 'rag', trigger: 'test_out', items: [] }),
}));

import TodayPlan from '../TodayPlan';

const mockFetch = fetchTodayPlan as unknown as jest.Mock;
const noop = () => {};

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

async function mount(ui: React.ReactElement) {
  await act(async () => {
    root = createRoot(container);
    root.render(ui);
  });
}

function planItem(overrides: Record<string, any> = {}) {
  return {
    position: 0, kind: 'anchored', ref: 'card:a0', surface: 'today', type: 'deep_dive', render_band: 'deepdive',
    card_id: 'a0', title: 'RAG Foundations', subtitle: null, description: null, image: null, video: null, blog: null,
    content: null, week: 4, estimated_time: 15, status: 'available', interacted: false,
    slot: 'next_best', chips: { why_this: 'Builds your RAG skill', level: 'Working', proof: 'Learn' },
    ...overrides,
  };
}

describe('TodayPlan — flag-off / empty-plan render proof', () => {
  it('renders NOTHING when fetchTodayPlan resolves null (flag off / 404) — container.innerHTML === \'\'', async () => {
    mockFetch.mockResolvedValue(null);
    await mount(<TodayPlan onRefs={noop} onOpen={noop} onWorkspace={noop} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders NOTHING when the plan has zero items (a learner who completed everything)', async () => {
    mockFetch.mockResolvedValue({ mode: 'active_builder', items: [], estimated_total_minutes: 0 });
    await mount(<TodayPlan onRefs={noop} onOpen={noop} onWorkspace={noop} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders NOTHING when the fetch rejects (network error) — never throws, never shows a broken partial UI', async () => {
    mockFetch.mockRejectedValue(new Error('network error'));
    await mount(<TodayPlan onRefs={noop} onOpen={noop} onWorkspace={noop} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('TodayPlan — onRefs contract', () => {
  it('fires onRefs with the real consumed refs on a successful fetch', async () => {
    mockFetch.mockResolvedValue({ mode: 'foundation', items: [planItem({ ref: 'card:a0' }), planItem({ ref: 'ambient:n0', slot: 'ai_pulse' })], estimated_total_minutes: 20 });
    const onRefs = jest.fn();
    await mount(<TodayPlan onRefs={onRefs} onOpen={noop} onWorkspace={noop} />);
    expect(onRefs).toHaveBeenCalledWith(new Set(['card:a0', 'ambient:n0']));
  });

  it('fires onRefs with an empty Set on failure — the caller\'s mount-gate must always eventually unblock', async () => {
    mockFetch.mockRejectedValue(new Error('boom'));
    const onRefs = jest.fn();
    await mount(<TodayPlan onRefs={onRefs} onOpen={noop} onWorkspace={noop} />);
    expect(onRefs).toHaveBeenCalledWith(new Set());
  });
});

describe('TodayPlan — happy path render', () => {
  it('renders the 3 chips and all 7 learner controls for each item', async () => {
    mockFetch.mockResolvedValue({ mode: 'foundation', items: [planItem()], estimated_total_minutes: 15 });
    await mount(<TodayPlan onRefs={noop} onOpen={noop} onWorkspace={noop} />);
    const html = container.innerHTML;
    expect(html).toContain('Builds your RAG skill');
    expect(html).toContain('Working');
    expect(html).toContain('Learn');
    for (const label of ['More like this', 'Less like this', 'Already know this', 'Too easy', 'Too advanced', 'Not interested', 'Test out']) {
      expect(html).toContain(label);
    }
  });

  it('clicking "Already know this" calls submitTodayPlanFeedback with the right ref/action, and disables the controls while in flight', async () => {
    mockFetch.mockResolvedValue({ mode: 'foundation', items: [planItem({ ref: 'card:x1' })], estimated_total_minutes: 15 });
    await mount(<TodayPlan onRefs={noop} onOpen={noop} onWorkspace={noop} />);
    const btn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Already know this') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    await act(async () => { btn.click(); });
    expect(submitTodayPlanFeedback).toHaveBeenCalledWith('card:x1', 'already_know');
  });

  it('clicking "Test out" calls startTestOut with the right ref', async () => {
    mockFetch.mockResolvedValue({ mode: 'foundation', items: [planItem({ ref: 'card:x2' })], estimated_total_minutes: 15 });
    await mount(<TodayPlan onRefs={noop} onOpen={noop} onWorkspace={noop} />);
    const btn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Test out') as HTMLButtonElement;
    await act(async () => { btn.click(); });
    expect(startTestOut).toHaveBeenCalledWith('card:x2');
  });
});
