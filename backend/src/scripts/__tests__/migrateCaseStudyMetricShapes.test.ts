import { proposeShape } from '../migrateCaseStudyMetricShapes';

/**
 * The migration's parser, tested on the strings the live library actually holds.
 *
 * THE POINT OF THESE TESTS IS THE REFUSALS. A migration that shapes everything
 * has guessed at something, and a wrong shape draws a confident picture of a
 * number that does not mean that. Half the cases below assert that a value is
 * LEFT ALONE.
 */

const row = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  case_study_id: 'cs1',
  metric_key: 'k',
  label: 'A figure',
  value_display: null,
  numeric_value: null,
  unit: null,
  shape: null,
  publishable: false,
  ...over,
} as never);

const shapeOf = (value: string) => proposeShape(row({ value_display: value }));

describe('metric shape migration parser', () => {
  it('reads the string this whole feature exists because of', () => {
    const out = shapeOf('4 of 7');
    expect(out).toMatchObject({ shape: 'ratio', payload: { numerator: 4, denominator: 7 } });
  });

  it('reads the other ways people write a ratio', () => {
    expect(shapeOf('4 out of 7')).toMatchObject({ shape: 'ratio' });
    expect(shapeOf('4 / 7')).toMatchObject({ shape: 'ratio' });
  });

  it('tries ratio BEFORE count, or "4 of 7" silently becomes the number 4', () => {
    // That information loss is exactly what shapes were built to reverse.
    expect(shapeOf('4 of 7')).toMatchObject({ shape: 'ratio' });
  });

  it('reads a percentage as a share', () => {
    expect(shapeOf('28.6%')).toMatchObject({
      shape: 'share', payload: { numerator: 28.6, denominator: 100 },
    });
  });

  it('reads a count that carries its own noun', () => {
    expect(shapeOf('14 decision records')).toMatchObject({
      shape: 'count', payload: { value: 14 },
    });
  });

  it('reads two dates as a span', () => {
    expect(shapeOf('2026-04-13 to 2026-05-01')).toMatchObject({
      shape: 'span', payload: { startDate: '2026-04-13', endDate: '2026-05-01' },
    });
  });

  it('refuses a ratio larger than its own total', () => {
    // Not a typo to be helpfully corrected. A value this script does not
    // understand, and understanding it wrongly is worse than leaving it.
    expect(shapeOf('12 of 7')).toMatchObject({ reason: expect.stringContaining('no rule') });
  });

  it('refuses a percentage above 100', () => {
    expect(shapeOf('140%')).toMatchObject({ reason: expect.stringContaining('no rule') });
  });

  it('refuses reversed dates', () => {
    expect(shapeOf('2026-05-01 to 2026-04-13')).toMatchObject({ reason: expect.stringContaining('no rule') });
  });

  it('refuses a prose value rather than fishing a number out of it', () => {
    expect(shapeOf('40 to 12 minutes, down from a manual triage')).toMatchObject({
      reason: expect.stringContaining('no rule'),
    });
  });

  it('leaves an already-shaped metric alone', () => {
    expect(proposeShape(row({ value_display: '4 of 7', shape: 'ratio' })))
      .toMatchObject({ reason: 'already shaped as ratio' });
  });

  it('leaves a metric with no display value alone', () => {
    expect(proposeShape(row({ value_display: '   ' })))
      .toMatchObject({ reason: 'no display value to read' });
  });

  it('never proposes a series, because no display string was ever one', () => {
    const values = ['4 of 7', '28.6%', '14 records', '2026-04-13 to 2026-05-01', '78'];
    for (const v of values) {
      const out = shapeOf(v);
      expect('shape' in out && out.shape).not.toBe('series');
    }
  });

  it('never proposes plain language, at all', () => {
    // The one thing a parser cannot produce: what a figure means to a reader.
    const out = shapeOf('4 of 7');
    expect(JSON.stringify(out)).not.toContain('plain');
    expect(JSON.stringify(out)).not.toContain('cannotShow');
  });
});
