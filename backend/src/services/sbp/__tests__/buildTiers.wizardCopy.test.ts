/**
 * The wizard promises a depth; the decomposer is told to hit one. This test
 * fails when they drift.
 *
 * The frontend cannot import from `backend/` (CRA refuses imports outside
 * src/), so the tier numbers are necessarily written twice. Rather than accept
 * the drift that always follows, this reads the wizard source as text and
 * checks it still states the ranges TIER_DEPTH actually asks the model for.
 * That makes the duplication safe: change one side, and this goes red.
 */
import fs from 'fs';
import path from 'path';
import { TIER_DEPTH, TIER_ORDER } from '../buildTiers';

const WIZARD = path.resolve(
  __dirname, '..', '..', '..', '..', '..',
  'frontend', 'src', 'pages', 'portal', 'projects', 'ProjectWizard.tsx',
);

describe('wizard tier copy matches the generation depth', () => {
  let source: string;

  beforeAll(() => {
    // If this throws, the path is wrong — a silent skip would defeat the point.
    source = fs.readFileSync(WIZARD, 'utf8');
  });

  it('finds the wizard where it expects to', () => {
    expect(source.length).toBeGreaterThan(0);
    expect(source).toContain('const SIZES');
  });

  it('states each tier\'s real requirement range', () => {
    TIER_ORDER.forEach((tier) => {
      const [lo, hi] = TIER_DEPTH[tier].requirements;
      expect(source).toContain(`${lo}-${hi} requirements`);
    });
  });

  it('states each tier\'s real release count', () => {
    TIER_ORDER.forEach((tier) => {
      expect(source).toContain(`${TIER_DEPTH[tier].releases} releases`);
    });
  });

  it('no longer advertises the fabricated durations', () => {
    // These had no telemetry behind them. FR-002 wants a measured p50; until
    // that exists the wizard states depth instead of inventing minutes.
    ['~5 min', '~13 min', '~21 min'].forEach((fiction) => {
      expect(source).not.toContain(fiction);
    });
  });
});
