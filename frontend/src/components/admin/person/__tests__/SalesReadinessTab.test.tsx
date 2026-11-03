import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import SalesReadinessTab from '../SalesReadinessTab';
import type {
  SalesReadinessScore, SalesReadinessFactor, SalesReadinessFreshness,
} from '../../../../adminOs/personTypes';

/**
 * M26 - the panel had NO test at all.
 *
 * The component shipped in PR #3273 and its docblock states the rule it exists to
 * uphold: "those two lead to opposite actions - go and find out, versus stop
 * chasing - so they must never render alike". Nothing asserted it. The behaviour
 * was correct and unproven, which means the next regression would have been as
 * invisible as the one M24.1 to M24.3 removed from the evidence underneath it.
 *
 * M26's own ticket names this as the thing that would make the work misleading:
 * "Rendering an absent score as zero, which is the exact failure M10 fixed for
 * the Explorer score."
 *
 * No @testing-library/react in this repo - same react-dom/client + act harness as
 * `ExplorerScoreTab.test.tsx`.
 *
 * THE TRAP THAT TEST FILE RECORDS, AVOIDED HERE. Its earlier version asserted
 * `textContent).toContain('0')` and could not fail, because the rendered date
 * "1 Oct 2026" already contains a '0'. So nothing below substring-matches a digit
 * against the whole panel: every numeric assertion reads a specific node.
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

/** A factor that was scored and earned points. */
const SCORED: SalesReadinessFactor = {
  key: 'enrolment_started', label: 'Started an enrolment', band: 'commitment',
  evidenceGroup: 'enrollments', state: 'scored', points: 18, max: 25, reason: null,
};

/** A factor we looked at and which contributed nothing. A real measurement. */
const REAL_ZERO: SalesReadinessFactor = {
  key: 'passive_browsing', label: 'Browsing depth', band: 'passive',
  evidenceGroup: 'engagement', state: 'scored', points: 0, max: 10, reason: null,
};

/** A factor there was no evidence to score. NOT a zero. */
const ABSENT: SalesReadinessFactor = {
  key: 'human_reply', label: 'Replied to a human', band: 'context',
  evidenceGroup: 'appointments', state: 'absent', points: null, max: 15,
  reason: 'no appointment record was readable',
};

function score(over: Partial<SalesReadinessScore> = {}): SalesReadinessScore {
  return {
    rulesetVersion: 'srs-v1',
    computedAt: '2026-10-01T00:00:00.000Z',
    total: 18,
    scoreableMax: 35,
    rulesetMax: 50,
    coverage: 2 / 3,
    factors: [SCORED, REAL_ZERO, ABSENT],
    frictionFlag: false,
    oldestEvidenceAt: '2026-09-28T00:00:00.000Z',
    ...over,
  };
}

const FRESH: SalesReadinessFreshness = {
  state: 'fresh', effectiveAsOf: '2026-10-01T00:00:00.000Z', ageHours: 2,
  boundBy: 'computation', label: 'computed 2 hours ago', clockSkew: false,
  rulesetVersion: 'srs-v1',
};

/** The points cell of every factor row, in render order. */
function pointsCells(): string[] {
  return Array.from(container.querySelectorAll('tbody tr'))
    .map((tr) => (tr.querySelector('td:last-child')?.textContent ?? '').trim())
    .filter((t) => t.length > 0);
}

describe('an unscored person reads as unscored, never as zero', () => {
  it('says so in a sentence when there is no score at all', async () => {
    await render(<SalesReadinessTab score={undefined} freshness={undefined} />);
    expect(container.textContent).toContain('This is not a score of zero');
  });

  it('renders no factor table at all, so no digit can be mistaken for a score', async () => {
    await render(<SalesReadinessTab score={undefined} freshness={undefined} />);
    // Asserting on structure rather than on text: a table with no rows would
    // still satisfy a text assertion while rendering column headings that imply
    // a score exists.
    expect(container.querySelector('table')).toBeNull();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(0);
  });

  it('CONTROL: the same harness DOES render a table when a score exists', async () => {
    // Without this, the two assertions above would also pass if the component
    // never rendered a table under any input.
    await render(<SalesReadinessTab score={score()} freshness={FRESH} />);
    expect(container.querySelector('table')).not.toBeNull();
    expect(container.querySelectorAll('tbody tr').length).toBeGreaterThan(0);
  });
});

