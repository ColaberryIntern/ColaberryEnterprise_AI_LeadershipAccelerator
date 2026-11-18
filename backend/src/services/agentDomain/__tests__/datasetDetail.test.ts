/**
 * The dataset drill-in. The tests that matter are the ones about what does NOT come back.
 *
 * `shapeDatasetDetail` is the only thing between a profiler's JSONB blob and a screen every
 * holder of the `dashboard` section can open, so "a value cannot get through" is asserted
 * directly, and asserted again with a plan that WOULD leak one to prove the assertion is real.
 */
import {
  MAX_DETAIL_COLUMNS,
  shapeDatasetDetail,
  type DatasetDetailRow,
} from '../datasetDetail';

function row(over: Partial<DatasetDetailRow> = {}): DatasetDetailRow {
  return {
    table_name: 'enrollments',
    schema_name: 'public',
    column_count: 4,
    row_count: 1886,
    semantic_types: {
      id: 'identifier', student_email: 'email', enrolled_at: 'timestamp', amount: 'currency',
    },
    relationships: [{ to_table: 'students', from_column: 'student_email', to_column: 'email' }],
    status: 'profiled',
    last_scanned: '2026-11-14T03:00:00Z',
    ...over,
  };
}

describe('the shape a builder needs', () => {
  it('returns column names with the kind of thing each one holds', () => {
    const d = shapeDatasetDetail(row());
    expect(d.columns).toEqual([
      { name: 'id', semantic_type: 'identifier' },
      { name: 'student_email', semantic_type: 'email' },
      { name: 'enrolled_at', semantic_type: 'timestamp' },
      { name: 'amount', semantic_type: 'currency' },
    ]);
  });

  it('keeps the scanner’s column order, because that is how a schema reads', () => {
    const d = shapeDatasetDetail(row({
      semantic_types: { zzz: 'text', aaa: 'identifier' },
      column_count: 2,
    }));
    expect(d.columns.map((c) => c.name)).toEqual(['zzz', 'aaa']);
  });

  it('returns the row count, which is the fact that changes the decision', () => {
    expect(shapeDatasetDetail(row()).row_count).toBe(1886);
  });

  it('keeps declared joins as names, and drops anything it cannot read as one', () => {
    const d = shapeDatasetDetail(row({
      relationships: [
        { to_table: 'students', from_column: 'student_email', to_column: 'email' },
        {},
        'students',
        { note: 'see the docs' },
        { table: 'payments' },
      ] as never,
    }));
    expect(d.relationships).toEqual([
      { to_table: 'students', from_column: 'student_email', to_column: 'email' },
      { to_table: 'payments', from_column: null, to_column: null },
    ]);
  });
});

describe('what must never come back', () => {
  it('has no field for sampled values at all', () => {
    const d = shapeDatasetDetail(row());
    expect(Object.keys(d).sort()).toEqual([
      'column_count', 'columns', 'columns_incomplete', 'last_scanned',
      'relationships', 'row_count', 'schema_name', 'status', 'table_name',
    ]);
  });

  it('drops a semantic "type" that is really a sampled value', () => {
    // This is the failure mode the guard exists for: a profiler that writes examples into the
    // type map instead of a label. Each of these would put a real person on screen.
    const d = shapeDatasetDetail(row({
      semantic_types: {
        student_email: { type: 'email', min: 'aaron@example.com', max: 'zoe@example.com' } as never,
        full_name: ['Vestine Nimenya', 'Kalkidan K'] as never,
        notes: 'a free text label that is far too long to be a semantic type and is plainly prose',
        amount: 'currency',
      },
    }));
    expect(d.columns).toEqual([
      { name: 'student_email', semantic_type: null },
      { name: 'full_name', semantic_type: null },
      { name: 'notes', semantic_type: null },
      { name: 'amount', semantic_type: 'currency' },
    ]);
    expect(JSON.stringify(d)).not.toContain('aaron@example.com');
    expect(JSON.stringify(d)).not.toContain('Vestine');
  });

  it('the guard is real: a 41-character label is dropped, a 40-character one is kept', () => {
    const d = shapeDatasetDetail(row({
      semantic_types: { a: 'x'.repeat(40), b: 'y'.repeat(41) },
      column_count: 2,
    }));
    expect(d.columns[0].semantic_type).toBe('x'.repeat(40));
    expect(d.columns[1].semantic_type).toBeNull();
  });

  it('never selects profile_summary, so a blob cannot reach the response', () => {
    // Asserted against the SQL rather than the shaper, because the shaper could not drop a field
    // the query never asked for, and the query is the thing that would have to change to leak it.
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const source: string = require('fs').readFileSync(
      require('path').join(__dirname, '..', 'datasetDetail.ts'), 'utf8',
    );
    const select = source.slice(source.indexOf('`SELECT'), source.indexOf('LIMIT 1'));
    expect(select).not.toContain('profile_summary');
    expect(select).toContain('semantic_types');
  });

  it('bounds the column list so one wide table cannot return hundreds', () => {
    const wide: Record<string, string> = {};
    for (let i = 0; i < MAX_DETAIL_COLUMNS + 25; i += 1) wide[`c${i}`] = 'text';
    const d = shapeDatasetDetail(row({ semantic_types: wide, column_count: MAX_DETAIL_COLUMNS + 25 }));
    expect(d.columns).toHaveLength(MAX_DETAIL_COLUMNS);
    // And it says the list is short, rather than presenting 200 as the whole table.
    expect(d.columns_incomplete).toBe(true);
    expect(d.column_count).toBe(MAX_DETAIL_COLUMNS + 25);
  });
});

describe('what is not known is not guessed', () => {
  it('an unscanned row count is null, never zero', () => {
    expect(shapeDatasetDetail(row({ row_count: null })).row_count).toBeNull();
  });

  it('a real zero stays zero, because an empty table is a fact', () => {
    expect(shapeDatasetDetail(row({ row_count: 0 })).row_count).toBe(0);
  });

  it('an unscanned date is null, never today', () => {
    expect(shapeDatasetDetail(row({ last_scanned: null })).last_scanned).toBeNull();
  });

  it('says so when the declared count exceeds the columns it can name', () => {
    const d = shapeDatasetDetail(row({ column_count: 40 }));
    expect(d.column_count).toBe(40);
    expect(d.columns).toHaveLength(4);
    expect(d.columns_incomplete).toBe(true);
  });

  it('is not "incomplete" when the counts agree', () => {
    expect(shapeDatasetDetail(row()).columns_incomplete).toBe(false);
  });

  it('falls back to the map size when the count was never written', () => {
    const d = shapeDatasetDetail(row({ column_count: null }));
    expect(d.column_count).toBe(4);
    expect(d.columns_incomplete).toBe(false);
  });

  it('defaults an absent schema to public rather than leaving it blank', () => {
    expect(shapeDatasetDetail(row({ schema_name: null })).schema_name).toBe('public');
  });
});
