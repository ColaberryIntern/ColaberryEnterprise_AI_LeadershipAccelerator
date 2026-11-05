import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import * as fs from 'fs';
import * as path from 'path';
import TodayFeedPlacement from '../TodayFeedPlacement';

/**
 * C110. The rule is rendered for real here; TodayShell itself cannot be mounted in this jest setup
 * (TodayShell.planGate.test.tsx explains why), so its wiring is pinned at source level below.
 */

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

function render(starterFirst: boolean) {
  act(() => {
    root = createRoot(container);
    root.render(
      <TodayFeedPlacement starterFirst={starterFirst} timeline={<div data-x="timeline" />}>
        <div data-x="plan" />
        <div data-x="events" />
      </TodayFeedPlacement>,
    );
  });
  return Array.from(container.querySelectorAll('[data-x]')).map((el) => el.getAttribute('data-x'));
}

describe('TodayFeedPlacement', () => {
  it('puts the timeline first before a first win', () => {
    expect(render(true)).toEqual(['timeline', 'plan', 'events']);
  });

  it('keeps the timeline at the bottom otherwise', () => {
    expect(render(false)).toEqual(['plan', 'events', 'timeline']);
  });

  it('renders exactly one timeline either way, so the scroll anchor stays unique', () => {
    expect(render(true).filter((x) => x === 'timeline')).toHaveLength(1);
    act(() => { root.unmount(); });
    expect(render(false).filter((x) => x === 'timeline')).toHaveLength(1);
  });
});

describe('TodayShell wiring', () => {
  const shell = fs.readFileSync(path.join(__dirname, '..', 'TodayShell.tsx'), 'utf8');

  it('places the timeline through TodayFeedPlacement, keyed on the first-win check', () => {
    expect(shell).toContain('<TodayFeedPlacement starterFirst={firstWinPending}');
    expect(shell).toContain('const firstWinPending = needsFirstWin(schedule);');
  });

  it('renders TodayTimeline in one place only', () => {
    expect(shell.split('<TodayTimeline').length - 1).toBe(1);
  });
});
