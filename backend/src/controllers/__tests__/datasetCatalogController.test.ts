/**
 * The dataset picker endpoint, over the REAL loader and the REAL ranking.
 *
 * Only the database is mocked. Stubbing `loadDatasetCatalog` as well would leave the one thing
 * this handler actually does — turn a query string into a bounded, ranked page and report whether
 * the catalog could be read — asserted against a stub of itself.
 */

const mockQuery = jest.fn();
jest.mock('../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));

import { handleSearchDatasetCatalog } from '../datasetCatalogController';
import { DATASET_SEARCH_LIMIT } from '../../services/agentDomain/datasetCatalog';

const row = (table_name: string, columns: string[] = ['id']) => ({
  table_name,
  schema_name: 'public',
  column_count: columns.length,
  semantic_types: Object.fromEntries(columns.map((c) => [c, 'text'])),
  status: 'scanned',
  last_scanned: null,
  // On the real row and never selected into the response.
  row_count: 99999,
});

function reqRes(query: Record<string, unknown> = {}) {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.body = payload; return this; },
  };
  return { req: { query, admin: { email: 'intern@colaberry.com' } } as never, res };
}

let logSpy: jest.SpyInstance;
let warnSpy: jest.SpyInstance;

beforeEach(() => {
  mockQuery.mockReset();
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { logSpy.mockRestore(); warnSpy.mockRestore(); });

const logged = () => JSON.parse(logSpy.mock.calls[0][0] as string);

describe('GET the dataset catalog', () => {
  it('POSITIVE CONTROL: returns the catalog with no query at all', async () => {
    mockQuery.mockResolvedValue([row('leads'), row('enrollments')]);
    const { req, res } = reqRes();
    await handleSearchDatasetCatalog(req, res as never);
    expect(res.statusCode).toBe(200);
    expect((res.body as { datasets: unknown[] }).datasets).toHaveLength(2);
    expect((res.body as { catalog_absent: boolean }).catalog_absent).toBe(false);
  });

  it('ranks a search the way the picker needs it', async () => {
    mockQuery.mockResolvedValue([
      row('enrollments', ['id', 'lead_id']),
      row('lead_sources'),
      row('leads'),
    ]);
    const { req, res } = reqRes({ q: 'lead' });
    await handleSearchDatasetCatalog(req, res as never);
    expect((res.body as { datasets: Array<{ table_name: string }> }).datasets.map((d) => d.table_name))
      .toEqual(['lead_sources', 'leads', 'enrollments']);
  });

  it('NEVER returns a row count, which is a business figure and not a column name', async () => {
    mockQuery.mockResolvedValue([row('leads')]);
    const { req, res } = reqRes();
    await handleSearchDatasetCatalog(req, res as never);
    expect(JSON.stringify(res.body)).not.toContain('99999');
    expect(JSON.stringify(res.body)).not.toContain('row_count');
  });

  it('answers 200 with catalog_absent rather than 503, so a picker can tell empty from broken', async () => {
    // An empty list with a plain 200 and no flag renders as "no matches", and the builder retypes
    // a search term that was never the problem.
    mockQuery.mockRejectedValue(new TypeError('relation does not exist'));
    const { req, res } = reqRes({ q: 'lead' });
    await handleSearchDatasetCatalog(req, res as never);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      datasets: [], total_matched: 0, catalog_size: 0, catalog_absent: true,
    });
  });

  it('logs the absent catalog as partial rather than success', async () => {
    mockQuery.mockRejectedValue(new TypeError('relation does not exist'));
    const { req, res } = reqRes();
    await handleSearchDatasetCatalog(req, res as never);
    expect(logged().outcome).toBe('partial');
    expect(logged().level).toBe('warn');
  });

  it('reports total_matched beside a bounded page', async () => {
    mockQuery.mockResolvedValue(
      Array.from({ length: 60 }, (_, i) => row(`lead_t_${String(i).padStart(2, '0')}`)),
    );
    const { req, res } = reqRes({ q: 'lead' });
    await handleSearchDatasetCatalog(req, res as never);
    const body = res.body as { datasets: unknown[]; total_matched: number };
    expect(body.datasets).toHaveLength(DATASET_SEARCH_LIMIT);
    expect(body.total_matched).toBe(60);
  });

  it('coerces a limit out of the query string, because a query string is always text', async () => {
    mockQuery.mockResolvedValue([row('a'), row('b'), row('c')]);
    const { req, res } = reqRes({ limit: '2' });
    await handleSearchDatasetCatalog(req, res as never);
    expect((res.body as { datasets: unknown[] }).datasets).toHaveLength(2);
  });

  it('refuses a limit above the cap with a 400 rather than silently clamping it', async () => {
    const { req, res } = reqRes({ limit: '5000' });
    await handleSearchDatasetCatalog(req, res as never);
    expect(res.statusCode).toBe(400);
    // And it never reached the database, so a bad query string cannot cost a 633-row read.
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('refuses a misspelled parameter as a 400, never as a silently ignored intent', async () => {
    // The house rule `agentChangeRequestSchema.ts` records: a silently ignored instruction is
    // worse than a 400. On a picker, `?querry=lead` would return the whole catalog and look fine.
    const { req, res } = reqRes({ querry: 'lead' });
    await handleSearchDatasetCatalog(req, res as never);
    expect(res.statusCode).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('logs no search term as null rather than omitting the field', async () => {
    mockQuery.mockResolvedValue([row('leads')]);
    const { req, res } = reqRes();
    await handleSearchDatasetCatalog(req, res as never);
    expect(logged().context.q).toBeNull();
    expect(logged().context.catalog_size).toBe(1);
  });

  it('writes a read-only handler: no create, update or delete reaches the database', async () => {
    mockQuery.mockResolvedValue([row('leads')]);
    const { req, res } = reqRes({ q: 'lead' });
    await handleSearchDatasetCatalog(req, res as never);
    const sqls = (mockQuery.mock.calls as Array<[string]>).map(([sql]) => sql);
    expect(sqls).toHaveLength(1);
    expect(sqls[0]).toMatch(/^\s*SELECT/);
    for (const forbidden of [/INSERT/i, /UPDATE/i, /DELETE/i, /ALTER/i, /DROP/i]) {
      expect(sqls[0]).not.toMatch(forbidden);
    }
  });
});
