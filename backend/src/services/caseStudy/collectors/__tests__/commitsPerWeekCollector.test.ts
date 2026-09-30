import { commitsPerWeekCollector } from '../commitsPerWeek';
import { commitInput } from './fixtureTree';

describe('commits_per_week collector', () => {
  it('buckets by UTC week beginning Monday', () => {
    // 2026-04-13 is a Monday; 2026-04-19 is the Sunday that closes that week.
    const result = commitsPerWeekCollector.collect(commitInput([
      '2026-04-13', '2026-04-15', '2026-04-19', '2026-04-20',
    ]));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.output.payload).toEqual({
      shape: 'series',
      unit: 'commits',
      points: [
        { date: '2026-04-13', value: 3 },
        { date: '2026-04-20', value: 1 },
      ],
    });
  });

  it('includes empty weeks at zero, so a gap in the work looks like a gap', () => {
    // The single most misleading thing this collector could do is draw a busy
    // flat line across three quiet weeks by simply omitting them.
    const result = commitsPerWeekCollector.collect(commitInput(['2026-04-13', '2026-05-11']));
    if (!result.ok) throw new Error('expected a figure');
    const payload = result.output.payload;
    if (payload.shape !== 'series') throw new Error('expected a series');
    expect(payload.points.map((p) => p.value)).toEqual([1, 0, 0, 0, 1]);
    expect(payload.points[0].date).toBe('2026-04-13');
    expect(payload.points[4].date).toBe('2026-05-11');
  });

  it('reports the busiest week, which a smooth line would hide', () => {
    const result = commitsPerWeekCollector.collect(commitInput([
      '2026-04-13', '2026-04-13', '2026-04-13', '2026-04-20',
    ]));
    if (!result.ok) throw new Error('expected a figure');
    expect(result.output.limitations.join(' ')).toContain('busiest week held 3 of the 4');
  });

  it('declines when the log has no dated commits', () => {
    expect(commitsPerWeekCollector.collect(commitInput([]))).toMatchObject({ ok: false, reason: 'no_commits' });
  });
});
