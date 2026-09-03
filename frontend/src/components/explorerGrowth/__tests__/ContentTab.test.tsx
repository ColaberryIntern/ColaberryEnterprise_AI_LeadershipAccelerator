import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Matrix } from '../ContentTab';
import { DistributionBar, Trend } from '../OverviewTab';
import type { ExplorerContentHealth, ExplorerDistribution } from '../../../services/explorerGrowthApi';

/**
 * The Content matrix, and the Overview panels.
 *
 * ── WHAT THE MATRIX IS FOR ──────────────────────────────────────────────────
 *
 * "646 assets" reads healthy. The matrix is what says every learning-stage
 * asset is `full_access` and the only free-preview content is 23 activation
 * assets — so a free-tier learner past week 0 has nothing, by construction.
 *
 * The numbers below are production values from 2026-09-02.
 */

const html = (el: React.ReactElement) => renderToStaticMarkup(el);

/** The real cross-tab, measured live. */
const MATRIX: ExplorerContentHealth['matrix'] = [
  { stage: 'evergreen', audience: 'full_access', count: 299 },
  { stage: 'learning', audience: 'full_access', count: 206 },
  { stage: 'activation', audience: 'full_access', count: 47 },
  { stage: 'activation', audience: 'free_preview', count: 23 },
];

describe('the matrix makes the structural gap visible', () => {
  it('renders a zero for learning + free_preview — the cell that explains everything', () => {
    // There is no row for (learning, free_preview) in the data at all. The
    // matrix must render it as an explicit 0 rather than omitting the cell,
    // because a missing cell reads as "not applicable" while a 0 reads as
    // "nothing here" — and the second is the true and useful statement.
    const markup = html(<Matrix matrix={MATRIX} />);
    expect(markup).toContain('table-warning');
    expect(markup).toContain('No asset a learner in this stage and tier could receive');
  });

  it('shows every stage in journey order, not alphabetical', () => {
    // activation → learning → evergreen. Alphabetically that would be
    // activation, evergreen, learning, which reads as nonsense for a progression.
    const markup = html(<Matrix matrix={MATRIX} />);
    const order = ['activation', 'learning', 'evergreen'].map((s) => markup.indexOf(`>${s}<`));
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
  });

  it('renders every real count', () => {
    const markup = html(<Matrix matrix={MATRIX} />);
    for (const n of ['299', '206', '47', '23']) expect(markup).toContain(n);
  });

  it('warns against summing the cells', () => {
    // 23 assets carry both audience tags, so the columns total 575 against 552
    // real assets. A consumer who adds the cells up overcounts by exactly those
    // 23 — and would report more content than exists.
    const markup = html(<Matrix matrix={MATRIX} />);
    expect(markup).toContain('Do not add the cells up');
  });

  it('does not invent stages the data does not contain', () => {
    const markup = html(<Matrix matrix={[{ stage: 'activation', audience: 'free_preview', count: 5 }]} />);
    expect(markup).toContain('activation');
    expect(markup).not.toContain('>learning<');
    expect(markup).not.toContain('>evergreen<');
  });
});

describe('the distribution bar', () => {
  const COUNTS: ExplorerDistribution['today'] = [
    { primary_state: 'ACTIVATING', count: 131 },
    { primary_state: 'CONVERTED', count: 10 },
    { primary_state: 'ACTIVE_LEARNER', count: 7 },
    { primary_state: 'ENGAGED_LEARNER', count: 3 },
    { primary_state: 'CONNECTED_TO_COMMUNITY', count: 2 },
  ];

  it('renders each state with its count and share', () => {
    const markup = html(<DistributionBar counts={COUNTS} />);
    expect(markup).toContain('131');
    // 131 of 153 = 85.6%
    expect(markup).toContain('85.6%');
  });

  it('orders states by journey position, not by size', () => {
    // ACTIVATING before ACTIVE_LEARNER before CONVERTED. Sorting by count would
    // put CONVERTED second and make the bar read as a ranking rather than a path.
    //
    // Positions are compared WITHIN the bar's title attributes only. The first
    // version of this test mixed regions — the bar renders raw state names while
    // the table renders them with underscores replaced, so `CONVERTED` matched
    // the bar and `ACTIVE LEARNER` matched only the table, and the comparison was
    // between two different renderings. The component was ordering correctly; the
    // assertion was measuring the wrong thing.
    const markup = html(<DistributionBar counts={COUNTS} />);
    const at = (s: string) => markup.indexOf(`title="${s}:`);
    expect(at('ACTIVATING')).toBeGreaterThan(-1);
    expect(at('ACTIVATING')).toBeLessThan(at('ACTIVE_LEARNER'));
    expect(at('ACTIVE_LEARNER')).toBeLessThan(at('ENGAGED_LEARNER'));
    expect(at('ENGAGED_LEARNER')).toBeLessThan(at('CONVERTED'));
  });

  it('uses design tokens, never a literal hex', () => {
    // tokens.css is the source of truth, and the summary table in the baseline-ui
    // skill has been wrong before — a hardcoded hex would render in a palette
    // this product does not use.
    const markup = html(<DistributionBar counts={COUNTS} />);
    expect(markup).toMatch(/var\(--/);
    expect(markup).not.toMatch(/#[0-9a-fA-F]{6}/);
  });

  it('renders nothing rather than dividing by zero on an empty population', () => {
    expect(html(<DistributionBar counts={[]} />)).toBe('');
  });
});

describe('the trend', () => {
  const TREND: ExplorerDistribution['trend'] = [
    { as_of_date: '2026-08-31', counts: [{ primary_state: 'ACTIVATING', count: 134 }] },
    {
      as_of_date: '2026-09-02',
      counts: [
        { primary_state: 'ACTIVATING', count: 131 },
        { primary_state: 'CONVERTED', count: 10 },
      ],
    },
  ];

  it('renders a row per date', () => {
    const markup = html(<Trend trend={TREND} />);
    expect(markup).toContain('2026-08-31');
    expect(markup).toContain('2026-09-02');
    expect(markup).toContain('134');
  });

  it('renders a dash, not a zero, where a state had no snapshot row', () => {
    // CONVERTED has no row on 08-31. Rendering 0 would assert that zero learners
    // were converted that day, which the data does not say — the row simply is
    // not there.
    const markup = html(<Trend trend={TREND} />);
    expect(markup).toContain('—');
  });

  it('says the history is too short rather than drawing an empty table', () => {
    const markup = html(<Trend trend={[]} />);
    expect(markup).toContain('needs at least two nightly runs');
  });
});
