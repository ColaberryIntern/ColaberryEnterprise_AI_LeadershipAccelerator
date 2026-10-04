import * as fs from 'fs';
import * as path from 'path';
import { METRICS, mayComputeWith, metricsForDomain } from '../metricRegistry';
import { MARKETING_METRICS } from '../metrics/marketingMetrics';
import { JOURNEY_METRICS } from '../metrics/journeyMetrics';

/**
 * The extraction characterization (T605).
 *
 * `metricRegistry.ts` had reached 552 lines - past CLAUDE.md's 500-line hard
 * ceiling - so the rule that an oversize file is SPLIT before anything is added
 * applied before the journey group could go in. The marketing group, 17 of the
 * 24 keys and one contiguous block, moved verbatim to
 * `metrics/marketingMetrics.ts`.
 *
 * A verbatim move is only verbatim if something says so. The fixture beside
 * this file is `Object.entries(METRICS)` read from the COMMITTED registry
 * BEFORE the move (loaded from `git show HEAD:...` by the producer's script, so
 * it is not a copy of the same post-move object claiming to be a baseline), and
 * every assertion below is against that:
 *
 *   - all 24 pre-existing entries are deep-equal to the snapshot;
 *   - their ORDER is unchanged, because `metricsForDomain` and every dashboard
 *     that maps over `Object.values` renders in insertion order;
 *   - the split is the boundary it claims: the 17 marketing keys live in the
 *     marketing module, the other 7 stay in the registry, and nothing was
 *     duplicated into both.
 *
 * The journey group is additive on top and asserted separately, so a change to
 * it can never be mistaken for drift in the 24.
 */

const SNAPSHOT: Record<string, Record<string, unknown>> = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'metricRegistry.snapshot.json'), 'utf8'),
);
const SNAPSHOT_KEYS = Object.keys(SNAPSHOT);

describe('the pre-existing registry survived the extraction unchanged', () => {
  it('the snapshot is the pre-move baseline: 24 keys, 17 of them marketing, no journey key', () => {
    // Non-vacuity for the fixture itself. A snapshot regenerated AFTER the move would carry the
    // journey keys too, and every comparison below would be against the thing it is checking.
    expect(SNAPSHOT_KEYS).toHaveLength(24);
    expect(SNAPSHOT_KEYS.filter((k) => k.startsWith('marketing.'))).toHaveLength(17);
    expect(SNAPSHOT_KEYS.filter((k) => k.startsWith('journey.'))).toEqual([]);
  });

  it('every one of the 24 entries is deep-equal to what it was', () => {
    for (const key of SNAPSHOT_KEYS) {
      expect(METRICS[key]).toEqual(SNAPSHOT[key]);
    }
  });

  it('keeps them in the same ORDER, which dashboards render in', () => {
    expect(Object.keys(METRICS).filter((k) => SNAPSHOT_KEYS.includes(k))).toEqual(SNAPSHOT_KEYS);
  });

  it('the only keys added are journey keys', () => {
    const added = Object.keys(METRICS).filter((k) => !SNAPSHOT_KEYS.includes(k));
    expect(added.every((k) => k.startsWith('journey.'))).toBe(true);
    expect(added.sort()).toEqual(Object.keys(JOURNEY_METRICS).sort());
  });

  it('every trust verdict is the one it was: mayComputeWith() unchanged for all 24', () => {
    for (const key of SNAPSHOT_KEYS) {
      expect(mayComputeWith(key)).toBe(SNAPSHOT[key].status === 'trusted');
    }
  });

  it('the domain filters return exactly what they returned', () => {
    // `metricsForDomain` reads `Object.values(METRICS)`, so the spread's position decides its output.
    for (const domain of ['growth', 'learning', 'revenue', 'people', 'marketing'] as const) {
      const expected = SNAPSHOT_KEYS.filter((k) => SNAPSHOT[k].domain === domain);
      expect(metricsForDomain(domain).map((m) => m.key)).toEqual(expected);
    }
  });
});

describe('the split is the boundary it claims', () => {
  it('the marketing module holds exactly the 17 marketing keys', () => {
    expect(Object.keys(MARKETING_METRICS).sort()).toEqual(SNAPSHOT_KEYS.filter((k) => k.startsWith('marketing.')).sort());
    expect(Object.values(MARKETING_METRICS).every((m) => m.domain === 'marketing')).toBe(true);
  });

  it('the registry file itself no longer declares a marketing key, and is back under the ceiling', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'metricRegistry.ts'), 'utf8');
    expect(source).not.toMatch(/^\s+'marketing\./m);
    expect(source).toContain('...MARKETING_METRICS,');
    expect(source).toContain('...JOURNEY_METRICS,');
    const lines = source.split(/\r?\n/).length - (source.endsWith('\n') ? 1 : 0);
    expect(lines).toBeLessThan(500);
  });

  it('nothing is declared in two places: the three groups are disjoint', () => {
    const registryOwn = SNAPSHOT_KEYS.filter((k) => !k.startsWith('marketing.'));
    const marketing = Object.keys(MARKETING_METRICS);
    const journey = Object.keys(JOURNEY_METRICS);
    expect(marketing.filter((k) => registryOwn.includes(k))).toEqual([]);
    expect(journey.filter((k) => marketing.includes(k) || registryOwn.includes(k))).toEqual([]);
    expect(Object.keys(METRICS)).toHaveLength(registryOwn.length + marketing.length + journey.length);
  });

  it('the extracted module is itself under the ceiling', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'metrics', 'marketingMetrics.ts'), 'utf8');
    const lines = source.split(/\r?\n/).length - (source.endsWith('\n') ? 1 : 0);
    expect(lines).toBeLessThan(500);
  });
});
