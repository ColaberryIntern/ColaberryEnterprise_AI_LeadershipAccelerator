import { Blockers } from '../caseStudyPublishRules';
import { hasPlainAnswers, isComparative, ruleHeroMetrics } from '../caseStudyPublishHeroRules';
import type { CaseStudyMetricEntry } from '../../../types/caseStudy';

/**
 * What may stand in the hero row.
 *
 * The fixtures are the real figures that were live on 2026-09-12, because the
 * rule exists for them specifically: fourteen published counts of our own
 * artifacts, three of which were deficiencies wearing an achievement's slot.
 */

const metric = (over: Partial<CaseStudyMetricEntry> = {}): CaseStudyMetricEntry => ({
  key: 'k', label: 'A figure', valueDisplay: '8 agents', metricType: 'technical',
  verification: { class: 'verified', method: 'repo' },
  isHeadline: true, publishable: true,
  ...over,
} as CaseStudyMetricEntry);

const plain = { counts: 'what it counts', from: 'where it came from', cannotShow: 'what it does not tell you' };

const run = (metrics: CaseStudyMetricEntry[], path = 'heroMetrics') => {
  const b = new Blockers();
  ruleHeroMetrics(metrics.map((m, i) => ({ metric: m, path: `${path}[${i}]` })), b);
  return b.all();
};
const codes = (bs: readonly { code: string }[]) => bs.map((x) => x.code);

describe('the figures that were actually live', () => {
  it.each([
    ['6 phases', 'Phases in the deep-analysis pipeline'],
    ['8 agents', 'Intelligence agents run against each repository'],
    ['45 endpoints', 'HTTP endpoints exposed by the API'],
    ['16 migrations', 'Forward schema migrations, each reversible'],
    ['14 decision records', 'Architectural decisions written down as they were made'],
    ['10 skills · verified, not self-reported', 'AI architecture competencies'],
  ])('refuses the bare count %s from the hero', (valueDisplay, label) => {
    const bs = run([metric({ valueDisplay, label })]);
    expect(codes(bs)).toEqual(['headline_metric_is_a_bare_count']);
    expect(bs[0].message).toContain(label);
    expect(bs[0].message).toContain(valueDisplay);
    expect(bs[0].remedy).toMatch(/denominator|before and after|baseline/);
  });

  it('says where a count IS welcome, so the remedy is not just "delete it"', () => {
    const bs = run([metric()]);
    expect(bs[0].remedy).toMatch(/measurement section/);
  });

  it('leaves the same count alone outside the hero', () => {
    expect(run([metric({ isHeadline: false })], 'measurement.metrics')).toEqual([]);
  });

  it('ignores a figure nobody promoted, because it is not on the page', () => {
    expect(run([metric({ publishable: false })])).toEqual([]);
  });
});

describe('what counts as a comparison', () => {
  it('a ratio, a share and a series compare structurally', () => {
    for (const shape of ['ratio', 'share', 'series'] as const) {
      expect(isComparative(metric({ shape, plain }))).toBe(true);
    }
  });

  it('a span compares only when it has both ends', () => {
    expect(isComparative(metric({ shape: 'span', payload: { shape: 'span', from: 1, to: 9 } as any }))).toBe(true);
    expect(isComparative(metric({ shape: 'span', payload: { shape: 'span', from: 1 } as any }))).toBe(false);
  });

  it('a bare count never compares, however it is dressed', () => {
    expect(isComparative(metric({ shape: 'count', payload: { shape: 'count', value: 8 } as any }))).toBe(false);
    expect(isComparative(metric({ verification: { class: 'verified', method: 'repo' } as any }))).toBe(false);
  });

  it('a stated baseline rescues a legacy metric that predates shapes', () => {
    // The author wrote down what it was before. That is the work, whatever the
    // payload says, and a record written before shapes existed can still pass.
    expect(isComparative(metric({ measurement: { baseline: '3 hours by hand', limitations: [] } }))).toBe(true);
    expect(isComparative(metric({ measurement: { baseline: '   ', limitations: [] } }))).toBe(false);
  });
});

describe('a comparative headline still owes the reader three answers', () => {
  it('refuses one with no plain answers at all', () => {
    const bs = run([metric({ shape: 'ratio', valueDisplay: '1 of 142 files' })]);
    expect(codes(bs)).toEqual(['headline_metric_missing_plain_answers']);
    expect(bs[0].remedy).toMatch(/what this does not tell you/);
  });

  it('refuses one missing any single answer', () => {
    for (const drop of ['counts', 'from', 'cannotShow'] as const) {
      const partial = { ...plain, [drop]: '' };
      expect(codes(run([metric({ shape: 'ratio', plain: partial })]))).toEqual(['headline_metric_missing_plain_answers']);
    }
  });

  it('allows a comparative headline that carries all three', () => {
    expect(run([metric({ shape: 'ratio', plain })])).toEqual([]);
  });

  it('reports only the first fault per figure, so one bad card is one blocker', () => {
    // A bare count with no plain answers fails both tests; the author is told
    // the load-bearing one, not handed a pile.
    expect(codes(run([metric({})]))).toEqual(['headline_metric_is_a_bare_count']);
  });
});

describe('hasPlainAnswers', () => {
  it('needs all three, non-empty', () => {
    expect(hasPlainAnswers(metric({ plain }))).toBe(true);
    expect(hasPlainAnswers(metric({}))).toBe(false);
    expect(hasPlainAnswers(metric({ plain: { ...plain, cannotShow: '  ' } }))).toBe(false);
  });
});

describe('an empty hero is allowed', () => {
  it('no headline figures is not a blocker: silence beats a filler count', () => {
    expect(run([])).toEqual([]);
  });
});
