import { commitSpanCollector } from '../commitSpan';
import { commitInput } from './fixtureTree';

describe('commit_span collector', () => {
  it('spans first commit to last, inclusive, and carries the commit count', () => {
    const result = commitSpanCollector.collect(commitInput([
      '2026-04-13', '2026-04-20', '2026-05-01', '2026-04-15',
    ]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.output.payload).toEqual({
      shape: 'span',
      startDate: '2026-04-13',
      endDate: '2026-05-01',
      count: 4,
      countLabel: 'commits',
    });
    // 13 April to 1 May inclusive is 19 days, not 18: a span of one day is one
    // day, not zero, and the off-by-one lands on every short project.
    expect(result.output.valueDisplay).toBe('19 days');
  });

  it('treats a single commit as a one-day span rather than declining', () => {
    const result = commitSpanCollector.collect(commitInput(['2026-04-13']));
    if (!result.ok) throw new Error('expected a figure');
    expect(result.output.valueDisplay).toBe('1 day');
    expect(result.output.payload).toMatchObject({ startDate: '2026-04-13', endDate: '2026-04-13' });
  });

  it('says elapsed time is not effort', () => {
    const result = commitSpanCollector.collect(commitInput(['2026-04-13', '2026-05-25']));
    if (!result.ok) throw new Error('expected a figure');
    expect(result.output.limitations[0]).toContain('not effort');
  });

  it('declines when the log has no dated commits', () => {
    expect(commitSpanCollector.collect(commitInput([]))).toMatchObject({ ok: false, reason: 'no_commits' });
  });

  it('ignores a malformed date rather than parsing it into a wrong span', () => {
    const result = commitSpanCollector.collect(commitInput(['not-a-date', '2026-04-13', '2026-04-14']));
    if (!result.ok) throw new Error('expected a figure');
    expect(result.output.payload).toMatchObject({ startDate: '2026-04-13', endDate: '2026-04-14', count: 2 });
  });
});
