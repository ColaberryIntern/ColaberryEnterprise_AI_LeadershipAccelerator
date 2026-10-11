import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import ExplorerScoreTab from '../ExplorerScoreTab';
import type { ExplorerScorePanel } from '../../../../adminOs/personTypes';

/**
 * T212 — Engagement / Intent / Fit on the operator surface.
 *
 * No @testing-library/react in this repo (confirmed: zero real imports, absent
 * from package.json) — same react-dom/client + act convention as
 * shell/__tests__/StatCard.test.tsx.
 *
 * THE TEST THAT MATTERS IS THE ABSENCE ONE. A null panel must not render as
 * 0/0/0: three zeroes are a real score (a person the engine read and found
 * cold), and an unscored person rendered as zeroes is indistinguishable from
 * one, which leads an operator to the opposite action. So the null case
 * asserts on what is NOT on screen, not merely on what is.
 */

let container: HTMLDivElement;
let root: Root;

async function render(node: React.ReactElement) {
  await act(async () => {
    root.render(<MemoryRouter>{node}</MemoryRouter>);
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

const panel: ExplorerScorePanel = {
  asOfDate: '2026-10-01T00:00:00.000Z',
  engagement: 42,
  intent: 17,
  fit: 80,
  primaryState: 'warming',
  overlays: ['returning', 'high_intent'],
};

describe('an unscored person reads as unscored, never as zero', () => {
  it('says so in a sentence when the panel is null', async () => {
    await render(<ExplorerScoreTab panel={null} />);
    expect(container.textContent).toContain('No Explorer score has been recorded');
  });

  it('renders NO digit anywhere when the panel is null', async () => {
    await render(<ExplorerScoreTab panel={null} />);
    // The whole point. If this ever renders a 0 the panel is lying about a
    // person the engine has never looked at.
    expect(container.textContent).not.toMatch(/\d/);
  });

  it('says explicitly that this is not a score of zero', async () => {
    await render(<ExplorerScoreTab panel={null} />);
    expect(container.textContent).toContain('not a score of zero');
  });

  it('behaves the same for undefined as for null', async () => {
    await render(<ExplorerScoreTab panel={undefined} />);
    expect(container.textContent).toContain('No Explorer score has been recorded');
    expect(container.textContent).not.toMatch(/\d/);
  });

  it('does not advertise the word TWC 807.172(d) forbids', async () => {
    await render(<ExplorerScoreTab panel={null} />);
    expect(container.textContent!.toLowerCase()).not.toContain('free');
  });
});

describe('a scored person shows the numbers and how stale they are', () => {
  it('renders engagement, intent and fit from the row', async () => {
    await render(<ExplorerScoreTab panel={panel} />);
    const text = container.textContent!;
    expect(text).toContain('42');
    expect(text).toContain('17');
    expect(text).toContain('80');
  });

  it('renders the primary state', async () => {
    await render(<ExplorerScoreTab panel={panel} />);
    expect(container.textContent).toContain('warming');
  });

  it('shows the snapshot date, so a stale score cannot read as current', async () => {
    await render(<ExplorerScoreTab panel={panel} />);
    // Rendered through the house date formatter, so assert on the year rather
    // than a locale-specific string this test cannot predict.
    expect(container.textContent).toContain('Snapshot of');
    expect(container.textContent).toContain('2026');
  });

  it('renders every overlay', async () => {
    await render(<ExplorerScoreTab panel={panel} />);
    expect(container.textContent).toContain('returning');
    expect(container.textContent).toContain('high_intent');
  });

  it('says there are none rather than showing an empty row', async () => {
    await render(<ExplorerScoreTab panel={{ ...panel, overlays: [] }} />);
    expect(container.textContent).toContain('No overlays on this snapshot');
  });

  it('renders a genuine zero as a zero — absence and cold are different', async () => {
    // The counterpart to the null tests. A person the engine DID read and
    // scored at zero must show zeros; suppressing them would be the same lie
    // in the other direction.
    await render(<ExplorerScoreTab panel={{ ...panel, engagement: 0, intent: 0, fit: 0 }} />);
    expect(container.textContent).not.toContain('No Explorer score has been recorded');
    expect(container.textContent).toContain('0');
  });
});

describe('the panel introduces no permission path of its own', () => {
  it('renders whatever the server sent, consulting no role', async () => {
    // There is no role, section or flag prop to pass: the component's entire
    // input is the panel. The authority stays in
    // personProfileService.mayReadPanel, and T212 adds no second answer.
    await render(<ExplorerScoreTab panel={panel} />);
    expect(container.textContent).toContain('42');
  });
});
