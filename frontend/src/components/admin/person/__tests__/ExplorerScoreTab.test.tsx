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
    //
    // THIS TEST USED `textContent).toContain('0')` AND COULD NOT FAIL. A
    // verifier mutated all three stats to `value={panel.engagement || null}` —
    // which renders "Not recorded" for a real zero, the exact defect — and the
    // test still passed, because the rendered snapshot date "1 Oct 2026"
    // already contains a '0'. The assertion matched the date, not the scores.
    //
    // So it now reads the stat VALUES. `Stat` renders its value in a `.fs-4`
    // node and substitutes the `Unknown` element ("Not recorded") only for
    // null/undefined, so the three leading values are exactly what the panel
    // claims about the person.
    await render(<ExplorerScoreTab panel={{ ...panel, engagement: 0, intent: 0, fit: 0 }} />);

    expect(container.textContent).not.toContain('No Explorer score has been recorded');
    // Not one "Not recorded" anywhere: a scored person has no unknown stat.
    expect(container.textContent).not.toContain('Not recorded');

    const values = Array.from(container.querySelectorAll('.fs-4'))
      .map((n) => (n.textContent ?? '').trim());
    // Engagement, Intent, Fit, then the primary state.
    expect(values.slice(0, 3)).toEqual(['0', '0', '0']);
  });

  it('the CONTROL for that test: a non-zero score still reads its own numbers', async () => {
    // What this control actually does: it pins the SELECTOR AND THE ORDER, so
    // the test above cannot pass because `.fs-4` happened to match different
    // nodes or because Engagement/Intent/Fit were reordered.
    //
    // Its first stated rationale was wrong and a verifier caught it: I wrote
    // that the assertion above "would also pass if `.fs-4` matched nothing and
    // `slice(0, 3)` compared two empty arrays". It would not —
    // `expect([]).toEqual(['0','0','0'])` fails. The control is worth keeping;
    // the reason I gave for it was not true.
    await render(<ExplorerScoreTab panel={panel} />);
    const values = Array.from(container.querySelectorAll('.fs-4'))
      .map((n) => (n.textContent ?? '').trim());
    expect(values.slice(0, 3)).toEqual(['42', '17', '80']);
  });
});

/**
 * DELETED: `describe('the panel introduces no permission path of its own')`.
 *
 * It asserted that a scored panel renders its numbers, which a role gate does
 * not prevent for an allowed role — so a verifier inserted a real
 * `localStorage` role gate into this component and the test passed. It had no
 * power to detect the thing its name promised.
 *
 * Attempt 2 added `adminOs/__tests__/noPermissionPath.test.ts` and described
 * this one as "replaced", but left it in place. A second verifier called that
 * out: anyone grepping the title still landed on a test with no detective
 * power, which is worse than no test, because the name implies coverage. The
 * claim is now true — it is gone, and the real guard lives in that file.
 */
