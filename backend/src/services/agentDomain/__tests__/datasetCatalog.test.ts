/**
 * The dataset catalog — the loader's failure behaviour, and the picker's ranking.
 *
 * Two things are worth asserting here and they are asserted for different reasons.
 *
 * The LOADER's contract is that it never rejects. A throw out of it would surface as a 500 on a
 * filing and teach an intern the form is broken when the truth is that a metadata table is
 * unavailable. So the test that matters is the one where the query blows up.
 *
 * The SEARCH is pure and is the thing a builder actually interacts with, keystroke by keystroke.
 * Its ranking is asserted against the realistic query — a short prefix that matches a dozen table
 * names and a column on a dozen more — because that is where a wrong order is worst.
 */

import {
  DATASET_SEARCH_LIMIT,
  DATASET_SEARCH_LIMIT_MAX,
  MAX_COLUMNS_PER_ENTRY,
  datasetNames,
  loadDatasetCatalog,
  searchDatasetCatalog,
  type DatasetCatalog,
  type DatasetCatalogEntry,
} from '../datasetCatalog';

const entry = (over: Partial<DatasetCatalogEntry> & { table_name: string }): DatasetCatalogEntry => ({
  schema_name: 'public',
  column_count: 3,
  columns: [],
  status: 'scanned',
  last_scanned: '2026-11-14',
  ...over,
});

const catalogOf = (datasets: DatasetCatalogEntry[]): DatasetCatalog => ({
  datasets,
  catalog_absent: datasets.length === 0,
});

/** A Sequelize stand-in. Only `query` is reached, so only `query` is provided. */
const fakeDb = (impl: () => Promise<unknown>) => ({ query: impl } as never);