describe('a real zero and an absence never render alike', () => {
  it('shows the measured zero as 0 out of its max', async () => {
    await render(<SalesReadinessTab score={score()} freshness={FRESH} />);
    // Read the cell, not the panel text. "0 / 10" must be present as a VALUE.
    expect(pointsCells()).toContain('0 / 10');
  });

  it('shows the absent factor as "No evidence", with no number', async () => {
    await render(<SalesReadinessTab score={score()} freshness={FRESH} />);
    const cells = pointsCells();
    expect(cells).toContain('No evidence');
    // The absent factor's max is 15 and must appear nowhere as a score.
    expect(cells.some((c) => c.includes('/ 15'))).toBe(false);
  });

  it('gives the absent factor a reason instead of a bar', async () => {
    await render(<SalesReadinessTab score={score()} freshness={FRESH} />);
    expect(container.textContent).toContain('no appointment record was readable');
  });

  it('THE LOAD-BEARING ONE: both appear in one score and are distinguishable', async () => {
    // This is the assertion the whole file exists for. A regression that
    // rendered absent as 0 would make these two cells identical, and every
    // other test here could still pass.
    await render(<SalesReadinessTab score={score()} freshness={FRESH} />);
    const cells = pointsCells();
    expect(cells).toContain('0 / 10');
    expect(cells).toContain('No evidence');
    expect(cells.filter((c) => c === 'No evidence')).toHaveLength(1);
  });

  it('separates them with a divider that states the rule', async () => {
    await render(<SalesReadinessTab score={score()} freshness={FRESH} />);
    expect(container.textContent).toContain('not scored as zero');
  });

  it('omits that divider when every factor was scored', async () => {
    await render(
      <SalesReadinessTab score={score({ factors: [SCORED, REAL_ZERO] })} freshness={FRESH} />,
    );
    expect(container.textContent).not.toContain('not scored as zero');
    // ...and the measured zero is still a zero without the divider present.
    expect(pointsCells()).toContain('0 / 10');
  });

  it('gives a measured zero a bar of its own rather than suppressing the row', async () => {
    await render(<SalesReadinessTab score={score()} freshness={FRESH} />);
    // `bg-secondary` is the zero bar; `bg-success` is a scoring one. A zero that
    // rendered no bar would be visually indistinguishable from an absence.
    expect(container.querySelectorAll('.progress-bar.bg-secondary')).toHaveLength(1);
    expect(container.querySelectorAll('.progress-bar.bg-success')).toHaveLength(1);
  });
});

describe('the total is shown against what THIS person could have scored', () => {
  it('reads total over scoreableMax, not over rulesetMax', async () => {
    await render(<SalesReadinessTab score={score()} freshness={FRESH} />);
    const stats = Array.from(container.querySelectorAll('.fs-4'))
      .map((n) => (n.textContent ?? '').trim());
    // 35 is scoreableMax; 50 is rulesetMax. Showing it against 50 would make a
    // well-evidenced 18 and a barely-known 18 look identical.
    expect(stats[0]).toBe('18 / 35');
    expect(stats[0]).not.toContain('50');
  });

  it('CONTROL: a different scoreableMax moves that number, so it is read not hardcoded', async () => {
    await render(
      <SalesReadinessTab score={score({ total: 7, scoreableMax: 12 })} freshness={FRESH} />,
    );
    const stats = Array.from(container.querySelectorAll('.fs-4'))
      .map((n) => (n.textContent ?? '').trim());
    expect(stats[0]).toBe('7 / 12');
  });

  it('reports coverage as a percentage of factors that had evidence', async () => {
    await render(<SalesReadinessTab score={score()} freshness={FRESH} />);
    const stats = Array.from(container.querySelectorAll('.fs-4'))
      .map((n) => (n.textContent ?? '').trim());
    expect(stats[1]).toBe('67%');
  });
});

describe('freshness is reported, and an unknown age is not a zero either', () => {
  it('shows the age in hours when it is known', async () => {
    await render(<SalesReadinessTab score={score()} freshness={FRESH} />);
    const stats = Array.from(container.querySelectorAll('.fs-4'))
      .map((n) => (n.textContent ?? '').trim());
    expect(stats[3]).toBe('2h');
  });

  it('says Unknown rather than 0h when there is no freshness', async () => {
    await render(<SalesReadinessTab score={score()} freshness={undefined} />);
    const stats = Array.from(container.querySelectorAll('.fs-4'))
      .map((n) => (n.textContent ?? '').trim());
    expect(stats[3]).toBe('Unknown');
    expect(stats[3]).not.toBe('0h');
  });

  it('surfaces a stale warning, carrying the label the server wrote', async () => {
    await render(<SalesReadinessTab score={score()} freshness={{
      ...FRESH, state: 'stale', label: 'the evidence under this score is 40 days old',
    }} />);
    expect(container.textContent).toContain('the evidence under this score is 40 days old');
  });

  it('shows no banner at all when the score is fresh, so the banner means something', async () => {
    // Split from the test above rather than unmounting and re-rendering inside
    // one: re-creating the root mid-test left the afterEach unmounting an
    // already-unmounted root, which React reported as an update not wrapped in
    // act(). Two tests have no such seam, and asserting the ABSENCE of the
    // element is stronger than asserting the absence of its text.
    await render(<SalesReadinessTab score={score()} freshness={FRESH} />);
    expect(container.querySelector('.alert')).toBeNull();
  });
});

describe('the panel says the weights are provisional', () => {
  it('states that the ordering is meaningful and the number is not a probability', async () => {
    // M25.1 measured that 105 of 172 points sat in factors identical or zero for
    // everyone. A rep reading "61" as a percentage chance would be wrong, and the
    // panel is the only place that caveat reaches them.
    await render(<SalesReadinessTab score={score()} freshness={FRESH} />);
    expect(container.textContent).toContain('provisional');
    expect(container.textContent).toContain('not a probability');
  });
});
