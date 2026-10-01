import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import OverviewTab from '../OverviewTab';
import { expectNoA11yViolations } from '../../../__fixtures__/a11yRules';
import type { JourneyHealth, Readiness } from '../../../services/growthJourneyApi';

/**
 * Overview: the readiness runbook and the health snapshot (Phase 6, T613 attempt 2).
 *
 * THIS SUITE DID NOT EXIST AND SHOULD HAVE. T613's verifier wrote two mutants into
 * this file and both SURVIVED all 43 cells, because every cell I had written lived in
 * a different file. "Six mutants, six killed, no survivors" was true and said nothing
 * about the one delivered module with no suite at all. The two it found are the first
 * two cells below, and they are not cosmetic:
 *
 *   - the capped-read FLOOR warning made unreachable, so a capped count reads as a
 *     total. This file's own header calls that out: "an operator reading 500 as '500'
 *     when it means 'at least 500' would draw the wrong conclusion."
 *   - `ready: null` rendering as BLOCKED, which invents a blocker the backend did not
 *     report. The header calls that out too.
 *
 * Both were reachable by anyone editing this file and nothing would have gone red.
 */

/*
 * 30s, not jest's 5000ms default - the same reason the handoff suite carries this
 * line. In the full 290-suite run this suite took 76s of wall clock and its first
 * cell died on the default budget while asserting against two resolved mocks.
 * NOTHING BELOW ASSERTS LESS BECAUSE OF THIS LINE. It buys time, not leniency.
 */
jest.setTimeout(30000);