describe('loadDatasetCatalog — CANNOT REJECT, because a filing must not 500 on metadata', () => {
  let warn: jest.SpyInstance;
  beforeEach(() => { warn = jest.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => { warn.mockRestore(); });

  it('reports catalog_absent instead of throwing when the query fails', async () => {
    const result = await loadDatasetCatalog(fakeDb(() => Promise.reject(new TypeError('no table'))));
    expect(result.catalog_absent).toBe(true);
    expect(result.datasets).toEqual([]);
  });

  it('logs the error CLASS and a message, never a silent swallow', async () => {
    await loadDatasetCatalog(fakeDb(() => Promise.reject(new TypeError('no such table'))));
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(warn.mock.calls[0][0] as string);
    expect(logged.event).toBe('dataset_catalog_unreadable');
    expect(logged.outcome).toBe('failure');
    expect(logged.error_class).toBe('TypeError');
    expect(logged.context.message).toContain('no such table');
  });

  it('treats an EMPTY catalog as absent, because a gate cannot tell the two apart', async () => {
    const result = await loadDatasetCatalog(fakeDb(() => Promise.resolve([])));
    expect(result.catalog_absent).toBe(true);
  });

  it('projects a row into the picker shape, with no row count anywhere in it', async () => {
    const result = await loadDatasetCatalog(fakeDb(() => Promise.resolve([{
      table_name: '  leads  ',
      schema_name: null,
      column_count: 14,
      semantic_types: { id: 'identifier', email: 'email', source: 'category' },
      status: null,
      last_scanned: new Date('2026-11-14T06:00:00.000Z'),
      // Present on the real row and deliberately not selected into the response.
      row_count: 48213,
    }])));

    expect(result.catalog_absent).toBe(false);
    const [only] = result.datasets;
    expect(only.table_name).toBe('leads');
    expect(only.schema_name).toBe('public');
    expect(only.column_count).toBe(14);
    expect(only.columns).toEqual(['id', 'email', 'source']);
    expect(only.status).toBe('discovered');
    expect(only.last_scanned).toBe('2026-11-14');
    // THE PRIVACY ASSERTION. How many rows are in `leads` is a business figure, and this endpoint
    // hands its response to every holder of the `dashboard` section.
    expect(Object.keys(only)).not.toContain('row_count');
    expect(JSON.stringify(result)).not.toContain('48213');
  });

  it('falls back to the semantic count when column_count was never written', async () => {
    // 0 columns would read as "empty table", which is a different fact from "never counted".
    const result = await loadDatasetCatalog(fakeDb(() => Promise.resolve([{
      table_name: 'enrollments',
      schema_name: 'public',
      column_count: null,
      semantic_types: { id: 'identifier', student_id: 'identifier' },
      status: 'scanned',
      last_scanned: null,
    }])));
    expect(result.datasets[0].column_count).toBe(2);
    expect(result.datasets[0].last_scanned).toBeNull();
  });

  it('drops a row with no usable table name rather than offering a blank to pick', async () => {
    const result = await loadDatasetCatalog(fakeDb(() => Promise.resolve([
      { table_name: '   ', semantic_types: {}, schema_name: null, column_count: 0, status: null, last_scanned: null },
      { table_name: 'leads', semantic_types: {}, schema_name: null, column_count: 1, status: null, last_scanned: null },
    ])));
    expect(result.datasets.map((d) => d.table_name)).toEqual(['leads']);
  });

  it('bounds the column list, so one wide table cannot return a 400-name response', async () => {
    const wide: Record<string, string> = {};
    for (let i = 0; i < MAX_COLUMNS_PER_ENTRY + 40; i += 1) wide[`c${i}`] = 'text';
    const result = await loadDatasetCatalog(fakeDb(() => Promise.resolve([{
      table_name: 'wide_table',
      schema_name: 'public',
      column_count: Object.keys(wide).length,
      semantic_types: wide,
      status: 'scanned',
      last_scanned: null,
    }])));
    expect(result.datasets[0].columns).toHaveLength(MAX_COLUMNS_PER_ENTRY);
    // The COUNT still tells the truth about the table. Truncating the list is a response bound;
    // reporting 60 columns for a 100-column table would be a wrong fact.
    expect(result.datasets[0].column_count).toBe(MAX_COLUMNS_PER_ENTRY + 40);
  });
});

describe('datasetNames — what the gate checks against', () => {
  it('hands back the names in catalog order', () => {
    expect(datasetNames(catalogOf([entry({ table_name: 'a' }), entry({ table_name: 'b' })])))
      .toEqual(['a', 'b']);
  });

  it('is empty for an absent catalog, which is what makes dataset_roster_absent fire', () => {
    expect(datasetNames(catalogOf([]))).toEqual([]);
  });
});

describe('searchDatasetCatalog — the picker ranking, PURE', () => {
  const CATALOG = catalogOf([
    entry({ table_name: 'leads', columns: ['id', 'email'] }),
    entry({ table_name: 'lead_sources', columns: ['id', 'name'] }),
    entry({ table_name: 'agent_domain_lead_notes', columns: ['id', 'body'] }),
    entry({ table_name: 'enrollments', columns: ['id', 'lead_id', 'student_id'] }),
    entry({ table_name: 'interaction_outcomes', columns: ['id', 'outcome'] }),
  ]);

  it('ranks an exact-or-prefix name above a contains above a COLUMN match', () => {
    // The realistic query. `enrollments` only matches because it has a `lead_id` column, and a
    // builder typing "lead" wants the lead tables first.
    const result = searchDatasetCatalog({ catalog: CATALOG, q: 'lead' });
    expect(result.datasets.map((d) => d.table_name)).toEqual([
      'lead_sources',
      'leads',
      'agent_domain_lead_notes',
      'enrollments',
    ]);
  });

  it('excludes what matches nowhere', () => {
    const result = searchDatasetCatalog({ catalog: CATALOG, q: 'lead' });
    expect(result.datasets.map((d) => d.table_name)).not.toContain('interaction_outcomes');
    expect(result.total_matched).toBe(4);
  });

  it('breaks ties by NAME, so the same query returns the same order every keystroke', () => {
    const once = searchDatasetCatalog({ catalog: CATALOG, q: 'lead' });
    const again = searchDatasetCatalog({
      catalog: catalogOf([...CATALOG.datasets].reverse()),
      q: 'lead',
    });
    expect(again.datasets.map((d) => d.table_name)).toEqual(once.datasets.map((d) => d.table_name));
  });

  it('is case insensitive, because nobody types table names in lower case reliably', () => {
    expect(searchDatasetCatalog({ catalog: CATALOG, q: 'LEADS' }).datasets[0].table_name)
      .toBe('leads');
  });

  it('opens with the head of the catalog on an empty query, not with nothing', () => {
    const result = searchDatasetCatalog({ catalog: CATALOG, q: '' });
    expect(result.datasets).toHaveLength(5);
    expect(result.datasets[0].table_name).toBe('agent_domain_lead_notes');
  });

  it('reports total_matched beside the page, so a picker can say 25 of 148', () => {
    const many = catalogOf(Array.from({ length: 80 }, (_, i) => entry({
      table_name: `lead_table_${String(i).padStart(2, '0')}`,
    })));
    const result = searchDatasetCatalog({ catalog: many, q: 'lead' });
    expect(result.datasets).toHaveLength(DATASET_SEARCH_LIMIT);
    expect(result.total_matched).toBe(80);
    expect(result.catalog_size).toBe(80);
  });

  it('caps a limit nobody should be able to raise from a query string', () => {
    const many = catalogOf(Array.from({ length: 400 }, (_, i) => entry({
      table_name: `t_${String(i).padStart(3, '0')}`,
    })));
    expect(searchDatasetCatalog({ catalog: many, limit: 5000 }).datasets)
      .toHaveLength(DATASET_SEARCH_LIMIT_MAX);
  });

  it('falls back to the default limit on a limit that is not a usable number', () => {
    const many = catalogOf(Array.from({ length: 80 }, (_, i) => entry({
      table_name: `t_${String(i).padStart(2, '0')}`,
    })));
    for (const limit of [0, -4, Number.NaN]) {
      expect(searchDatasetCatalog({ catalog: many, limit }).datasets)
        .toHaveLength(DATASET_SEARCH_LIMIT);
    }
  });

  it('carries catalog_absent through, so the picker can tell empty from unavailable', () => {
    const result = searchDatasetCatalog({ catalog: catalogOf([]), q: 'lead' });
    expect(result.catalog_absent).toBe(true);
    expect(result.datasets).toEqual([]);
    expect(result.total_matched).toBe(0);
  });
});