jest.mock('../../../services/growthJourneyApi', () => ({
  getReadiness: jest.fn(),
  getHealth: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require('../../../services/growthJourneyApi') as {
  getReadiness: jest.Mock;
  getHealth: jest.Mock;
};

const readiness = (over: Partial<Readiness> = {}): Readiness => ({
  items: [
    { key: 'master_flag', ready: false, reason: 'off', next_move: 'set GROWTH_JOURNEY_ENABLED' },
    { key: 'ledger_indexes', ready: true, reason: 'all three present', next_move: 'nothing' },
    { key: 'migration_applied', ready: null, reason: 'not knowable from here', next_move: 'run the migration and re-check' },
  ],
  score: { ready: 1, known: 2, unknown: 1, pct: 50 },
  next_move: 'master_flag',
  as_of: '2026-10-01T08:00:00.000Z',
  ...over,
});

const health = (over: Partial<JourneyHealth> = {}): JourneyHealth => ({
  receipts: [{ status: 'pending_review', count: 4, oldest_hours: 12 }],
  stuck_pending_review: { count: 1, over_hours: 72 },
  held: { total: 2, by_reason: { quiet_hours: 2 } },
  refused: { total: 0, by_reason: {}, capped: false },
  crons: [{ agent_name: 'journey_nightly', state: 'enabled', last_run_at: '2026-10-01T04:00:00.000Z', minutes_since: 240 }],
  controls: { pause: 0, rollout: 1 },
  journey_hold_rows: 0,
  ledger_read: 'ok',
  window_hours: 24,
  as_of: '2026-10-01T08:00:00.000Z',
  truncated: [],
  ...over,
});

let container: HTMLDivElement;
let root: Root;

async function render() {
  await act(async () => { root.render(<OverviewTab />); });
}

const text = () => (container.textContent ?? '').replace(/\s+/g, ' ');

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  // Implementations here, never in the factory: react-scripts sets resetMocks: true.
  api.getReadiness.mockResolvedValue(readiness());
  api.getHealth.mockResolvedValue(health());
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

describe('a capped read is reported as a FLOOR, not a total', () => {
  it('says so loudly when any read hit its cap', async () => {
    // The first surviving mutant: this warning made unreachable. A capped count then
    // reads as a complete one, and an operator acts on a number that does not exist.
    api.getHealth.mockResolvedValue(health({ truncated: [{ read: 'ledger_events', cap: 10000 }] }));
    await render();
    expect(text()).toContain('floors, not totals');
    expect(text()).toContain('ledger_events');
    expect(text()).toContain('10000');
  });

  it('and says nothing when nothing was capped - the normal answer', async () => {
    await render();
    expect(text()).not.toContain('floors, not totals');
  });

  it('reports a capped REFUSED count as a floor in its own line too', async () => {
    api.getHealth.mockResolvedValue(health({ refused: { total: 500, by_reason: { no_consent: 500 }, capped: true } }));
    await render();
    expect(text()).toContain('capped, so this is a floor');
  });
});

describe('`ready: null` is a third answer, never a blocker', () => {
  it('renders as unknown, not as blocked', async () => {
    // The second surviving mutant: `if (ready === null)` removed, so an unknowable
    // check rendered as BLOCKED - inventing a blocker the backend never reported.
    await render();
    const rows = Array.from(container.querySelectorAll('tbody tr'));
    const unknownRow = rows.find((r) => (r.textContent ?? '').includes('migration_applied'));
    expect(unknownRow?.textContent).toContain('unknown');
    expect(unknownRow?.textContent).not.toContain('blocked');
  });

  it('is counted in neither the numerator nor the denominator', async () => {
    await render();
    // 1 of 2 KNOWN, with the third held separately - not 1 of 3.
    expect(text()).toContain('1 of 2 known checks ready');
    expect(text()).toContain('1 unknown');
  });

  it('a blocked check still renders as blocked, so the three are distinguishable', async () => {
    await render();
    const rows = Array.from(container.querySelectorAll('tbody tr'));
    const blocked = rows.find((r) => (r.textContent ?? '').includes('master_flag'));
    const ready = rows.find((r) => (r.textContent ?? '').includes('ledger_indexes'));
    expect(blocked?.textContent).toContain('blocked');
    expect(ready?.textContent).toContain('ready');
  });
});

describe('the all-ready branch - unreachable by every fixture until now', () => {
  // T613's attempt-2 verifier found three survivors in this file; two live here. No
  // fixture had zero blocked AND zero unknown, so lines 99-101 were never rendered by
  // any cell - including the one line attempt 2 changed (a hardcoded "seventeen"
  // replaced by `data.items.length`), which was therefore backed by nothing.
  const allReady = (): Readiness => ({
    items: [
      { key: 'master_flag', ready: true, reason: 'on', next_move: 'nothing' },
      { key: 'ledger_indexes', ready: true, reason: 'all three present', next_move: 'nothing' },
      { key: 'memberships', ready: true, reason: 'seeded', next_move: 'nothing' },
    ],
    score: { ready: 3, known: 3, unknown: 0, pct: 100 },
    next_move: null,
    as_of: '2026-10-01T08:00:00.000Z',
  });

  it('counts the checks rather than naming a number', async () => {
    // Kills the hardcoded-figure mutant: revert `{data.items.length}` to a literal and
    // this fails. Three items, so the sentence must say three - not seventeen.
    api.getReadiness.mockResolvedValue(allReady());
    await render();
    expect(text()).toContain('All 3 checks are ready');
    expect(text()).not.toContain('seventeen');
  });

  it('does NOT claim all-ready while any check is unknowable', async () => {
    // THE LIVE BUG this cell exists for: drop the `unknown.length === 0` guard and the
    // page announces "All N checks are ready" with a check it could not evaluate. That
    // is a false all-clear on the screen whose job is to say whether this is safe to
    // switch on.
    const withUnknown = allReady();
    withUnknown.items = [
      ...withUnknown.items,
      { key: 'migration_applied', ready: null, reason: 'not knowable from here', next_move: 'run it' },
    ];
    withUnknown.score = { ready: 3, known: 3, unknown: 1, pct: 100 };
    api.getReadiness.mockResolvedValue(withUnknown);
    await render();
    expect(text()).not.toContain('checks are ready');
    // and it says what it cannot answer instead of going quiet
    expect(text()).toContain('cannot be answered from here');
  });
});

describe('the runbook reads as a runbook', () => {
  it('names the next move, and every row carries what was found AND what would fix it', async () => {
    await render();
    expect(text()).toContain('Next move');
    expect(text()).toContain('master_flag');
    expect(text()).toContain('set GROWTH_JOURNEY_ENABLED');
    // Populated even on a READY row, which is what makes the list a runbook rather
    // than a pass/fail tally.
    expect(text()).toContain('all three present');
  });

  it('says plainly when nothing is blocked rather than leaving a blank', async () => {
    api.getReadiness.mockResolvedValue(readiness({ next_move: null }));
    await render();
    expect(text()).toContain('Nothing is blocked');
  });

  it('carries the instant it was computed - a count without freshness is not an answer', async () => {
    await render();
    expect(text()).toContain('2026-10-01T08:00:00.000Z');
  });
});

describe('health', () => {
  it('reports receipts, held, refused and crons', async () => {
    await render();
    expect(text()).toContain('pending_review');
    expect(text()).toContain('journey_nightly');
    expect(text()).toContain('24h window');
    expect(text()).toContain('ledger read ok');
    // The cell was NAMED for held and refused and asserted neither, so replacing
    // either total with a literal 0 survived. `Held: 2` closes that half.
    //
    // `Refused: 0` does NOT, and attempt 3 claimed it did. This fixture's
    // `refused.total` IS 0, so asserting the string "Refused: 0" is asserting a
    // constant: replace `{data.refused.total}` with `{0}` and this still passes.
    // Same for `journey_hold_rows`, also 0 here. Both bindings are pinned by the
    // next cell instead, with values that cannot be confused with a literal.
    // Keeping these two here is still worth something - zero must render AS zero
    // rather than as a blank - which is all they are asserting.
    expect(text()).toContain('Held: 2');
    expect(text()).toContain('quiet_hours 2');
    expect(text()).toContain('Refused: 0');
    expect(text()).toContain('0 hold rows');
    expect(text()).toContain('1 awaiting review for over 72h');
    expect(text()).toContain('oldest 12h');
    expect(text()).toContain('240m ago');
  });

  it('reads every total off the payload rather than printing a literal', async () => {
    // The cell above cannot catch a hardcoded total, because the numbers it checks
    // are 0 and a literal 0 is indistinguishable from the real binding. These
    // values are deliberately distinctive and appear nowhere else in the render,
    // so each one can only come from the payload it was put in.
    api.getHealth.mockResolvedValue(health({
      held: { total: 7, by_reason: { quiet_hours: 7 } },
      refused: { total: 13, by_reason: { no_consent: 13 }, capped: false },
      journey_hold_rows: 5,
      stuck_pending_review: { count: 3, over_hours: 48 },
    }));
    await render();
    expect(text()).toContain('Held: 7');
    expect(text()).toContain('Refused: 13');
    expect(text()).toContain('5 hold rows');
    expect(text()).toContain('3 awaiting review for over 48h');
    // and a non-capped refused count must NOT carry the floor caveat
    expect(text()).not.toContain('capped, so this is a floor');
  });

  it('says an empty receipt list is EXPECTED while the system is dark', async () => {
    // Zero is the correct answer today, and it must not read as a fault.
    api.getHealth.mockResolvedValue(health({ receipts: [] }));
    await render();
    expect(text()).toContain('Expected while the system is dark');
  });
});

describe('the two reads fail independently', () => {
  it('a failed readiness read does not hide the health panel', async () => {
    // They answer different questions; collapsing them would lose one to the other's
    // outage, which is the whole reason they are two panels.
    api.getReadiness.mockRejectedValue(new Error('readiness exploded'));
    await render();
    expect(text()).toContain('readiness exploded');
    expect(text()).toContain('24h window');
  });

  it('a failed health read does not hide the readiness runbook', async () => {
    api.getHealth.mockRejectedValue(new Error('health exploded'));
    await render();
    expect(text()).toContain('health exploded');
    expect(text()).toContain('Launch readiness');
  });
});

describe('the mechanical accessibility rules', () => {
  it('pass on the loaded tab', async () => {
    await render();
    // No h1 here on purpose: a tab is a fragment, and the page owns the h1.
    expectNoA11yViolations(container);
  });

  it('pass with the floor warning on screen', async () => {
    api.getHealth.mockResolvedValue(health({ truncated: [{ read: 'ledger_events', cap: 10000 }] }));
    await render();
    expectNoA11yViolations(container);
  });
});
